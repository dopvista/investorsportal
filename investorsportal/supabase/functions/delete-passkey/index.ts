// supabase/functions/delete-passkey/index.ts
// Deletes a passkey that belongs to the authenticated user.
// Uses the service role so it works regardless of whether the
// passkeys table RLS DELETE policy has been applied.
// Ownership is enforced here in application logic (user_id = auth.uid()).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── 1. Authenticate caller ─────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    // ── 2. Parse request body ──────────────────────────────────────
    const { id } = await req.json().catch(() => ({}));
    if (!id) return json({ error: "Missing passkey id" }, 400);

    // ── 3. Delete — scoped to the authenticated user ───────────────
    // Using service role bypasses RLS; the user_id filter enforces ownership.
    const { data: deleted, error: deleteErr } = await supabase
      .from("passkeys")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)   // ← ownership check
      .select("id");

    if (deleteErr) {
      console.error("Delete passkey error:", deleteErr);
      return json({ error: deleteErr.message || "Failed to delete passkey" }, 500);
    }

    if (!deleted || deleted.length === 0) {
      return json({ error: "Passkey not found or does not belong to you" }, 404);
    }

    return json({ deleted: true, id });
  } catch (err) {
    console.error("delete-passkey:", err);
    return json({ error: (err as Error).message ?? "Internal server error" }, 500);
  }
});
