\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.ok(v boolean,m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'HORDE_LEGACY_ASSERT: %',m; END IF; END $$;
INSERT INTO auth.users(id) VALUES('a0000000-0000-0000-0000-00000000a421');
INSERT INTO public.profiles(user_id,level,starter_class)
  VALUES('a0000000-0000-0000-0000-00000000a421',100,'guerreiro');
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a421';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
-- Simula um confronto v3 iniciado antes da migration: mesmos atributos
-- persistidos e a função v3 preservada, com linha do tempo já congelada.
DO $legacy$
DECLARE b app_private.adventure_battles%ROWTYPE; e jsonb; s integer;
BEGIN
  SELECT * INTO STRICT b FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000a421';
  e:=app_private.adventure_simulate_v3(
    b.started_at,b.hero_attack,b.hero_defense,b.hero_max_hp,b.hero_max_mp,
    b.enemy_power,100,b.skills,b.enemy_resistances,
    coalesce(b.rules_snapshot->>'default_effect','physical'),0,NULL);
  UPDATE app_private.adventure_battles SET engine_version='v3',
    enemy_max_hp=100,events=e,ends_at=(e->-1->>'at')::timestamptz,
    rules_snapshot=(rules_snapshot-'enemies')||jsonb_build_object('version','v3')
    WHERE id=b.id;
  SELECT greatest(1,ceil(extract(epoch FROM ends_at-clock_timestamp()))::integer)
    INTO s FROM app_private.adventure_battles WHERE id=b.id;
  UPDATE app_private.adventure_battles SET
    started_at=started_at-make_interval(secs=>s),
    ends_at=ends_at-make_interval(secs=>s),
    events=(SELECT jsonb_agg(jsonb_set(x,'{at}',
      to_jsonb((x->>'at')::timestamptz-make_interval(secs=>s))) ORDER BY ord)
      FROM jsonb_array_elements(events) WITH ORDINALITY a(x,ord))
    WHERE id=b.id;
END $legacy$;
SELECT pg_temp.ok((SELECT engine_version='v3' AND status='fighting'
  AND NOT app_private.adventure_battle_payload(b,clock_timestamp()) ? 'enemies'
  FROM app_private.adventure_battles b
  WHERE user_id='a0000000-0000-0000-0000-00000000a421'),
  'unfinished v3 remains singular before settlement');
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a421';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
SELECT pg_temp.ok((SELECT status='won' AND engine_version='v3'
  FROM app_private.adventure_battles
  WHERE user_id='a0000000-0000-0000-0000-00000000a421' AND stage=1),
  'unfinished v3 settles once under original rules');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.adventure_encounters
  WHERE user_id='a0000000-0000-0000-0000-00000000a421' AND stage=1)
  AND (SELECT count(*)=1 FROM public.gold_history
    WHERE user_id='a0000000-0000-0000-0000-00000000a421' AND type='adventure'),
  'legacy settlement has one encounter and one ledger');
UPDATE public.adventure_state
  SET last_tick_at=clock_timestamp()-interval '2 seconds'
  WHERE user_id='a0000000-0000-0000-0000-00000000a421';
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a421';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM app_private.adventure_battles
  WHERE user_id='a0000000-0000-0000-0000-00000000a421'
    AND stage=2 AND engine_version='v4_horde'),
  'new encounter after legacy settlement uses horde engine');
SELECT pg_temp.ok((SELECT level=100 AND total_xp=0 FROM public.profiles
  WHERE user_id='a0000000-0000-0000-0000-00000000a421'),
  'legacy and horde have no XP mutation');
ROLLBACK;
