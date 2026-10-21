-- Primary jfnospjxdkelxlhcwuia, read-only inspection 2026-10-21.
-- Fail closed if the live RPC or grants have changed since inspection.
DO $preflight$
DECLARE
  v_function pg_proc%ROWTYPE;
BEGIN
  SELECT p.* INTO v_function
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'reset_skill_tree'
     AND pg_get_function_identity_arguments(p.oid) = '';
  IF NOT FOUND
     OR pg_get_userbyid(v_function.proowner) <> 'postgres'
     OR NOT v_function.prosecdef
     OR v_function.prorettype <> 'jsonb'::regtype
     OR v_function.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
     OR encode(extensions.digest(pg_get_functiondef(v_function.oid), 'sha256'), 'hex')
          <> 'f1feb27f302a8c5725c13cf87b8b6013d3e10203cb1807dc86b79add4793f944'
     OR v_function.proacl::text <> '{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}'
  THEN
    RAISE EXCEPTION 'RESET_SKILL_TREE_PREFLIGHT_DRIFT';
  END IF;
  IF to_regnamespace('app_private') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='player_skill_nodes' AND column_name='source'
     )
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='profiles' AND column_name='combat_skill_loadout'
     )
  THEN
    RAISE EXCEPTION 'RESET_SKILL_TREE_SCHEMA_DRIFT';
  END IF;
END;
$preflight$;

-- app_private is not exposed by the Data API. This core accepts no client ID,
-- amount, level or point count. The auth identity is taken inside the function.
CREATE OR REPLACE FUNCTION app_private.reset_skill_tree_core()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $core$
DECLARE
  v_uid uuid := auth.uid();
  v_level integer;
  v_charged integer := 0;
  v_refunded integer := 0;
  v_removed_ids text[] := ARRAY[]::text[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  -- Serializes resets for this hero and reads the level under the same lock.
  SELECT GREATEST(1, COALESCE(p.level, 1)) INTO v_level
    FROM public.profiles p WHERE p.user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  IF v_level > 10 THEN
    -- The conditional UPDATE is atomic with the allocation and loadout cleanup.
    UPDATE public.user_balance b
       SET gold = b.gold - 150, updated_at = now()
     WHERE b.user_id = v_uid AND b.gold >= 150;
    IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_GOLD'; END IF;
    v_charged := 150;
  END IF;

  WITH removed AS (
    DELETE FROM public.player_skill_nodes s
     WHERE s.user_id = v_uid AND s.source = 'points'
    RETURNING s.node_id, s.rank
  )
  SELECT COALESCE(array_agg(r.node_id), ARRAY[]::text[]),
         COALESCE(sum(r.rank * n.cost), 0)::integer
    INTO v_removed_ids, v_refunded
    FROM removed r JOIN public.skill_tree_nodes n ON n.id = r.node_id;

  -- Preserve scroll/drop allocations, weapon entries and the order of valid
  -- entries. Only IDs made invalid by this reset are removed from the deck.
  IF cardinality(v_removed_ids) > 0 THEN
    UPDATE public.profiles p
       SET combat_skill_loadout = CASE
         WHEN jsonb_typeof(p.combat_skill_loadout) = 'array' THEN
           COALESCE((
             SELECT jsonb_agg(e.value ORDER BY e.ordinality)
               FROM jsonb_array_elements(p.combat_skill_loadout) WITH ORDINALITY AS e(value, ordinality)
              WHERE NOT (e.value->>'id' = ANY(v_removed_ids))
           ), '[]'::jsonb)
         ELSE p.combat_skill_loadout END
     WHERE p.user_id = v_uid;
  END IF;

  RETURN jsonb_build_object('ok', true, 'charged', v_charged,
                            'refunded_points', v_refunded,
                            'removed_skills', cardinality(v_removed_ids));
END;
$core$;
REVOKE ALL ON FUNCTION app_private.reset_skill_tree_core() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.reset_skill_tree_core() TO authenticated;

-- Keep the public RPC signature stable while removing its definer privilege.
CREATE OR REPLACE FUNCTION public.reset_skill_tree()
RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $wrapper$ SELECT app_private.reset_skill_tree_core() $wrapper$;
REVOKE ALL ON FUNCTION public.reset_skill_tree() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_skill_tree() TO authenticated;
