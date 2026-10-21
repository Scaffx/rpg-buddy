-- Apply after v3 migration when legacy_setup ran before it.
CREATE FUNCTION pg_temp.ok_legacy(v boolean,m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion: %',m; END IF; END $$;
SELECT pg_temp.ok_legacy((SELECT engine_version IS NULL AND hero_max_mp IS NULL
  AND events->0->>'hero_mp' IS NULL FROM app_private.adventure_battles
  WHERE user_id='aaaaaaaa-0000-0000-0000-000000000001'),
  'pre-migration battle remains legacy');
SELECT pg_temp.ok_legacy((SELECT NOT
  app_private.adventure_battle_payload(b,b.started_at) ? 'hero_mp'
  FROM app_private.adventure_battles b
  WHERE user_id='aaaaaaaa-0000-0000-0000-000000000001'),
  'legacy payload never fabricates mana');
CREATE TEMP TABLE legacy_original AS SELECT id,hero_power,hero_max_hp,skills,events
FROM app_private.adventure_battles WHERE user_id='aaaaaaaa-0000-0000-0000-000000000001';
UPDATE public.profiles SET level=1 WHERE user_id='aaaaaaaa-0000-0000-0000-000000000001';
UPDATE public.attributes SET level=1 WHERE user_id='aaaaaaaa-0000-0000-0000-000000000001';
UPDATE app_private.adventure_battles b
  SET started_at=b.started_at-interval '120 seconds',
      ends_at=b.ends_at-interval '120 seconds',
      events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
        to_jsonb((e->>'at')::timestamptz-interval '120 seconds')) ORDER BY ord)
        FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
WHERE b.id=(SELECT current_battle_id FROM public.adventure_state
  WHERE user_id='aaaaaaaa-0000-0000-0000-000000000001');
UPDATE legacy_original p SET events=b.events
FROM app_private.adventure_battles b WHERE b.id=p.id;
SET ROLE authenticated;
SET request.jwt.claim.sub='aaaaaaaa-0000-0000-0000-000000000001';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok_legacy((SELECT count(*)>1 FROM app_private.adventure_battles
  WHERE user_id='aaaaaaaa-0000-0000-0000-000000000001' AND engine_version IS NULL),
  'offline legacy catchup continues under legacy rules');
SELECT pg_temp.ok_legacy(NOT EXISTS (
  SELECT 1 FROM app_private.adventure_battles b CROSS JOIN legacy_original p
  WHERE b.user_id='aaaaaaaa-0000-0000-0000-000000000001'
    AND b.engine_version IS NULL
    AND (b.hero_power<>p.hero_power OR b.hero_max_hp<>p.hero_max_hp OR b.skills<>p.skills)),
  'old build preserved for legacy offline fights');
SELECT pg_temp.ok_legacy((SELECT b.events=p.events
  FROM app_private.adventure_battles b JOIN legacy_original p ON p.id=b.id),
  'old battle event array remains unchanged');
