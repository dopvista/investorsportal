-- ── 20260327000000_webauthn.sql ────────────────────────────────────
-- WebAuthn / Passkeys schema.
-- Safe to run on a DB that already has a `passkeys` table —
-- all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

-- ── webauthn_challenges: short-lived server-side challenges ────────
CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge  TEXT        NOT NULL,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL for discoverable flow
  type       TEXT        NOT NULL CHECK (type IN ('registration', 'authentication')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_wc_user_type
  ON public.webauthn_challenges (user_id, type);

CREATE INDEX IF NOT EXISTS idx_wc_expires
  ON public.webauthn_challenges (expires_at);

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
-- Only edge functions (service role) touch this table — no public policies needed.

-- ── passkeys: stored WebAuthn public-key credentials ───────────────
CREATE TABLE IF NOT EXISTS public.passkeys (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT        NOT NULL UNIQUE,
  public_key    TEXT        NOT NULL,
  counter       BIGINT      NOT NULL DEFAULT 0,
  device_type   TEXT,
  backed_up     BOOLEAN     DEFAULT false,
  transports    TEXT[]      DEFAULT '{}',
  nickname      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);

-- Add any columns that might be missing if the table was created without full schema
DO $$ BEGIN
  BEGIN ALTER TABLE public.passkeys ADD COLUMN IF NOT EXISTS public_key    TEXT   NOT NULL DEFAULT ''; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE public.passkeys ADD COLUMN IF NOT EXISTS counter        BIGINT NOT NULL DEFAULT 0;  EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE public.passkeys ADD COLUMN IF NOT EXISTS transports     TEXT[] DEFAULT '{}';         EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE public.passkeys ADD COLUMN IF NOT EXISTS device_type    TEXT;                        EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE public.passkeys ADD COLUMN IF NOT EXISTS backed_up      BOOLEAN DEFAULT false;       EXCEPTION WHEN others THEN NULL; END;
END $$;

CREATE INDEX IF NOT EXISTS idx_passkeys_user_id
  ON public.passkeys (user_id);

CREATE INDEX IF NOT EXISTS idx_passkeys_credential_id
  ON public.passkeys (credential_id);

ALTER TABLE public.passkeys ENABLE ROW LEVEL SECURITY;

-- Users can read and delete their own passkeys (insert/update via service role in edge fns)
DO $$ BEGIN
  BEGIN
    CREATE POLICY "passkeys_select_own" ON public.passkeys
      FOR SELECT USING (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL; END;

  BEGIN
    CREATE POLICY "passkeys_delete_own" ON public.passkeys
      FOR DELETE USING (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- ── Helper: look up a user ID by email ────────────────────────────
-- Used by webauthn-auth-options edge function (which runs without a user JWT).
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id FROM auth.users WHERE email = p_email LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_id_by_email TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email FROM anon, authenticated;
