\set ON_ERROR_STOP on
INSERT INTO auth.users(id) VALUES
  ('44444444-4444-4444-4444-444444444444'),
  ('55555555-5555-5555-5555-555555555555');
INSERT INTO public.profiles(user_id,level,starter_class,current_class_id)
VALUES ('44444444-4444-4444-4444-444444444444',1,'novato',
    '00000001-0000-0000-0000-000000000001'),
  ('55555555-5555-5555-5555-555555555555',5,'clerico',NULL);
INSERT INTO app_private.hero_class_identity(user_id,starter_class)
VALUES ('55555555-5555-5555-5555-555555555555','clerico');
DO $test$
DECLARE v_cleric uuid; v_n integer:=0; v_end timestamptz:=clock_timestamp()-interval '1 minute';
BEGIN
  IF app_private.hero_class_key('44444444-4444-4444-4444-444444444444')<>'aprendiz'
    OR app_private.hero_class_key('55555555-5555-5555-5555-555555555555')<>'novato'
  THEN RAISE EXCEPTION 'live class snapshot fixture mismatch'; END IF;
  INSERT INTO app_private.adventure_battles
    (id,user_id,stage,kind,status,hero_class,hero_level,biome,started_at,ends_at)
  VALUES('44444444-4444-4444-4444-444444444445',
    '44444444-4444-4444-4444-444444444444',1,'normal','fighting',
    'aprendiz',1,'forest',v_end-interval '15 seconds',v_end);
  UPDATE app_private.adventure_battles SET status='won'
    WHERE id='44444444-4444-4444-4444-444444444445';
  LOOP
    v_n:=v_n+1;
    v_cleric:=md5('chest-cleric:'||v_n)::uuid;
    EXIT WHEN app_private.adventure_chest_roll(v_cleric,'rarity') BETWEEN 7200 AND 9199
      AND app_private.adventure_chest_roll(v_cleric,'equipment')<1500;
    IF v_n>100000 THEN RAISE EXCEPTION 'no cleric seed'; END IF;
  END LOOP;
  INSERT INTO app_private.adventure_battles
    (id,user_id,stage,kind,status,hero_class,hero_level,biome,started_at,ends_at)
  VALUES(v_cleric,'55555555-5555-5555-5555-555555555555',2,'normal',
    'fighting','novato',5,'forest',v_end-interval '15 seconds',v_end);
  UPDATE app_private.adventure_battles SET status='won' WHERE id=v_cleric;
  IF (SELECT equipment_item_id FROM app_private.adventure_chests
      WHERE battle_id='44444444-4444-4444-4444-444444444445') IS NOT NULL
    OR (SELECT hero_class FROM app_private.adventure_chests
      WHERE battle_id=v_cleric)<>'clerico'
    OR (SELECT equipment_item_id FROM app_private.adventure_chests
      WHERE battle_id=v_cleric) IS DISTINCT FROM
        'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid THEN
    RAISE EXCEPTION 'apprentice/cleric equipment mapping mismatch';
  END IF;
END $test$;
