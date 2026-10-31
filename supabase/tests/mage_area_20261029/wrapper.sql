\set ON_ERROR_STOP on
BEGIN;
-- Reduced PG17 fixture has no mage catalog rows. These protected synthetic
-- nodes reproduce the published IDs/effects; the client never supplies them.
INSERT INTO public.skill_tree_nodes(id,tree,node_type,name,effect) VALUES
  ('m_bola_fogo','mago','skill','Bola de Fogo','{"kind":"skill","element":"fogo","power":60,"mpCost":8,"effectType":"dano","cooldown":2}'),
  ('m_lanca_gelo','mago','skill','Lança de Gelo','{"kind":"skill","element":"gelo","power":58,"mpCost":8,"effectType":"dano","cooldown":2}'),
  ('m_corrente_raio','mago','skill','Corrente de Raio','{"kind":"skill","element":"raio","power":56,"mpCost":8,"effectType":"dano","cooldown":2}'),
  ('m_estouro','mago','skill','Estouro Arcano','{"kind":"skill","element":"arcano","power":62,"mpCost":9,"effectType":"dano","cooldown":2}'),
  ('m_fogo_var','mago','variant','Meteoro','{"kind":"variant","transform":"meteoro","aoe":true,"bonus_pct":40}'),
  ('m_gelo_var','mago','variant','Nova Gélida','{"kind":"variant","transform":"nova_gelida","aoe":true,"bonus_pct":40}'),
  ('m_raio_var','mago','variant','Tornado','{"kind":"variant","transform":"tornado","aoe":true,"bonus_pct":40}'),
  ('m_arc_var','mago','variant','Singularidade Arcana','{"kind":"variant","transform":"singularidade","bonus_pct":60}');
INSERT INTO auth.users(id)
SELECT ('a0000000-0000-0000-0000-00000000a8'||lpad(i::text,2,'0'))::uuid
  FROM generate_series(1,7) i;
INSERT INTO public.profiles(user_id,level,starter_class,current_class_id,combat_skill_loadout)
SELECT id,20,'mago',CASE WHEN right(id::text,2)='07' THEN NULL
  ELSE '00000002-0000-0000-0000-000000000002'::uuid END,
  jsonb_build_array(jsonb_build_object('id',CASE right(id::text,2)
    WHEN '02' THEN 'm_lanca_gelo' WHEN '03' THEN 'm_corrente_raio'
    WHEN '04' THEN 'm_estouro' ELSE 'm_bola_fogo' END,
    'name','Meteoro','power',999,'target_mode','all_enemies'))
FROM auth.users WHERE left(id::text,28)='a0000000-0000-0000-0000-0000';
INSERT INTO public.player_skill_nodes(user_id,node_id,rank)
SELECT ('a0000000-0000-0000-0000-00000000a8'||lpad(i::text,2,'0'))::uuid,
  CASE i WHEN 2 THEN 'm_lanca_gelo' WHEN 3 THEN 'm_corrente_raio'
    WHEN 4 THEN 'm_estouro' ELSE 'm_bola_fogo' END,1
FROM generate_series(1,7) i WHERE i<>6;
INSERT INTO public.player_skill_nodes(user_id,node_id,rank) VALUES
  ('a0000000-0000-0000-0000-00000000a801','m_fogo_var',1),
  ('a0000000-0000-0000-0000-00000000a802','m_gelo_var',1),
  ('a0000000-0000-0000-0000-00000000a803','m_raio_var',1),
  ('a0000000-0000-0000-0000-00000000a804','m_arc_var',1),
  ('a0000000-0000-0000-0000-00000000a806','m_fogo_var',1),
  ('a0000000-0000-0000-0000-00000000a807','m_fogo_var',1);
SET ROLE authenticated;
DO $call$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT ('a0000000-0000-0000-0000-00000000a8'||lpad(i::text,2,'0'))::uuid
    FROM generate_series(1,7) i LOOP
    PERFORM set_config('request.jwt.claim.sub',u::text,true);
    PERFORM public.sync_auto_adventure();
  END LOOP;
END $call$;
RESET ROLE;
DO $assert$
DECLARE b app_private.adventure_battles%ROWTYPE; first_hero jsonb; i integer;
  expected_id text; expected_mode text; expected_name text;
BEGIN
  FOR i IN 1..7 LOOP
    SELECT * INTO STRICT b FROM app_private.adventure_battles
      WHERE user_id=('a0000000-0000-0000-0000-00000000a8'||lpad(i::text,2,'0'))::uuid;
    SELECT x INTO STRICT first_hero FROM jsonb_array_elements(b.events) x
      WHERE x->>'actor'='hero' LIMIT 1;
    expected_id:=CASE i WHEN 1 THEN 'm_fogo_var' WHEN 2 THEN 'm_gelo_var'
      WHEN 3 THEN 'm_raio_var' WHEN 4 THEN 'm_arc_var'
      WHEN 5 THEN 'm_bola_fogo' ELSE NULL END;
    expected_mode:=CASE WHEN i<=3 THEN 'all_enemies' ELSE 'single' END;
    expected_name:=CASE i WHEN 1 THEN 'Meteoro' WHEN 2 THEN 'Nova Gélida'
      WHEN 3 THEN 'Tornado' WHEN 4 THEN 'Singularidade Arcana'
      WHEN 5 THEN 'Bola de Fogo' ELSE NULL END;
    IF b.engine_version<>'v4_horde'
      OR (i<=5 AND (b.skills->0->>'id' IS DISTINCT FROM expected_id
        OR b.skills->0->>'name' IS DISTINCT FROM expected_name
        OR b.skills->0->>'target_mode' IS DISTINCT FROM expected_mode
        OR first_hero->>'skill_id' IS DISTINCT FROM expected_id))
      OR (i<=3 AND first_hero->'target_slots' IS DISTINCT FROM '[0,1,2]'::jsonb)
      OR (i=4 AND first_hero->'target_slots' IS DISTINCT FROM '[0]'::jsonb)
      OR (i=5 AND first_hero->'target_slots' IS DISTINCT FROM '[0]'::jsonb)
      OR (i>=6 AND (b.skills<>'[]'::jsonb OR first_hero->>'skill_id' IS NOT NULL
        OR first_hero->'target_slots' IS DISTINCT FROM '[0]'::jsonb))
    THEN RAISE EXCEPTION 'MAGE_WRAPPER_AUTHORITY_FAILED user=% skills=% hit=%',i,b.skills,first_hero; END IF;
    IF EXISTS (SELECT 1 FROM public.gold_history WHERE user_id=b.user_id AND type='adventure')
      OR (SELECT level<>20 OR total_xp<>0 FROM public.profiles WHERE user_id=b.user_id)
    THEN RAISE EXCEPTION 'MAGE_WRAPPER_REWARD_OR_XP_FAILED user=%',i; END IF;
  END LOOP;
  RAISE NOTICE 'MAGE_AREA_WRAPPER_PASS';
END $assert$;
ROLLBACK;
