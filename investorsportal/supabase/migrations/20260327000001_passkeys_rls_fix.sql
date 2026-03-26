-- ── 20260327000001_passkeys_rls_fix.sql ──────────────────────────
-- Ensures the passkeys table has Row Level Security enabled and has
-- both SELECT and DELETE policies for authenticated users.
--
-- Safe to run multiple times — all statements are idempotent.
-- Apply this in the Supabase SQL editor if passkeys reappear after
-- deletion (symptom of a missing RLS DELETE policy).

-- 1. Make sure RLS is on (harmless if already enabled)
ALTER TABLE public.passkeys ENABLE ROW LEVEL SECURITY;

-- 2. SELECT policy — users see only their own passkeys
DO $$ BEGIN
  BEGIN
    CREATE POLICY "passkeys_select_own"
      ON public.passkeys
      FOR SELECT
      USING (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 3. DELETE policy — users delete only their own passkeys
--    This is the critical policy that was missing, causing deletions
--    to be silently blocked and rows to reappear on page refresh.
DO $$ BEGIN
  BEGIN
    CREATE POLICY "passkeys_delete_own"
      ON public.passkeys
      FOR DELETE
      USING (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 4. INSERT / UPDATE are handled by service-role edge functions only.
--    No public policy needed — service role bypasses RLS by default.
