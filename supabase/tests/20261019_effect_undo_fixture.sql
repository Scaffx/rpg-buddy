-- Reduced integrated fixture. The pre-existing fixture has neutral effect
-- helpers; replace them with the exact helper bodies observed on 2026-10-19.
\ir 20261019_integracao_fixture.sql
ALTER TABLE public.user_health_stats
  ADD COLUMN max_mp integer DEFAULT 10,
  ADD COLUMN current_mp integer DEFAULT 10;
ALTER TABLE public.user_buffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY effect_fixture_buffs_own_select ON public.user_buffs
  FOR SELECT TO authenticated USING (user_id=auth.uid());
GRANT SELECT ON public.user_buffs TO authenticated;
ALTER TABLE public.user_health_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY effect_fixture_health_own_select ON public.user_health_stats
  FOR SELECT TO authenticated USING (user_id=auth.uid());
GRANT SELECT ON public.user_health_stats TO authenticated;
\ir ../migrations/20260531001500_mission_helper_functions.sql
DO $verify_live_helpers$
BEGIN
  IF md5(replace(pg_get_functiondef(
       'public._apply_mission_health_effects(uuid,numeric,integer,integer)'::regprocedure),
       E'\r\n',E'\n')) <> 'ec7b2cbdc6035c3b129ef400c6f20bb9'
     OR md5(replace(pg_get_functiondef(
       'public._grant_flow_xp_buff(uuid)'::regprocedure),
       E'\r\n',E'\n')) <> '97780c88457be4637d52124a86f6b701' THEN
    RAISE EXCEPTION 'Fixture effect helper differs from observed live definition';
  END IF;
END;
$verify_live_helpers$;
