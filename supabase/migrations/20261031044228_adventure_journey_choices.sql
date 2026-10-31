-- Narrative choices are cosmetic. Combat, rewards and stage remain server-owned.
SET lock_timeout = '5s';
SET statement_timeout = '30s';

DO $guard$
BEGIN
  IF to_regclass('public.adventure_state') IS NULL
    OR to_regprocedure('auth.uid()') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_attribute
       WHERE attrelid = 'public.adventure_state'::regclass
         AND attname = 'stage' AND atttypid = 'integer'::regtype
         AND attnotnull AND NOT attisdropped
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.adventure_state'::regclass
         AND contype = 'p' AND conkey = ARRAY[
           (SELECT attnum FROM pg_attribute
             WHERE attrelid = 'public.adventure_state'::regclass
               AND attname = 'user_id' AND NOT attisdropped)
         ]::smallint[]
    )
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.adventure_state'::regclass)
    OR has_table_privilege('anon', 'public.adventure_state', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.adventure_state', 'UPDATE')
  THEN
    RAISE EXCEPTION 'ADVENTURE_JOURNEY_SOURCE_DRIFT' USING ERRCODE = '22023';
  END IF;

  IF to_regclass('public.adventure_journey_choices') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('get_adventure_journey', 'save_adventure_journey_choice')
    )
  THEN
    RAISE EXCEPTION 'ADVENTURE_JOURNEY_ALREADY_EXISTS' USING ERRCODE = '22023';
  END IF;
END;
$guard$;

CREATE TABLE public.adventure_journey_choices (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle integer NOT NULL CHECK (cycle BETWEEN 1 AND 2000),
  chapter smallint NOT NULL CHECK (chapter BETWEEN 1 AND 5),
  choice text NOT NULL CHECK (choice IN ('restore', 'explore')),
  chosen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, cycle, chapter)
);
ALTER TABLE public.adventure_journey_choices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adventure_journey_choices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.adventure_journey_choices TO authenticated;
CREATE POLICY adventure_journey_own_read ON public.adventure_journey_choices
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE FUNCTION public.get_adventure_journey(p_cycle integer DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $fn$
  SELECT jsonb_build_object(
      'stage', j.stage,
      'cycle', j.current_cycle,
      'chapter', j.current_chapter,
      'view_cycle', j.view_cycle,
      'choices', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'chapter', c.chapter, 'choice', c.choice, 'chosen_at', c.chosen_at
        ) ORDER BY c.chapter)
          FROM public.adventure_journey_choices c
         WHERE c.user_id = j.user_id AND c.cycle = j.view_cycle
      ), '[]'::jsonb)
    )
    FROM (
      SELECT s.user_id, s.stage,
        ((s.stage - 1) / 50) + 1 AS current_cycle,
        (((s.stage - 1) / 10) % 5) + 1 AS current_chapter,
        LEAST(((s.stage - 1) / 50) + 1,
          GREATEST(1, COALESCE(p_cycle, ((s.stage - 1) / 50) + 1))) AS view_cycle
        FROM public.adventure_state s WHERE s.user_id = auth.uid()
    ) j
$fn$;

-- The only write path. The caller cannot supply a user, stage, reward or boss result.
CREATE FUNCTION public.save_adventure_journey_choice(
  p_cycle integer, p_chapter integer, p_choice text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_stage integer;
  v_existing text;
  v_replayed boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '28000';
  END IF;
  IF p_choice IS NULL OR p_choice NOT IN ('restore', 'explore') THEN
    RAISE EXCEPTION 'JOURNEY_INVALID_CHOICE' USING ERRCODE = '22023';
  END IF;
  IF p_cycle IS NULL OR p_chapter IS NULL OR p_cycle NOT BETWEEN 1 AND 2000
    OR p_chapter NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'JOURNEY_INVALID_CHAPTER' USING ERRCODE = '22023';
  END IF;

  SELECT s.stage INTO v_stage FROM public.adventure_state s
   WHERE s.user_id = v_uid FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOURNEY_STATE_UNAVAILABLE' USING ERRCODE = '22023';
  END IF;
  IF v_stage < ((p_cycle - 1) * 50 + (p_chapter - 1) * 10 + 5) THEN
    RAISE EXCEPTION 'JOURNEY_CHAPTER_LOCKED' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.adventure_journey_choices(user_id, cycle, chapter, choice)
    VALUES (v_uid, p_cycle, p_chapter, p_choice)
    ON CONFLICT (user_id, cycle, chapter) DO NOTHING;
  v_replayed := NOT FOUND;
  IF v_replayed THEN
    SELECT c.choice INTO v_existing FROM public.adventure_journey_choices c
     WHERE c.user_id = v_uid AND c.cycle = p_cycle AND c.chapter = p_chapter;
    IF v_existing IS DISTINCT FROM p_choice THEN
      RAISE EXCEPTION 'JOURNEY_CHOICE_CONFLICT' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN jsonb_build_object('cycle', p_cycle, 'chapter', p_chapter,
    'choice', p_choice, 'replayed', v_replayed);
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_adventure_journey(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_adventure_journey_choice(integer,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_adventure_journey(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_adventure_journey_choice(integer,integer,text) TO authenticated;

DO $guard$
BEGIN
  IF has_table_privilege('anon','public.adventure_journey_choices','SELECT')
    OR has_table_privilege('anon','public.adventure_journey_choices','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR has_table_privilege('authenticated','public.adventure_journey_choices','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR NOT has_table_privilege('authenticated','public.adventure_journey_choices','SELECT')
    OR has_function_privilege('anon','public.get_adventure_journey(integer)','EXECUTE')
    OR has_function_privilege('anon','public.save_adventure_journey_choice(integer,integer,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.get_adventure_journey(integer)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.save_adventure_journey_choice(integer,integer,text)','EXECUTE')
    OR NOT (SELECT relrowsecurity FROM pg_class
             WHERE oid = 'public.adventure_journey_choices'::regclass)
    OR (SELECT relowner FROM pg_class
         WHERE oid = 'public.adventure_journey_choices'::regclass) <> 'postgres'::regrole
    OR EXISTS (SELECT 1 FROM pg_trigger
         WHERE tgrelid = 'public.adventure_journey_choices'::regclass AND NOT tgisinternal)
    OR (SELECT count(*) FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'adventure_journey_choices'
           AND policyname = 'adventure_journey_own_read' AND cmd = 'SELECT'
           AND roles = ARRAY['authenticated']::name[] AND qual LIKE '%auth.uid()%') <> 1
    OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='get_adventure_journey') <> 1
    OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname='save_adventure_journey_choice') <> 1
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='public' AND p.proname IN ('get_adventure_journey','save_adventure_journey_choice')
           AND (p.proowner <> 'postgres'::regrole
             OR p.prosecdef <> (p.proname='save_adventure_journey_choice')
             OR p.proconfig IS NULL OR NOT ('search_path=""'=ANY(p.proconfig))))
  THEN
    RAISE EXCEPTION 'ADVENTURE_JOURNEY_ACL_DRIFT' USING ERRCODE = '22023';
  END IF;
END;
$guard$;
