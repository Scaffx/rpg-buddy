-- Independent boundary checks for the three passive effects. No table writes.
BEGIN;
DO $audit$
DECLARE
  v_time timestamptz := '2026-10-26 18:00:00+00';
  v_empty jsonb := '[]'::jsonb;
  v_skill jsonb := '[{"id":"s","name":"S","type":"dano","power":10,"mp_cost":20,"cooldown":0,"effect":"physical"}]'::jsonb;
  v_plain jsonb;
  v_events jsonb;
  v_zero jsonb;
BEGIN
  v_plain := app_private.adventure_simulate_v3(v_time,20,10,110,100,20,100,
    v_empty,'{}'::jsonb,'physical',0);
  IF v_plain IS DISTINCT FROM app_private.adventure_simulate_v3(v_time,20,10,110,100,20,100,
    v_empty,'{}'::jsonb,'physical',0,NULL) THEN
    RAISE EXCEPTION 'NULL_SUSTAIN_CHANGED_LEGACY_SIMULATION';
  END IF;

  -- 5% of 110 is 5.5, rounded to 6 after a surviving enemy action.
  v_events := app_private.adventure_simulate_v3(v_time,20,10,110,100,20,100,
    v_empty,'{}'::jsonb,'physical',0,'{"kind":"regen_hp","pct":0.05}'::jsonb);
  IF (v_events->1->>'healing')::integer<>6
     OR (v_events->1->>'hero_hp')::integer<>(v_plain->1->>'hero_hp')::integer+6
     OR (v_events->1->>'hero_hp')::integer>110 THEN
    RAISE EXCEPTION 'KRAKEN_HALF_ROUND_OR_HP_CLAMP: %',v_events->1;
  END IF;
  v_events := app_private.adventure_simulate_v3(v_time,20,10,100,100,1,100,
    v_empty,'{}'::jsonb,'physical',0,'{"kind":"regen_hp","pct":0.05}'::jsonb);
  IF (v_events->1->>'hero_hp')::integer<>100
     OR (v_events->1->>'healing')::integer<0
     OR (v_events->1->>'healing')::integer>5 THEN
    RAISE EXCEPTION 'KRAKEN_NEAR_CAP: %',v_events->1;
  END IF;
  v_events := app_private.adventure_simulate_v3(v_time,20,0,110,100,500,100,
    v_empty,'{}'::jsonb,'physical',0,'{"kind":"regen_hp","pct":0.05}'::jsonb);
  IF (v_events->-1->>'hero_hp')::integer<>0
     OR (v_events->-1->>'healing')::integer<>0 THEN
    RAISE EXCEPTION 'KRAKEN_REVIVED_DEFEAT: %',v_events->-1;
  END IF;

  -- 8% of 107 is 8.56, rounded to 9; regen follows the enemy action.
  v_events := app_private.adventure_simulate_v3(v_time,20,10,100,107,20,100,
    v_skill,'{}'::jsonb,'physical',0,'{"kind":"regen_mp","pct":0.08}'::jsonb);
  IF (v_events->0->>'mp_cost')::integer<>20
     OR (v_events->1->>'hero_mp')::integer<>(v_events->0->>'hero_mp')::integer+9
     OR (v_events->1->>'hero_mp')::integer>107 THEN
    RAISE EXCEPTION 'NECRO_ROUND_OR_MP_CLAMP: %',v_events->1;
  END IF;
  v_events := app_private.adventure_simulate_v3(v_time,20,10,100,107,20,100,
    '[{"id":"s","name":"S","type":"dano","power":10,"mp_cost":1,"cooldown":0,"effect":"physical"}]'::jsonb,
    '{}'::jsonb,'physical',0,'{"kind":"regen_mp","pct":0.08}'::jsonb);
  IF (v_events->1->>'hero_mp')::integer<>107 THEN
    RAISE EXCEPTION 'NECRO_NEAR_CAP: %',v_events->1;
  END IF;
  v_zero := app_private.adventure_simulate_v3(v_time,20,10,100,0,20,100,
    v_empty,'{}'::jsonb,'physical',0,'{"kind":"regen_mp","pct":0.08}'::jsonb);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_zero) x
      WHERE (x->>'hero_mp')::integer<>0) THEN
    RAISE EXCEPTION 'NECRO_ZERO_MP_GAIN: %',v_zero;
  END IF;

  -- 20% cost reduction uses integer rounding and cannot create negative cost.
  v_events := app_private.adventure_simulate_v3(v_time,20,10,100,100,20,100,
    '[{"id":"s","name":"S","type":"dano","power":10,"mp_cost":3,"cooldown":0,"effect":"physical"}]'::jsonb,
    '{}'::jsonb,'physical',0,'{"kind":"mp_cost","pct":0.20}'::jsonb);
  IF (v_events->0->>'mp_cost')::integer<>2
     OR (v_events->0->>'hero_mp')::integer<>98 THEN
    RAISE EXCEPTION 'LEVIATHAN_COST_3: %',v_events->0;
  END IF;
  v_events := app_private.adventure_simulate_v3(v_time,20,10,100,100,20,100,
    '[{"id":"s","name":"S","type":"dano","power":10,"mp_cost":1,"cooldown":0,"effect":"physical"}]'::jsonb,
    '{}'::jsonb,'physical',0,'{"kind":"mp_cost","pct":0.20}'::jsonb);
  IF (v_events->0->>'mp_cost')::integer<>1 THEN
    RAISE EXCEPTION 'LEVIATHAN_COST_1: %',v_events->0;
  END IF;
  RAISE NOTICE 'INDEPENDENT_SUSTAIN_BOUNDARIES_PASS';
END $audit$;
ROLLBACK;
