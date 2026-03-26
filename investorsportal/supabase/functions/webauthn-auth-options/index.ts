// supabase/functions/webauthn-auth-options/index.ts
// Step 1 of passkey authentication: generate WebAuthn assertion options.
// Called BEFORE the user has a session (no auth header required).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateAuthenticationOptions } from "npm:@simplewebauthn/server@9";
import { corsHeaders, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Derive RP_ID from the request's Origin header so both localhost (dev) and
  // the production domain work without separate deployments.
  const requestOrigin = req.headers.get("origin") ?? "";
  const RP_ID = requestOrigin
    ? new URL(requestOrigin).hostname
    : (Deno.env.get("WEBAUTHN_RP_ID") ?? "localhost");

  try {
    const { email } = await req.json().catch(() => ({}));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let allowCredentials: { id: string; transports: AuthenticatorTransport[] }[] = [];
    let userId: string | null = null;

    // ── Resolve user + credentials when email is provided ─────────
    // This enables a more focused credential prompt (user picks one of THEIR keys).
    // Without email (discoverable flow), the browser shows all available passkeys.
    if (email) {
      const { data: uid } = await supabase.rpc("get_user_id_by_email", { p_email: email });
      if (uid) {
        userId = uid as string;
        const { data: keys } = await supabase
          .from("passkeys")
          .select("credential_id, transports")
          .eq("user_id", userId);

        allowCredentials = (keys ?? []).map((k) => ({
          id:         k.credential_id as string,
          transports: (k.transports ?? []) as AuthenticatorTransport[],
        }));
      }
    }

    // ── Generate authentication options ───────────────────────────
    const options = await generateAuthenticationOptions({
      rpID:             RP_ID,
      allowCredentials: allowCredentials.length > 0 ? allowCredentials : [],
      userVerification: "preferred",
      timeout:          60_000,
    });

    // ── Persist challenge ──────────────────────────────────────────
    // Clean up stale auth challenges for this user (or expired global ones)
    if (userId) {
      await supabase
        .from("webauthn_challenges")
        .delete()
        .eq("user_id", userId)
        .eq("type", "authentication");
    } else {
      // Clean up global expired challenges
      await supabase
        .from("webauthn_challenges")
        .delete()
        .eq("type", "authentication")
        .lt("expires_at", new Date().toISOString());
    }

    const { error: challengeErr } = await supabase
      .from("webauthn_challenges")
      .insert({
        challenge:  options.challenge,
        user_id:    userId, // null for discoverable flow
        type:       "authentication",
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      });

    if (challengeErr) {
      console.error("Challenge insert error:", challengeErr);
      return json({ error: "Failed to create challenge" }, 500);
    }

    return json(options);
  } catch (err) {
    console.error("webauthn-auth-options:", err);
    return json({ error: (err as Error).message ?? "Internal server error" }, 500);
  }
});
