// supabase/functions/webauthn-auth-options/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateAuthenticationOptions } from "npm:@simplewebauthn/server@13";
import { corsHeaders, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestOrigin = req.headers.get("origin") ?? "";
  const RP_ID = requestOrigin
    ? new URL(requestOrigin).hostname
    : (Deno.env.get("WEBAUTHN_RP_ID") ?? "localhost");

  try {
    const { email, credentialId } = await req.json().catch(() => ({}));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let allowCredentials: { id: string; transports: AuthenticatorTransport[] }[] = [];
    let userId: string | null = null;

    // Fast path: credentialId stored on device — skips the passkey selector
    if (credentialId) {
      const { data: passkey } = await supabase
        .from("passkeys")
        .select("credential_id, transports, user_id")
        .eq("credential_id", credentialId)
        .single();
      if (passkey) {
        userId = passkey.user_id as string;
        allowCredentials = [{ id: passkey.credential_id as string, transports: (passkey.transports ?? []) as AuthenticatorTransport[] }];
      }
    }

    // Email path: all credentials for the user
    if (!allowCredentials.length && email) {
      const { data: uid } = await supabase.rpc("get_user_id_by_email", { p_email: email });
      if (uid) {
        userId = uid as string;
        const { data: keys } = await supabase.from("passkeys").select("credential_id, transports").eq("user_id", userId);
        allowCredentials = (keys ?? []).map((k) => ({ id: k.credential_id as string, transports: (k.transports ?? []) as AuthenticatorTransport[] }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID:             RP_ID,
      allowCredentials: allowCredentials.length > 0 ? allowCredentials : [],
      userVerification: "preferred",
      timeout:          60_000,
    });

    if (userId) {
      await supabase.from("webauthn_challenges").delete().eq("user_id", userId).eq("type", "authentication");
    } else {
      await supabase.from("webauthn_challenges").delete().eq("type", "authentication").lt("expires_at", new Date().toISOString());
    }

    const { error: challengeErr } = await supabase.from("webauthn_challenges").insert({
      challenge:  options.challenge,
      user_id:    userId,
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
