-- Class choice is stored in a private ledger. profiles remains a readable mirror.
-- Apply after 20261021142812_continuous_adventure_skill_stats_engine.sql.
-- Primary read-only audit on 2026-10-21:
-- perform_class_respec(text) pg_get_functiondef md5=c7e950d4a2dfc78a6eb6a0c2e7dca369
-- allocate_skill_node(text) pg_get_functiondef md5=a0ccf800bd1185f5ee3f0229eed1fdb5
DO $preflight$
BEGIN
  IF to_regclass('public.profiles') IS NULL
     OR to_regclass('public.classes') IS NULL
     OR to_regclass('public.skill_tree_nodes') IS NULL
     OR to_regclass('public.player_skill_nodes') IS NULL
     OR to_regprocedure('public.perform_class_respec(text)') IS NULL
     OR to_regprocedure('public.allocate_skill_node(text)') IS NULL THEN
    RAISE EXCEPTION 'HERO_CLASS_PREFLIGHT_SCHEMA';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.perform_class_respec(text)'::regprocedure AND prosecdef
      AND pg_get_userbyid(proowner)='postgres'
      AND proconfig = ARRAY['search_path=public']::text[]
      AND md5(pg_get_functiondef(oid))='c7e950d4a2dfc78a6eb6a0c2e7dca369'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.allocate_skill_node(text)'::regprocedure AND prosecdef
      AND pg_get_userbyid(proowner)='postgres'
      AND proconfig = ARRAY['search_path=public']::text[]
      AND md5(pg_get_functiondef(oid))='a0ccf800bd1185f5ee3f0229eed1fdb5'
  ) THEN RAISE EXCEPTION 'HERO_CLASS_PREFLIGHT_RPC'; END IF;
  IF NOT has_function_privilege('authenticated',
         'public.perform_class_respec(text)','EXECUTE')
     OR NOT has_function_privilege('authenticated',
         'public.allocate_skill_node(text)','EXECUTE')
     OR has_function_privilege('anon',
         'public.perform_class_respec(text)','EXECUTE')
  THEN RAISE EXCEPTION 'HERO_CLASS_PREFLIGHT_ACL'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid='public.player_skill_nodes'::regclass
      AND c.relrowsecurity AND pg_get_userbyid(c.relowner)='postgres'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid='public.player_skill_nodes'::regclass
      AND p.polname='player_skill_nodes_read_own'
      AND p.polcmd='r'
      AND 'authenticated'::regrole::oid=ANY(p.polroles)
      AND pg_get_expr(p.polqual,p.polrelid)='(user_id = auth.uid())'
  ) OR EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid='public.player_skill_nodes'::regclass
      AND p.polcmd<>'r'
  ) THEN RAISE EXCEPTION 'HERO_CLASS_PREFLIGHT_NODE_RLS'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = '00000001-0000-0000-0000-000000000001'::uuid
      AND name = 'Aprendiz' AND column_index = 1 AND level_min = 1
  ) OR (
    SELECT count(*) FROM (VALUES
      ('00000002-0000-0000-0000-000000000001'::uuid,'Espadachim'),
      ('00000002-0000-0000-0000-000000000002'::uuid,'Mago'),
      ('00000002-0000-0000-0000-000000000003'::uuid,'Gatuno'),
      ('00000002-0000-0000-0000-000000000004'::uuid,'Ferreiro'),
      ('00000002-0000-0000-0000-000000000005'::uuid,'Noviço'),
      ('00000002-0000-0000-0000-000000000006'::uuid,'Arqueiro')
    ) AS expected(id,name)
    JOIN public.classes c ON c.id=expected.id AND c.name=expected.name
    WHERE c.column_index = 2 AND c.level_min = 5
      AND c.parent_class_id = '00000001-0000-0000-0000-000000000001'::uuid
  ) <> 6 THEN RAISE EXCEPTION 'HERO_CLASS_PREFLIGHT_CATALOG'; END IF;
END;
$preflight$;

-- RLS does not restrict TRUNCATE. Existing ALL grants include it.
REVOKE ALL ON TABLE public.player_skill_nodes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.player_skill_nodes TO authenticated;

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE FUNCTION app_private.base_class_id(p_starter text)
RETURNS uuid LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog AS $$
  SELECT CASE p_starter
    WHEN 'guerreiro' THEN '00000002-0000-0000-0000-000000000001'
    WHEN 'mago' THEN '00000002-0000-0000-0000-000000000002'
    WHEN 'gatuno' THEN '00000002-0000-0000-0000-000000000003'
    WHEN 'ferreiro' THEN '00000002-0000-0000-0000-000000000004'
    WHEN 'clerico' THEN '00000002-0000-0000-0000-000000000005'
    WHEN 'novato' THEN '00000002-0000-0000-0000-000000000005'
    WHEN 'arqueiro' THEN '00000002-0000-0000-0000-000000000006'
  END::uuid;
$$;
REVOKE ALL ON FUNCTION app_private.base_class_id(text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION app_private.starter_item_for_class(p_starter text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog AS $$
  SELECT CASE p_starter
    WHEN 'guerreiro' THEN 'Espada Curta'
    WHEN 'mago' THEN 'Grimorio Basico'
    WHEN 'gatuno' THEN 'Adaga de Sombra'
    WHEN 'ferreiro' THEN 'Martelo de Aco'
    WHEN 'clerico' THEN 'Cajado de Luz'
    WHEN 'arqueiro' THEN 'Arco Curto'
  END;
$$;
REVOKE ALL ON FUNCTION app_private.starter_item_for_class(text) FROM PUBLIC, anon, authenticated;

-- Check every ancestor, including the base and Aprendiz, against the catalog.
-- A historical chain must climb exactly one column at each parent edge.
CREATE FUNCTION app_private.class_path_matches(p_current uuid, p_starter text, p_level integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog AS $$
  WITH RECURSIVE path AS (
    SELECT c.id, c.parent_class_id, c.column_index, c.level_min,
           true AS adjacent,
           ARRAY[c.id] AS visited, 1 AS hops
    FROM public.classes c WHERE c.id = p_current
    UNION ALL
    SELECT c.id, c.parent_class_id, c.column_index, c.level_min,
           path.adjacent AND ((path.column_index = c.column_index + 1) IS TRUE),
           path.visited || c.id, path.hops + 1
    FROM path JOIN public.classes c ON c.id = path.parent_class_id
    WHERE path.hops < 16 AND NOT c.id = ANY(path.visited)
  )
  SELECT EXISTS (
    SELECT 1 FROM path
    HAVING bool_and(level_min <= p_level)
       AND bool_and(adjacent)
       AND count(*) FILTER (WHERE id = app_private.base_class_id(p_starter)
                           AND column_index = 2) = 1
       AND count(*) FILTER (WHERE id = '00000001-0000-0000-0000-000000000001'::uuid
                           AND column_index = 1 AND parent_class_id IS NULL) = 1
       AND count(*) FILTER (WHERE parent_class_id IS NULL) = 1
  );
$$;
REVOKE ALL ON FUNCTION app_private.class_path_matches(uuid,text,integer) FROM PUBLIC, anon, authenticated;

CREATE TABLE app_private.hero_class_identity (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  starter_class text NOT NULL CHECK (starter_class IN
    ('guerreiro','mago','gatuno','ferreiro','clerico','novato','arqueiro')),
  starter_item text,
  current_class_id uuid REFERENCES public.classes(id),
  chosen_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON app_private.hero_class_identity FROM PUBLIC, anon, authenticated;
ALTER TABLE app_private.hero_class_identity ENABLE ROW LEVEL SECURITY;

-- Existing persisted choices are carried forward unchanged; invalid or
-- contradictory records abort the migration for manual review.
DO $seed_check$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.starter_class IS NOT NULL
      AND app_private.base_class_id(p.starter_class) IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.current_class_id IS NOT NULL
      AND p.current_class_id <> '00000001-0000-0000-0000-000000000001'::uuid
      AND (p.starter_class IS NULL OR NOT app_private.class_path_matches(
           p.current_class_id,p.starter_class,p.level))
  ) THEN RAISE EXCEPTION 'HERO_CLASS_HISTORICAL_REVIEW_REQUIRED'; END IF;
END;
$seed_check$;

INSERT INTO app_private.hero_class_identity
  (user_id,starter_class,starter_item,current_class_id)
SELECT p.user_id,p.starter_class,p.starter_item,p.current_class_id
FROM public.profiles p
WHERE p.starter_class IS NOT NULL;

CREATE FUNCTION app_private.guard_hero_class_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app_private AS $$
DECLARE v_identity app_private.hero_class_identity%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.starter_class IS NOT NULL OR NEW.current_class_id IS NOT NULL
       OR NEW.starter_item IS NOT NULL THEN
      RAISE EXCEPTION 'HERO_CLASS_WRITE_PROTECTED';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'HERO_CLASS_USER_IMMUTABLE';
  END IF;
  IF (NEW.starter_class,NEW.current_class_id,NEW.starter_item) IS DISTINCT FROM
     (OLD.starter_class,OLD.current_class_id,OLD.starter_item) THEN
    SELECT * INTO v_identity FROM app_private.hero_class_identity
    WHERE user_id = NEW.user_id;
    IF NOT FOUND OR
      (NEW.starter_class,NEW.current_class_id,NEW.starter_item) IS DISTINCT FROM
      (v_identity.starter_class,v_identity.current_class_id,v_identity.starter_item) THEN
      RAISE EXCEPTION 'HERO_CLASS_WRITE_PROTECTED';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.guard_hero_class_profile() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_hero_class_profile
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION app_private.guard_hero_class_profile();

CREATE FUNCTION app_private.hero_class_key(p_user_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app_private AS $$
DECLARE v_identity app_private.hero_class_identity%ROWTYPE;
        v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_identity FROM app_private.hero_class_identity WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    IF v_profile.current_class_id = '00000001-0000-0000-0000-000000000001'::uuid
       AND v_profile.level >= 1 THEN RETURN 'aprendiz'; END IF;
    RETURN NULL;
  END IF;
  IF (v_profile.starter_class,v_profile.current_class_id,v_profile.starter_item)
     IS DISTINCT FROM
     (v_identity.starter_class,v_identity.current_class_id,v_identity.starter_item)
  THEN RETURN NULL; END IF;
  IF v_identity.current_class_id IS NOT NULL THEN
    IF v_identity.current_class_id = '00000001-0000-0000-0000-000000000001'::uuid
       AND v_profile.level >= 1 THEN RETURN 'aprendiz'; END IF;
    IF NOT app_private.class_path_matches(
      v_identity.current_class_id,v_identity.starter_class,v_profile.level
    ) THEN RETURN NULL; END IF;
  END IF;
  RETURN CASE WHEN v_identity.starter_class = 'clerico' THEN 'novato'
              ELSE v_identity.starter_class END;
END;
$$;
REVOKE ALL ON FUNCTION app_private.hero_class_key(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION app_private.has_hero_class(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, app_private AS $$
  SELECT COALESCE(app_private.hero_class_key(p_user_id) IS NOT NULL, false)
         AND app_private.hero_class_key(p_user_id) <> 'aprendiz';
$$;
REVOKE ALL ON FUNCTION app_private.has_hero_class(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION app_private.choose_starter_class_core(p_starter_class text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app_private AS $$
DECLARE v_uid uuid := auth.uid(); v_profile public.profiles%ROWTYPE;
        v_identity app_private.hero_class_identity%ROWTYPE; v_item text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  v_item := app_private.starter_item_for_class(p_starter_class);
  IF v_item IS NULL THEN RAISE EXCEPTION 'INVALID_STARTER_CLASS'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  SELECT * INTO v_identity FROM app_private.hero_class_identity WHERE user_id = v_uid;
  IF FOUND THEN
    IF v_identity.starter_class = p_starter_class
       AND v_identity.current_class_id IS NULL
       AND v_profile.starter_class = v_identity.starter_class
       AND v_profile.current_class_id IS NULL THEN
      RETURN jsonb_build_object('starter_class',v_identity.starter_class,
                                'starter_item',v_identity.starter_item,
                                'replayed',true);
    END IF;
    RAISE EXCEPTION 'STARTER_CLASS_ALREADY_CHOSEN';
  END IF;
  IF v_profile.onboarding_completed OR v_profile.starter_class IS NOT NULL
     OR v_profile.current_class_id IS NOT NULL THEN
    RAISE EXCEPTION 'STARTER_CLASS_ALREADY_CHOSEN';
  END IF;
  INSERT INTO app_private.hero_class_identity(user_id,starter_class,starter_item)
  VALUES(v_uid,p_starter_class,v_item);
  UPDATE public.profiles SET starter_class=p_starter_class,starter_item=v_item
  WHERE user_id=v_uid;
  RETURN jsonb_build_object('starter_class',p_starter_class,
                            'starter_item',v_item,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION app_private.choose_starter_class_core(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.choose_starter_class_core(text) TO authenticated;
CREATE FUNCTION public.choose_starter_class(p_starter_class text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT app_private.choose_starter_class_core(p_starter_class);
$$;
REVOKE ALL ON FUNCTION public.choose_starter_class(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.choose_starter_class(text) TO authenticated;

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
REVOKE ALL ON FUNCTION app_private.advance_hero_class_core(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.advance_hero_class_core(uuid) TO authenticated;
CREATE FUNCTION public.advance_hero_class(p_class_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT app_private.advance_hero_class_core(p_class_id);
$$;
REVOKE ALL ON FUNCTION public.advance_hero_class(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_hero_class(uuid) TO authenticated;

CREATE FUNCTION app_private.allocate_skill_node_core(p_node_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app_private AS $$
DECLARE v_uid uuid := auth.uid(); v_node public.skill_tree_nodes%ROWTYPE;
        v_tree text; v_level int; v_spent_total int; v_spent_tree int;
        v_cur_rank int; v_prereq_rank int; v_excl int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT level INTO v_level FROM public.profiles WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  v_level := GREATEST(1,COALESCE(v_level,1));
  SELECT * INTO v_node FROM public.skill_tree_nodes WHERE id=p_node_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NODE_NOT_FOUND'; END IF;
  v_tree := app_private.hero_class_key(v_uid);
  IF v_tree IS NULL OR v_node.tree IS DISTINCT FROM v_tree THEN
    RAISE EXCEPTION 'SKILL_TREE_CLASS_LOCKED';
  END IF;
  SELECT COALESCE(SUM(p.rank*n.cost),0) INTO v_spent_total
  FROM public.player_skill_nodes p JOIN public.skill_tree_nodes n ON n.id=p.node_id
  WHERE p.user_id=v_uid;
  SELECT COALESCE(SUM(p.rank*n.cost),0) INTO v_spent_tree
  FROM public.player_skill_nodes p JOIN public.skill_tree_nodes n ON n.id=p.node_id
  WHERE p.user_id=v_uid AND n.tree=v_node.tree;
  v_cur_rank := COALESCE((SELECT rank FROM public.player_skill_nodes
    WHERE user_id=v_uid AND node_id=p_node_id),0);
  IF v_cur_rank >= v_node.max_rank THEN RAISE EXCEPTION 'MAX_RANK'; END IF;
  IF v_spent_total+v_node.cost > v_level THEN RAISE EXCEPTION 'NO_POINTS'; END IF;
  IF v_spent_tree < v_node.gate_points THEN RAISE EXCEPTION 'GATE_LOCKED'; END IF;
  IF v_node.prereq_node_id IS NOT NULL THEN
    v_prereq_rank := COALESCE((SELECT rank FROM public.player_skill_nodes
      WHERE user_id=v_uid AND node_id=v_node.prereq_node_id),0);
    IF v_prereq_rank < 1 THEN RAISE EXCEPTION 'PREREQ_LOCKED'; END IF;
  END IF;
  IF v_node.exclusive_group IS NOT NULL AND v_cur_rank=0 THEN
    SELECT COUNT(*) INTO v_excl FROM public.player_skill_nodes p
    JOIN public.skill_tree_nodes n ON n.id=p.node_id
    WHERE p.user_id=v_uid AND n.tree=v_node.tree
      AND n.exclusive_group=v_node.exclusive_group
      AND n.id<>v_node.id AND p.rank>0;
    IF v_excl>0 THEN RAISE EXCEPTION 'EXCLUSIVE_TAKEN'; END IF;
  END IF;
  INSERT INTO public.player_skill_nodes(user_id,node_id,rank)
  VALUES(v_uid,p_node_id,1)
  ON CONFLICT (user_id,node_id) DO UPDATE
  SET rank=public.player_skill_nodes.rank+1,updated_at=now();
  RETURN jsonb_build_object('node_id',p_node_id,'rank',v_cur_rank+1,
    'spent',v_spent_total+v_node.cost,
    'available',v_level-(v_spent_total+v_node.cost));
END;
$$;
REVOKE ALL ON FUNCTION app_private.allocate_skill_node_core(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.allocate_skill_node_core(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.allocate_skill_node(p_node_id text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT app_private.allocate_skill_node_core(p_node_id);
$$;
REVOKE ALL ON FUNCTION public.allocate_skill_node(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_skill_node(text) TO authenticated;

CREATE FUNCTION app_private.perform_class_respec_core(target_class text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, app_private AS $$
DECLARE v_uid uuid := auth.uid(); v_profile public.profiles%ROWTYPE;
        v_identity app_private.hero_class_identity%ROWTYPE;
        v_item text; v_gold integer; v_used boolean; v_cost integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  v_item := app_private.starter_item_for_class(target_class);
  IF v_item IS NULL THEN RAISE EXCEPTION 'INVALID_STARTER_CLASS'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  SELECT * INTO v_identity FROM app_private.hero_class_identity WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND OR v_identity.starter_class IS DISTINCT FROM v_profile.starter_class
     OR v_identity.current_class_id IS DISTINCT FROM v_profile.current_class_id
  THEN RAISE EXCEPTION 'CLASS_IDENTITY_REQUIRED'; END IF;
  IF v_identity.starter_class=target_class THEN RAISE EXCEPTION 'ALREADY_IN_CLASS'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.activity_log
    WHERE user_id=v_uid AND action='class_respec') INTO v_used;
  v_cost := CASE WHEN v_used THEN 120 ELSE 0 END;
  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id=v_uid FOR UPDATE;
  IF v_gold IS NULL THEN RAISE EXCEPTION 'BALANCE_NOT_FOUND'; END IF;
  IF v_gold<v_cost THEN RAISE EXCEPTION 'INSUFFICIENT_GOLD'; END IF;
  IF v_cost>0 THEN
    UPDATE public.user_balance SET gold=v_gold-v_cost,updated_at=now() WHERE user_id=v_uid;
    INSERT INTO public.gold_history(user_id,type,amount,reason)
    VALUES(v_uid,'respec_classe',-v_cost,'Respec para '||target_class);
  END IF;
  UPDATE app_private.hero_class_identity
  SET starter_class=target_class,starter_item=v_item,current_class_id=NULL
  WHERE user_id=v_uid;
  UPDATE public.profiles
  SET starter_class=target_class,starter_item=v_item,current_class_id=NULL
  WHERE user_id=v_uid;
  INSERT INTO public.activity_log(user_id,action,description,xp_gained)
  VALUES(v_uid,'class_respec','Mudou para a classe '||target_class,0);
  RETURN jsonb_build_object('starter_class',target_class,'current_class_id',NULL,
    'starter_item',v_item,'remaining_gold',v_gold-v_cost,'was_free',NOT v_used);
END;
$$;
REVOKE ALL ON FUNCTION app_private.perform_class_respec_core(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.perform_class_respec_core(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.perform_class_respec(target_class text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog AS $$
  SELECT app_private.perform_class_respec_core(target_class);
$$;
REVOKE ALL ON FUNCTION public.perform_class_respec(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perform_class_respec(text) TO authenticated;
