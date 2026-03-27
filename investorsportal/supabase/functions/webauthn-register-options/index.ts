// supabase/functions/webauthn-register-options/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateRegistrationOptions } from "npm:@simplewebauthn/server@13";
import { corsHeaders, json } from "../_shared/cors.ts";

const RP_NAME = "Investors Portal";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const requestOrigin = req.headers.get("origin") ?? "";
  const RP_ID = requestOrigin
    ? new URL(requestOrigin).hostname
    : (Deno.env.get("WEBAUTHN_RP_ID") ?? "localhost");

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: existing } = await supabase
      .from("passkeys")
      .select("credential_id, transports")
      .eq("user_id", user.id);

    const excludeCredentials = (existing ?? []).map((p) => ({
      id: p.credential_id as string,
      transports: (p.transports ?? []) as AuthenticatorTransport[],
    }));

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID:   RP_ID,
      userID:          new TextEncoder().encode(user.id),
      userName:        user.email ?? user.id,
      userDisplayName: user.email ?? user.id,
      attestationType: "none",
      excludeCredentials,
      authenticatorSelection: {
        residentKey:      "preferred",
        userVerification: "preferred",
      },
      timeout: 60_000,
    });

    await supabase.from("webauthn_challenges").delete()
      .eq("user_id", user.id).eq("type", "registration");

    const { error: challengeErr } = await supabase.from("webauthn_challenges").insert({
      challenge:  options.challenge,
      user_id:    user.id,
      type:       "registration",
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });

    if (challengeErr) {
      console.error("Challenge insert error:", challengeErr);
      return json({ error: "Failed to create challenge" }, 500);
    }

    return json(options);
  } catch (err) {
    console.error("webauthn-register-options:", err);
    return json({ error: (err as Error).message ?? "Internal server error" }, 500);
  }
});
