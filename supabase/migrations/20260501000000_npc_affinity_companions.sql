-- =============================================================
-- NPC Affinity + Companions tables
-- Run in Supabase Dashboard SQL Editor
-- =============================================================

-- 1. NPC Affinity
CREATE TABLE IF NOT EXISTS public.npc_affinity (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  npc_id       text        NOT NULL,
  affinity_xp  integer     NOT NULL DEFAULT 0,
  affinity_level integer   NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, npc_id)
);

ALTER TABLE public.npc_affinity ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'npc_affinity'
      AND policyname  = 'Users manage own npc_affinity'
  ) THEN
    CREATE POLICY "Users manage own npc_affinity"
      ON public.npc_affinity
      FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 2. Companions
CREATE TABLE IF NOT EXISTS public.companions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  companion_type    text        NOT NULL DEFAULT 'fox',
  name              text        NOT NULL DEFAULT 'Companheiro',
  level             integer     NOT NULL DEFAULT 1,
  xp                integer     NOT NULL DEFAULT 0,
  mood              integer     NOT NULL DEFAULT 80,
  last_fed_at       timestamptz,
  last_played_at    timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.companions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'companions'
      AND policyname  = 'Users manage own companion'
  ) THEN
    CREATE POLICY "Users manage own companion"
      ON public.companions
      FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
