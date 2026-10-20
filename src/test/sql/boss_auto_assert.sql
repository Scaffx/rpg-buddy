CREATE FUNCTION pg_temp.assert_true(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %',msg; END IF; END $$;

SELECT pg_temp.assert_true((SELECT count(*)=1 AND min(source)='TRANSICAO'
  FROM app_private.legacy_boss_unlocks WHERE user_id='11111111-1111-1111-1111-111111111111'),
  'historical win captured once with transition provenance');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.boss_battles
  WHERE user_id='11111111-1111-1111-1111-111111111111' AND won),
  'historical battle untouched');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.companions
  WHERE user_id='11111111-1111-1111-1111-111111111111' AND name='Mini antigo'),
  'historical pet untouched');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.boss_battles','INSERT'),
  'authenticated cannot insert boss ledger');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.boss_battles','UPDATE'),
  'authenticated cannot update boss ledger');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.adventure_encounters','INSERT'),
  'authenticated cannot insert encounter');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.bosses','UPDATE'),
  'authenticated cannot reorder boss catalog');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.pet_catalog','UPDATE'),
  'authenticated cannot remap pet unlock');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','app_private.legacy_boss_unlocks','INSERT'),
  'authenticated cannot insert transition snapshot');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated',
  'public.resolve_boss_battle(uuid,boolean,integer)','EXECUTE'),
  'client outcome resolver closed');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon',
  'public.resolve_boss_battle(uuid,boolean,integer)','EXECUTE'),
  'anonymous outcome resolver closed');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon',
  'public.sync_auto_adventure()','EXECUTE'), 'anonymous adventure closed');
DO $$ DECLARE blocked boolean:=false; BEGIN
  BEGIN
    INSERT INTO app_private.legacy_boss_unlocks(user_id,boss_id)
    VALUES('22222222-2222-2222-2222-222222222222',
           '00000000-0000-0000-0000-000000000033');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='legacy boss unlock snapshot is immutable' THEN blocked:=true;
    ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'transition snapshot accepted later insert'; END IF;
END $$;
DO $$ DECLARE blocked boolean:=false; BEGIN
  BEGIN
    DELETE FROM app_private.legacy_boss_unlocks
    WHERE user_id='33333333-3333-3333-3333-333333333333';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='legacy boss unlock snapshot is immutable' THEN blocked:=true;
    ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'transition snapshot accepted direct delete'; END IF;
END $$;
DELETE FROM auth.users WHERE id='33333333-3333-3333-3333-333333333333';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM app_private.legacy_boss_unlocks
  WHERE user_id='33333333-3333-3333-3333-333333333333'),
  'account deletion cascades transition entitlement');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.boss_battles(user_id,boss_id,won)
    VALUES('22222222-2222-2222-2222-222222222222',
           '00000000-0000-0000-0000-000000000033',true);
    RAISE EXCEPTION 'privileged forged boss win unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT pg_temp.assert_true((SELECT unlocked AND owned FROM public.get_pet_catalog()
  WHERE pet_type='mini_relampago'),'old pet remains owned/unlocked');
SELECT pg_temp.assert_true((SELECT NOT unlocked FROM public.get_pet_catalog()
  WHERE pet_type='mini_leviata'),'a different boss is still locked');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.boss_battles(user_id,boss_id,won)
      VALUES(auth.uid(),'00000000-0000-0000-0000-000000000033',true);
    RAISE EXCEPTION 'direct ledger insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.resolve_boss_battle('00000000-0000-0000-0000-000000000033',true,0);
    RAISE EXCEPTION 'legacy resolver unexpectedly executed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- A protected stage maps by regular catalog level/id, never by client input.
INSERT INTO public.adventure_state(user_id,stage,last_tick_at)
VALUES('11111111-1111-1111-1111-111111111111',10,now()-interval '30 minutes');
UPDATE public.profiles SET level=50 WHERE user_id='11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
WITH s AS (SELECT public.sync_auto_adventure() AS v)
SELECT pg_temp.assert_true(
  (s.v->>'boss_wins_credited')::integer=1
  AND s.v->'last_result'->>'boss_id'='00000000-0000-0000-0000-000000000001'
  AND s.v->'last_result'->>'boss_name'='Boss 1'
  AND s.v->'boss'->>'name'='Boss 2',
  'snapshot exposes exact completed and upcoming boss identities') FROM s;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT won AND boss_id='00000000-0000-0000-0000-000000000001'
  AND enemy_power=45 FROM public.adventure_encounters
  WHERE user_id='11111111-1111-1111-1111-111111111111' AND stage=10),
  'stage 10 maps first regular boss');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.boss_battles
  WHERE user_id='11111111-1111-1111-1111-111111111111'
    AND boss_id='00000000-0000-0000-0000-000000000001' AND won),
  'automatic boss counter records once');
SELECT pg_temp.assert_true((SELECT NOT unlocked FROM public.get_pet_catalog()
  WHERE pet_type='mini_leviata'),'one generic victory does not unlock another boss');

UPDATE public.adventure_state SET stage=20,last_tick_at=now()-interval '30 minutes'
WHERE user_id='11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT (public.sync_auto_adventure()->>'stage')::int AS stage;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT won AND boss_id='00000000-0000-0000-0000-000000000002'
  FROM public.adventure_encounters WHERE user_id='11111111-1111-1111-1111-111111111111'
  AND stage=20),'stage 20 maps second boss');

UPDATE public.adventure_state SET stage=30,last_tick_at=now()-interval '30 minutes'
WHERE user_id='11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT (public.sync_auto_adventure()->>'stage')::int AS stage;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT won AND boss_id='00000000-0000-0000-0000-000000000003'
  FROM public.adventure_encounters WHERE user_id='11111111-1111-1111-1111-111111111111'
  AND stage=30),'stage 30 maps third boss');

-- Same level/attributes/equipment are set as server fixture data, then callers
-- only request elapsed-time reconciliation. No client outcome or stat payload.
UPDATE public.profiles SET level=50 WHERE user_id='22222222-2222-2222-2222-222222222222';
UPDATE public.attributes SET level=23 WHERE user_id='22222222-2222-2222-2222-222222222222';
-- Foice do Ceifador and Amuleto da Eternidade use the bonuses and level gates
-- observed in the live catalog on 2026-10-19; attunement is required here.
INSERT INTO public.game_items(id,category,rarity,is_consumable,effect,level_required,
  atk_bonus,def_bonus,hp_bonus,requer_sintonizacao) VALUES
('ef940514-c30a-4f86-b39c-cbe82eef3f3a','weapon','lendario',false,null,50,65,0,0,true),
('560dd03d-2848-48aa-88ef-18de153252c5','accessory','lendario',false,null,48,15,15,0,true);
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped,sintonizado)
VALUES
('22222222-2222-2222-2222-222222222222',
 'ef940514-c30a-4f86-b39c-cbe82eef3f3a',1,true,true),
('22222222-2222-2222-2222-222222222222',
 '560dd03d-2848-48aa-88ef-18de153252c5',1,true,true);
INSERT INTO public.user_balance(user_id,gold)
VALUES('22222222-2222-2222-2222-222222222222',10000);
INSERT INTO public.adventure_state(user_id,stage,last_tick_at)
VALUES('22222222-2222-2222-2222-222222222222',200,now()-interval '30 minutes');

SET ROLE authenticated;
SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
SELECT (public.sync_auto_adventure()->>'stage')::int AS stage;
SELECT pg_temp.assert_true((SELECT unlocked FROM public.get_pet_catalog()
  WHERE pet_type='mini_leviata'),'Leviathan indicator unlocks from exact encounter');
SELECT pg_temp.assert_true((SELECT NOT unlocked FROM public.get_pet_catalog()
  WHERE pet_type='mini_relampago'),'other pet stays locked');
SELECT public.buy_pet('mini_leviata');
SELECT pg_temp.assert_true((SELECT owned FROM public.get_pet_catalog()
  WHERE pet_type='mini_leviata'),'purchase and catalog owned agree');
DO $$ BEGIN
  BEGIN
    PERFORM public.buy_pet('mini_leviata');
    RAISE EXCEPTION 'second purchase unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Você já possui este pet.' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT gold=9912 FROM public.user_balance
  WHERE user_id='22222222-2222-2222-2222-222222222222'),
  'one boss reward plus one purchase');

-- Seven catalog pets are placed at levels 20,23,24,27,29,32,33.
-- All seven can be won at stages 200..330 using server-owned trained stats.
DO $$ DECLARE s integer; BEGIN
  FOREACH s IN ARRAY ARRAY[230,240,270,290,320,330] LOOP
    UPDATE public.adventure_state SET stage=s,attempt=0,
      last_tick_at=now()-interval '30 minutes'
      WHERE user_id='22222222-2222-2222-2222-222222222222';
    PERFORM set_config('request.jwt.claim.sub',
      '22222222-2222-2222-2222-222222222222',true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.sync_auto_adventure();
    EXECUTE 'SET LOCAL ROLE postgres';
  END LOOP;
END $$;
SELECT pg_temp.assert_true((SELECT count(*)=7 FROM public.adventure_encounters
  WHERE user_id='22222222-2222-2222-2222-222222222222' AND kind='boss' AND won
  AND boss_id IN (SELECT unlock_boss_id FROM public.pet_catalog)),
  'all seven pet bosses reachable at calibrated stages');
SELECT pg_temp.assert_true((SELECT max(enemy_power)=525 AND max(hero_power)=544 FROM public.adventure_encounters
  WHERE user_id='22222222-2222-2222-2222-222222222222' AND stage=330),
  'level 33 pet stage is within live-catalog equipment power');
SELECT pg_temp.assert_true((SELECT total_xp=0 AND level=50 FROM public.profiles
  WHERE user_id='22222222-2222-2222-2222-222222222222'),
  'automatic bosses do not change permanent progression');
SELECT pg_temp.assert_true((SELECT level=23 AND xp=0 FROM public.attributes
  WHERE user_id='22222222-2222-2222-2222-222222222222' AND name='forca'),
  'automatic bosses do not change trained attributes');

SET ROLE authenticated;
SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
SELECT pg_temp.assert_true((SELECT count(*)=7 FROM public.get_pet_catalog()
  WHERE unlocked),'all seven indicator results match exact wins');
SELECT public.buy_pet('mini_demonio_fome');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.inventory_forage_eligible e
  JOIN public.companions c ON c.id=e.companion_id
  WHERE c.user_id='22222222-2222-2222-2222-222222222222'
    AND c.companion_type='mini_demonio_fome'),
  'trusted forage trigger accepts security-definer purchase');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.companions
  WHERE user_id='22222222-2222-2222-2222-222222222222' AND origin='shop'),
  'two distinct shop pets coexist');

-- Future-equipment projection at the existing SQL caps: 990 hero power is
-- above Chronos at 570 (885) and the first cycle at 580 (900).
UPDATE public.attributes SET level=50
WHERE user_id='22222222-2222-2222-2222-222222222222';
INSERT INTO public.game_items(id,category,rarity,is_consumable,effect,level_required,
  atk_bonus,def_bonus,hp_bonus,requer_sintonizacao)
VALUES('dddddddd-dddd-dddd-dddd-dddddddddddd','armor','lendario',false,null,50,
       200,150,400,true);
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped,sintonizado)
VALUES('22222222-2222-2222-2222-222222222222',
       'dddddddd-dddd-dddd-dddd-dddddddddddd',1,true,true);
UPDATE public.adventure_state SET stage=570,last_tick_at=now()-interval '30 minutes'
WHERE user_id='22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
SELECT (public.sync_auto_adventure()->>'stage')::int AS stage;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT won AND boss_id=
  '00000000-0000-0000-0000-000000000057'::uuid AND hero_power=990
  AND enemy_power=885 FROM public.adventure_encounters
  WHERE user_id='22222222-2222-2222-2222-222222222222' AND stage=570),
  'last regular boss remains mathematically reachable');
UPDATE public.adventure_state SET stage=580,last_tick_at=now()-interval '30 minutes'
WHERE user_id='22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
SELECT (public.sync_auto_adventure()->>'stage')::int AS stage;
SELECT (public.sync_auto_adventure()->>'stage')::int AS stage;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=1 AND bool_and(boss_id=
  '00000000-0000-0000-0000-000000000001'::uuid)
  FROM public.adventure_encounters WHERE user_id='22222222-2222-2222-2222-222222222222'
    AND stage=580),'catalog cycles after last boss without replay');
SELECT pg_temp.assert_true((SELECT enemy_power=900 AND hero_power=990 FROM public.adventure_encounters
  WHERE user_id='22222222-2222-2222-2222-222222222222' AND stage=580),
  'cycle obeys calibrated power caps');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.boss_battles
  WHERE user_id='22222222-2222-2222-2222-222222222222'
    AND boss_id='00000000-0000-0000-0000-000000000001' AND won),
  'repeated sync does not duplicate boss counter');
UPDATE public.adventure_state SET stage=1000,last_tick_at=now()-interval '1 hour'
WHERE user_id='22222222-2222-2222-2222-222222222222';
SET ROLE authenticated;
SET request.jwt.claim.sub='22222222-2222-2222-2222-222222222222';
SELECT (public.sync_auto_adventure()->>'stage')::int AS stage;
RESET ROLE;
SELECT pg_temp.assert_true((SELECT won AND enemy_power=900 FROM public.adventure_encounters
  WHERE user_id='22222222-2222-2222-2222-222222222222' AND stage=1000),
  'boss power caps at 900');
SELECT pg_temp.assert_true((SELECT won AND enemy_power=880 FROM public.adventure_encounters
  WHERE user_id='22222222-2222-2222-2222-222222222222' AND stage=1001),
  'normal power caps at 880');
SELECT pg_temp.assert_true((SELECT gold_today=120 FROM public.adventure_state
  WHERE user_id='22222222-2222-2222-2222-222222222222'),
  'continued wins do not exceed daily gold cap');

-- Defeat holds the stage; a later server-observed equipment/training change
-- allows the retry, and only that won encounter creates the pet entitlement.
UPDATE public.adventure_state SET stage=240,attempt=0,last_tick_at=now()-interval '30 minutes'
WHERE user_id='11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT (public.sync_auto_adventure()->>'stage')::int AS stage;
SELECT pg_temp.assert_true((SELECT NOT unlocked FROM public.get_pet_catalog()
  WHERE pet_type='mini_necromante'),'defeat does not unlock mapped pet');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT NOT won AND boss_id=
  '00000000-0000-0000-0000-000000000024' FROM public.adventure_encounters
  WHERE user_id='11111111-1111-1111-1111-111111111111'
    AND stage=240 AND attempt=0),'defeat records exact boss without entitlement');
SELECT pg_temp.assert_true((SELECT stage=240 AND attempt=1 FROM public.adventure_state
  WHERE user_id='11111111-1111-1111-1111-111111111111'),
  'defeat stays at same stage');
UPDATE public.attributes SET level=23 WHERE user_id='11111111-1111-1111-1111-111111111111';
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped,sintonizado)
VALUES('11111111-1111-1111-1111-111111111111',
       'ef940514-c30a-4f86-b39c-cbe82eef3f3a',1,true,true);
UPDATE public.adventure_state SET last_tick_at=now()-interval '30 minutes'
WHERE user_id='11111111-1111-1111-1111-111111111111';
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT (public.sync_auto_adventure()->>'stage')::int AS stage;
SELECT (public.sync_auto_adventure()->>'stage')::int AS stage;
SELECT pg_temp.assert_true((SELECT unlocked FROM public.get_pet_catalog()
  WHERE pet_type='mini_necromante'),'retry win unlocks mapped pet');
RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*)=2 AND count(*) FILTER (WHERE won)=1
  FROM public.adventure_encounters
  WHERE user_id='11111111-1111-1111-1111-111111111111' AND stage=240),
  'defeat and retry have one win');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.boss_battles
  WHERE user_id='11111111-1111-1111-1111-111111111111'
    AND boss_id='00000000-0000-0000-0000-000000000024' AND won),
  'retry credits boss counter once');
SELECT pg_temp.assert_true((SELECT total_xp=0 AND level=50 FROM public.profiles
  WHERE user_id='11111111-1111-1111-1111-111111111111'),
  'defeat and retry preserve XP and level');
SELECT 'boss auto assertions passed' AS result;
