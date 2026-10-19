-- Existing buff rows and NPC completion rows are intentionally preserved.
-- These records were client writable, so their provenance cannot be inferred.

-- Mission implementation helpers run inside the owner-owned SECURITY DEFINER
-- completion functions. A player must not call one directly with another UID.
REVOKE ALL ON FUNCTION public._norm(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._derive_mission_category(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._apply_mission_health_effects(uuid, numeric, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._grant_flow_xp_buff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._grant_inspiration_if_perfect_day(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._weekend_xp_bonus(text, jsonb, date) FROM PUBLIC, anon, authenticated;

-- Table grants and column grants are independent in PostgreSQL. Remove both
-- so an existing or later RLS policy cannot authorize a client-side refresh.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_buffs FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.npc_challenge_completions FROM PUBLIC, anon, authenticated;

DO $revoke_columns$
DECLARE
  v_table text;
  v_column text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['user_buffs', 'npc_challenge_completions'] LOOP
    FOR v_column IN
      SELECT a.attname
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = format('public.%I', v_table)::regclass
        AND a.attnum > 0
        AND NOT a.attisdropped
    LOOP
      EXECUTE format(
        'REVOKE INSERT (%1$I), UPDATE (%1$I) ON TABLE public.%2$I FROM PUBLIC, anon, authenticated',
        v_column, v_table
      );
    END LOOP;
  END LOOP;
END;
$revoke_columns$;

-- No protected receipt exists for old NPC rewards. A historical completion
-- cannot safely determine what XP or gold to reverse, including negative
-- values inserted by the player. Retire the RPC without touching those rows.
CREATE OR REPLACE FUNCTION public.undo_npc_challenge(
  p_npc_id text, p_challenge_id text, p_week_token text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $retired$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NPC_UNDO_RETIRED';
END;
$retired$;

REVOKE ALL ON FUNCTION public.undo_npc_challenge(text, text, text)
  FROM PUBLIC, anon, authenticated;
