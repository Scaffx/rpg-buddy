-- ============================================================
-- Search profiles SECURITY DEFINER + Co-Op Missions system
-- ============================================================

-- SECURITY DEFINER function para buscar perfis sem RLS bloqueando
CREATE OR REPLACE FUNCTION search_profiles(p_query text, p_exclude_id uuid DEFAULT NULL, p_limit int DEFAULT 10)
RETURNS TABLE (
  user_id      uuid,
  display_name text,
  level        int,
  starter_class text,
  avatar_url   text
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT user_id, display_name, level, starter_class, avatar_url
  FROM public.profiles
  WHERE display_name ILIKE ('%' || p_query || '%')
    AND (p_exclude_id IS NULL OR user_id <> p_exclude_id)
  ORDER BY level DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION search_profiles(text, uuid, int) TO authenticated;

-- Missões em conjunto
CREATE TABLE IF NOT EXISTS public.co_op_missions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  description     text        NOT NULL DEFAULT '',
  xp_per_player   int         NOT NULL DEFAULT 25,
  max_players     int         NOT NULL DEFAULT 5 CHECK (max_players BETWEEN 2 AND 5),
  status          text        NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open', 'active', 'completed', 'cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE TABLE IF NOT EXISTS public.co_op_mission_members (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id      uuid        NOT NULL REFERENCES public.co_op_missions(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  completed       boolean     NOT NULL DEFAULT false,
  completed_at    timestamptz,
  xp_claimed      boolean     NOT NULL DEFAULT false,
  UNIQUE (mission_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_co_op_members_mission ON public.co_op_mission_members (mission_id);
CREATE INDEX IF NOT EXISTS idx_co_op_members_user    ON public.co_op_mission_members (user_id);

ALTER TABLE public.co_op_missions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.co_op_mission_members ENABLE ROW LEVEL SECURITY;

-- RLS policies co_op_missions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'co_op_missions' AND policyname = 'members_see_missions') THEN
    CREATE POLICY "members_see_missions" ON public.co_op_missions
      FOR SELECT USING (
        auth.uid() = creator_id OR
        EXISTS (SELECT 1 FROM public.co_op_mission_members m WHERE m.mission_id = id AND m.user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'co_op_missions' AND policyname = 'creator_insert_missions') THEN
    CREATE POLICY "creator_insert_missions" ON public.co_op_missions
      FOR INSERT WITH CHECK (auth.uid() = creator_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'co_op_missions' AND policyname = 'creator_update_missions') THEN
    CREATE POLICY "creator_update_missions" ON public.co_op_missions
      FOR UPDATE USING (auth.uid() = creator_id);
  END IF;
END $$;

-- RLS policies co_op_mission_members
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'co_op_mission_members' AND policyname = 'members_see_own') THEN
    CREATE POLICY "members_see_own" ON public.co_op_mission_members
      FOR SELECT USING (
        auth.uid() = user_id OR
        EXISTS (SELECT 1 FROM public.co_op_missions m WHERE m.id = mission_id AND m.creator_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'co_op_mission_members' AND policyname = 'members_insert_own') THEN
    CREATE POLICY "members_insert_own" ON public.co_op_mission_members
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'co_op_mission_members' AND policyname = 'members_update_own') THEN
    CREATE POLICY "members_update_own" ON public.co_op_mission_members
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- RPC create_co_op_mission
CREATE OR REPLACE FUNCTION create_co_op_mission(
  p_title       text,
  p_description text,
  p_member_ids  uuid[]
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_mission_id uuid;
  v_uid        uuid;
  v_max        int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  v_max := LEAST(5, GREATEST(2, array_length(p_member_ids, 1) + 1));

  INSERT INTO public.co_op_missions (creator_id, title, description, max_players)
  VALUES (v_uid, p_title, p_description, v_max)
  RETURNING id INTO v_mission_id;

  INSERT INTO public.co_op_mission_members (mission_id, user_id)
  VALUES (v_mission_id, v_uid)
  ON CONFLICT DO NOTHING;

  FOR i IN 1..array_length(p_member_ids, 1) LOOP
    INSERT INTO public.co_op_mission_members (mission_id, user_id)
    VALUES (v_mission_id, p_member_ids[i])
    ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE public.co_op_missions SET status = 'active' WHERE id = v_mission_id;

  RETURN v_mission_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_co_op_mission(text, text, uuid[]) TO authenticated;

-- RPC complete_co_op_mission
CREATE OR REPLACE FUNCTION complete_co_op_mission(p_mission_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid     uuid;
  v_xp      int;
  v_claimed boolean;
  v_total   int;
  v_done    int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT xp_claimed, ms.xp_per_player INTO v_claimed, v_xp
  FROM public.co_op_mission_members m
  JOIN public.co_op_missions ms ON ms.id = m.mission_id
  WHERE m.mission_id = p_mission_id AND m.user_id = v_uid;

  IF NOT FOUND THEN RAISE EXCEPTION 'Você não é membro desta missão'; END IF;
  IF v_claimed THEN RAISE EXCEPTION 'XP já resgatado'; END IF;

  UPDATE public.co_op_mission_members
  SET completed = true, completed_at = now(), xp_claimed = true
  WHERE mission_id = p_mission_id AND user_id = v_uid;

  UPDATE public.profiles
  SET total_xp = total_xp + v_xp
  WHERE user_id = v_uid;

  INSERT INTO public.activity_log (user_id, action, description, xp_gained)
  VALUES (v_uid, 'co_op_mission_completed', 'Missão em conjunto concluída!', v_xp);

  SELECT COUNT(*) INTO v_total FROM public.co_op_mission_members WHERE mission_id = p_mission_id;
  SELECT COUNT(*) INTO v_done  FROM public.co_op_mission_members WHERE mission_id = p_mission_id AND completed = true;

  IF v_done >= v_total THEN
    UPDATE public.co_op_missions
    SET status = 'completed', completed_at = now()
    WHERE id = p_mission_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION complete_co_op_mission(uuid) TO authenticated;
