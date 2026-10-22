\set ON_ERROR_STOP on
-- Apply fixture, recipes migration and chests migration before this script.
INSERT INTO public.game_items
  (id,name,category,rarity,icon,stackable,is_consumable,effect,level_required)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc','Poção de HP Menor',
  'consumable','comum','🧪',true,true,'heal_30',1);
INSERT INTO public.game_items
  (id,name,category,rarity,icon,atk_bonus,level_required)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd','Lâmina comum','weapon','comum','⚔️',3,1),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','Lâmina lendária alta','weapon','lendario','⚔️',50,90),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff','Cajado arcano','weapon','raro','✨',0,1);
UPDATE public.game_items SET matk_bonus=5
  WHERE id='ffffffff-ffff-ffff-ffff-ffffffffffff';

DO $test$
DECLARE v_n integer; v_id uuid; v_rank text; v_target text;
        v_roll integer; v_end timestamptz; v_index integer:=0;
BEGIN
  FOREACH v_target IN ARRAY ARRAY['comum','raro','epico','lendario','comum'] LOOP
    v_n:=0;
    LOOP
      v_n:=v_n+1;
      v_id:=md5('chest-test:'||v_target||':'||v_index||':'||v_n)::uuid;
      v_roll:=app_private.adventure_chest_roll(v_id,'rarity');
      v_rank:=CASE WHEN v_roll<7200 THEN 'comum' WHEN v_roll<9200 THEN 'raro'
        WHEN v_roll<9900 THEN 'epico' ELSE 'lendario' END;
      EXIT WHEN v_rank=v_target;
      IF v_n>100000 THEN RAISE EXCEPTION 'no deterministic rarity seed'; END IF;
    END LOOP;
    v_end:=clock_timestamp()-interval '4 hours'+(v_index*interval '31 minutes');
    INSERT INTO app_private.adventure_battles
      (id,user_id,stage,kind,status,hero_class,hero_level,biome,started_at,ends_at)
    VALUES(v_id,'11111111-1111-1111-1111-111111111111',v_index+1,'normal',
      'fighting','guerreiro',5,'forest',v_end-interval '15 seconds',v_end);
    UPDATE app_private.adventure_battles SET status='won' WHERE id=v_id;
    v_index:=v_index+1;
  END LOOP;
  IF (SELECT count(*) FROM app_private.adventure_chests
      WHERE user_id='11111111-1111-1111-1111-111111111111' AND status='queued')<>4
     OR (SELECT count(*) FROM app_private.adventure_chest_win_receipts
      WHERE user_id='11111111-1111-1111-1111-111111111111' AND disposition='overflow')<>1
  THEN RAISE EXCEPTION 'queue or overflow count mismatch'; END IF;
  IF (SELECT count(DISTINCT rarity) FROM app_private.adventure_chests
      WHERE user_id='11111111-1111-1111-1111-111111111111')<>4 THEN
    RAISE EXCEPTION 'rarity seed mismatch'; END IF;
  v_end:=clock_timestamp()-interval '4 hours'+(v_index*interval '31 minutes')-interval '30 minutes';
  v_id:=md5('chest-test:cooldown')::uuid;
  INSERT INTO app_private.adventure_battles
    (id,user_id,stage,kind,status,hero_class,hero_level,biome,started_at,ends_at)
  VALUES(v_id,'11111111-1111-1111-1111-111111111111',6,'normal',
    'fighting','guerreiro',5,'forest',v_end-interval '15 seconds',v_end);
  UPDATE app_private.adventure_battles SET status='won' WHERE id=v_id;
  IF EXISTS (SELECT 1 FROM app_private.adventure_chest_win_receipts
      WHERE battle_id=v_id) THEN RAISE EXCEPTION 'cadence bypass'; END IF;
  IF (SELECT total_xp FROM public.profiles
      WHERE user_id='11111111-1111-1111-1111-111111111111')<>0 THEN
    RAISE EXCEPTION 'chest changed XP'; END IF;
END;
$test$;

-- A boss on another identity exercises the recipe and chest triggers together.
INSERT INTO app_private.adventure_battles
  (id,user_id,stage,kind,status,boss_id,hero_class,hero_level,biome,started_at,ends_at)
VALUES('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',10,'boss','fighting',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','mago',80,'forest',
  clock_timestamp()-interval '2 minutes',clock_timestamp()-interval '1 minute');
UPDATE app_private.adventure_battles SET status='won'
  WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
DO $test$ BEGIN
  IF (SELECT rarity FROM app_private.adventure_chest_win_receipts
      WHERE battle_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')='comum'
    OR (SELECT count(*) FROM app_private.adventure_material_receipts
      WHERE source_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
        AND material IN ('scrap','normal'))<>2
  THEN RAISE EXCEPTION 'boss integration mismatch'; END IF;
END $test$;
