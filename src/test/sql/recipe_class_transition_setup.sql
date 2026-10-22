-- Execute after the Receitas migration in the reduced PG17 fixture.
-- Recreate the relevant protected class path and public advancement contract.
\set ON_ERROR_STOP on
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permanent_strength integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS permanent_intelligence integer NOT NULL DEFAULT 9;
UPDATE public.classes SET column_index=1,level_min=1,parent_class_id=NULL
WHERE id='00000001-0000-0000-0000-000000000001';
INSERT INTO public.classes(id,parent_class_id,column_index,level_min) VALUES
('00000002-0000-0000-0000-000000000002',
 '00000001-0000-0000-0000-000000000001',2,5),
('00000002-0000-0000-0000-000000000001',
 '00000001-0000-0000-0000-000000000001',2,5);
CREATE OR REPLACE FUNCTION app_private.base_class_id(p_starter text)
RETURNS uuid LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog AS $$
  SELECT CASE p_starter
    WHEN 'guerreiro' THEN '00000002-0000-0000-0000-000000000001'
    WHEN 'mago' THEN '00000002-0000-0000-0000-000000000002'
  END::uuid;
$$;
REVOKE ALL ON FUNCTION app_private.base_class_id(text) FROM PUBLIC,anon,authenticated;

-- The apprentice's protected identity has an initial Mago path. The existing
-- level-one battle snapshot remains Aprendiz until the public advance RPC.
UPDATE public.profiles SET starter_class='mago'
WHERE user_id='33333333-3333-3333-3333-333333333333';
INSERT INTO app_private.hero_class_identity
  (user_id,starter_class,current_class_id)
VALUES ('33333333-3333-3333-3333-333333333333','mago',
        '00000001-0000-0000-0000-000000000001');

CREATE FUNCTION app_private.advance_hero_class_core(p_class_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app_private AS $$
DECLARE v_uid uuid := auth.uid(); v_profile public.profiles%ROWTYPE;
        v_identity app_private.hero_class_identity%ROWTYPE;
        v_target public.classes%ROWTYPE; v_current public.classes%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  SELECT * INTO v_identity FROM app_private.hero_class_identity WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND OR v_profile.starter_class IS DISTINCT FROM v_identity.starter_class
     OR v_profile.current_class_id IS DISTINCT FROM v_identity.current_class_id THEN
    RAISE EXCEPTION 'CLASS_IDENTITY_REQUIRED';
  END IF;
  SELECT * INTO v_target FROM public.classes WHERE id=p_class_id;
  IF NOT FOUND OR v_target.level_min > v_profile.level OR v_target.column_index < 2
     OR NOT app_private.class_path_matches(p_class_id,v_identity.starter_class,v_profile.level)
  THEN RAISE EXCEPTION 'CLASS_LEVEL_OR_BRANCH_LOCKED'; END IF;
  IF v_identity.current_class_id IS NULL OR
     v_identity.current_class_id='00000001-0000-0000-0000-000000000001'::uuid THEN
    IF v_target.column_index <> 2 OR
       v_target.id <> app_private.base_class_id(v_identity.starter_class)
    THEN RAISE EXCEPTION 'CLASS_BRANCH_LOCKED'; END IF;
  ELSE
    SELECT * INTO v_current FROM public.classes WHERE id=v_identity.current_class_id;
    IF NOT FOUND OR NOT app_private.class_path_matches(
       v_current.id,v_identity.starter_class,v_profile.level)
       OR v_target.parent_class_id IS DISTINCT FROM v_current.id
       OR v_target.column_index <> v_current.column_index+1
    THEN RAISE EXCEPTION 'CLASS_BRANCH_LOCKED'; END IF;
  END IF;
  UPDATE app_private.hero_class_identity SET current_class_id=p_class_id WHERE user_id=v_uid;
  UPDATE public.profiles SET current_class_id=p_class_id WHERE user_id=v_uid;
  RETURN jsonb_build_object('starter_class',v_identity.starter_class,
                            'current_class_id',p_class_id);
END;
$$;
REVOKE ALL ON FUNCTION app_private.advance_hero_class_core(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.advance_hero_class_core(uuid) TO authenticated;
CREATE FUNCTION public.advance_hero_class(p_class_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT app_private.advance_hero_class_core(p_class_id);
$$;
REVOKE ALL ON FUNCTION public.advance_hero_class(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.advance_hero_class(uuid) TO authenticated;
