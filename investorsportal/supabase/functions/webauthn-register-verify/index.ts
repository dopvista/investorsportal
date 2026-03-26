// supabase/functions/webauthn-register-verify/index.ts
// Step 2 of passkey registration: verify the browser's credential response
// and store the public key in the passkeys table.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyRegistrationResponse } from "npm:@simplewebauthn/server@9";
import { corsHeaders, json, encodeBase64URL } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Derive RP_ID + expectedOrigin from the request so both localhost (dev) and
  // production work without re-deploying or changing secrets.
  const requestOrigin = req.headers.get("origin") ?? "";
  const RP_ID = requestOrigin
    ? new URL(requestOrigin).hostname
    : (Deno.env.get("WEBAUTHN_RP_ID") ?? "localhost");
  const ORIGINS = requestOrigin
    ? [requestOrigin]
    : (Deno.env.get("WEBAUTHN_ORIGIN") ?? `https://${RP_ID}`).split(",").map((s) => s.trim());

  try {
    // ── 1. Authenticate the caller ─────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { registrationResponse, nickname = "My Device" } = await req.json();
    if (!registrationResponse) return json({ error: "Missing registrationResponse" }, 400);

    // ── 2. Retrieve the stored challenge ──────────────────────────
    const { data: ch, error: chErr } = await supabase
      .from("webauthn_challenges")
      .select("id, challenge, expires_at")
      .eq("user_id", user.id)
      .eq("type", "registration")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (chErr || !ch) {
      return json({ error: "Challenge not found. Please start registration again." }, 400);
    }
    if (new Date(ch.expires_at) < new Date()) {
      await supabase.from("webauthn_challenges").delete().eq("id", ch.id);
      return json({ error: "Challenge expired. Please try again." }, 400);
    }

    // ── 3. Verify the registration response ───────────────────────
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response:          registrationResponse,
        expectedChallenge: ch.challenge,
        expectedOrigin:    ORIGINS,
        expectedRPID:      RP_ID,
        requireUserVerification: false,
      });
    } catch (verifyErr) {
      console.error("Registration verify error:", verifyErr);
      return json({ error: "Verification failed: " + (verifyErr as Error).message }, 400);
    } finally {
      // Always consume the challenge (one-time use)
      await supabase.from("webauthn_challenges").delete().eq("id", ch.id);
    }

    if (!verification.verified || !verification.registrationInfo) {
      return json({ error: "Registration could not be verified" }, 400);
    }

    const { credential } = verification.registrationInfo;

    // ── 4. Store the passkey ───────────────────────────────────────
    const { error: insertErr } = await supabase.from("passkeys").insert({
      user_id:       user.id,
      credential_id: credential.id,                           // base64url string
      public_key:    encodeBase64URL(credential.publicKey),   // Uint8Array → base64url
      counter:       credential.counter,
      device_type:   credential.deviceType,
      backed_up:     credential.backedUp,
      transports:    credential.transports ?? [],
      nickname,
    });

    if (insertErr) {
      console.error("Passkey insert error:", insertErr);
      return json({ error: "Failed to save passkey: " + insertErr.message }, 500);
    }

    return json({ verified: true, credentialId: credential.id });
  } catch (err) {
    console.error("webauthn-register-verify:", err);
    return json({ error: (err as Error).message ?? "Internal server error" }, 500);
  }
});
