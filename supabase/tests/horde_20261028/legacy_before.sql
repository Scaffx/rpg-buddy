\set ON_ERROR_STOP on
-- Executar no clone fiel antes da migration v4.
INSERT INTO auth.users(id) VALUES('a0000000-0000-0000-0000-00000000a471');
INSERT INTO public.profiles(user_id,level,starter_class)
  VALUES('a0000000-0000-0000-0000-00000000a471',100,'guerreiro');
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a471';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
DO $assert$
BEGIN
  IF NOT (SELECT engine_version='v3' AND status='fighting'
      AND events->0 ? 'actor' AND NOT (events->0 ? 'actor_slot')
    FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000a471')
  THEN RAISE EXCEPTION 'LEGACY_BEFORE_NOT_V3'; END IF;
END $assert$;
