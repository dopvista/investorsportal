// supabase/functions/create-user/index.ts
// Supabase Edge Function — creates a new auth user using the service role key.
// Called only by SA/AD from the User Management page.
// The service role key lives in Supabase secrets — never exposed to the browser.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Verify caller is authenticated ─────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Build admin client using service role key ───────────────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // ── 3. Build caller client to verify SA/AD role ────────────────
    const supabaseCaller = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Check caller's role — only SA and AD can create users
    const { data: roleData, error: roleErr } = await supabaseCaller.rpc("get_my_role");
    if (roleErr) {
      return new Response(JSON.stringify({ error: "Authentication failed: " + roleErr.message }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["SA", "AD"].includes(roleData)) {
      return new Response(JSON.stringify({ error: "Access denied: only Super Admins and Admins can create users" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Parse request body ──────────────────────────────────────
    const { email, password, cds_number } = await req.json();
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (password.length < 6) {
      return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 5. Create user via Admin API ───────────────────────────────
    // email_confirm: true — skips email confirmation, user can log in immediately
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 6. Create profile row (required for user to appear in the app) ──
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: data.user.id,
        cds_number: cds_number || "",
        account_type: "Individual",
      });

    if (profileErr) {
      // Profile creation failed — delete the orphaned auth user to keep things clean
      await supabaseAdmin.auth.admin.deleteUser(data.user.id);
      return new Response(JSON.stringify({ error: "Failed to create user profile: " + profileErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 7. Return the new user's ID ────────────────────────────────
    return new Response(JSON.stringify({ user: data.user }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
