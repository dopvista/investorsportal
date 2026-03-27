// supabase/functions/webauthn-auth-verify/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuthenticationResponse } from "npm:@simplewebauthn/server@13";
import { corsHeaders, json, decodeBase64URL } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestOrigin = req.headers.get("origin") ?? "";
  const RP_ID = requestOrigin
    ? new URL(requestOrigin).hostname
    : (Deno.env.get("WEBAUTHN_RP_ID") ?? "localhost");
  const ORIGINS = requestOrigin
    ? [requestOrigin]
    : (Deno.env.get("WEBAUTHN_ORIGIN") ?? `https://${RP_ID}`).split(",").map((s) => s.trim());

  try {
    const { authenticationResponse } = await req.json();
    if (!authenticationResponse?.id) return json({ error: "Missing authentication response" }, 400);

    const credentialId = authenticationResponse.id as string;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: passkey, error: pkErr } = await supabase
      .from("passkeys")
      .select("id, user_id, public_key, counter, transports")
      .eq("credential_id", credentialId)
      .single();

    if (pkErr || !passkey) return json({ error: "Passkey not found. Please sign in with email & password first." }, 404);

    // Look up challenge for this user
    let { data: ch } = await supabase
      .from("webauthn_challenges")
      .select("id, challenge, expires_at")
      .eq("user_id", passkey.user_id)
      .eq("type", "authentication")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Fallback: discoverable-flow challenge (user_id is null)
    if (!ch) {
      const { data: globalCh } = await supabase
        .from("webauthn_challenges")
        .select("id, challenge, expires_at")
        .eq("type", "authentication")
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      ch = globalCh ?? null;
    }

    if (!ch) return json({ error: "Challenge not found. Please try again." }, 400);
    if (new Date(ch.expires_at) < new Date()) {
      await supabase.from("webauthn_challenges").delete().eq("id", ch.id);
      return json({ error: "Challenge expired. Please try again." }, 400);
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response:          authenticationResponse,
        expectedChallenge: ch.challenge,
        expectedOrigin:    ORIGINS,
        expectedRPID:      RP_ID,
        credential: {
          id:         credentialId,
          publicKey:  decodeBase64URL(passkey.public_key as string),
          counter:    passkey.counter as number,
          transports: (passkey.transports ?? []) as AuthenticatorTransport[],
        },
      });
    } catch (verifyErr) {
      console.error("Auth verify error:", verifyErr);
      return json({ error: "Biometric verification failed: " + (verifyErr as Error).message }, 400);
    } finally {
      await supabase.from("webauthn_challenges").delete().eq("id", ch.id);
    }

    if (!verification.verified) return json({ error: "Biometric verification failed" }, 400);

    await supabase.from("passkeys").update({
      counter:      verification.authenticationInfo.newCounter,
      last_used_at: new Date().toISOString(),
    }).eq("id", passkey.id);

    // Use the GoTrue admin REST endpoint directly — avoids supabase-js version issues
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const sessionRes = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${passkey.user_id}/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        },
      },
    );

    if (!sessionRes.ok) {
      const errBody = await sessionRes.text();
      console.error("Session creation error:", sessionRes.status, errBody);
      return json({ error: `Session creation failed (${sessionRes.status}): ${errBody}` }, 500);
    }

    const session = await sessionRes.json();
    return json({
      access_token:  session.access_token,
      refresh_token: session.refresh_token,
      expires_in:    session.expires_in,
      token_type:    session.token_type ?? "bearer",
      user:          session.user,
    });
  } catch (err) {
    console.error("webauthn-auth-verify:", err);
    return json({ error: (err as Error).message ?? "Internal server error" }, 500);
  }
});
