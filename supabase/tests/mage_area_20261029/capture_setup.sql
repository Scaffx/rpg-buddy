\set ON_ERROR_STOP on
-- Dedicated synthetic database only. The values below are never used by the migration.
CREATE TABLE app_private.mage_capture(user_id uuid PRIMARY KEY, public_response jsonb NOT NULL);
INSERT INTO public.skill_tree_nodes(id,tree,node_type,name,effect) VALUES
  ('m_bola_fogo','mago','skill','Bola de Fogo','{"kind":"skill","element":"fogo","power":60,"mpCost":8,"effectType":"dano","cooldown":2}'),
  ('m_lanca_gelo','mago','skill','Lança de Gelo','{"kind":"skill","element":"gelo","power":58,"mpCost":8,"effectType":"dano","cooldown":2}'),
  ('m_corrente_raio','mago','skill','Corrente de Raio','{"kind":"skill","element":"raio","power":56,"mpCost":8,"effectType":"dano","cooldown":2}'),
  ('test_control','mago','skill','Controle sintético','{"kind":"skill","element":"arcano","power":20,"mpCost":4,"effectType":"cc","cooldown":2}'),
  ('m_fogo_var','mago','variant','Meteoro','{"kind":"variant","aoe":true,"bonus_pct":40}'),
  ('m_gelo_var','mago','variant','Nova Gélida','{"kind":"variant","aoe":true,"bonus_pct":40}'),
  ('m_raio_var','mago','variant','Tornado','{"kind":"variant","aoe":true,"bonus_pct":40}');
UPDATE app_private.adventure_enemy_catalog SET resistances='{"fire":0.1,"ice":0.1}'::jsonb
  WHERE biome=0 AND slot IN (1,2);
INSERT INTO auth.users(id) VALUES
  ('a0000000-0000-0000-0000-00000000a821'),
  ('a0000000-0000-0000-0000-00000000a822'),
  ('a0000000-0000-0000-0000-00000000a823'),
  ('a0000000-0000-0000-0000-00000000a824'),
  ('a0000000-0000-0000-0000-00000000a825'),
  ('a0000000-0000-0000-0000-00000000a826');
INSERT INTO public.profiles(user_id,level,starter_class,current_class_id,combat_skill_loadout) VALUES
  ('a0000000-0000-0000-0000-00000000a821',20,'mago',
    '00000002-0000-0000-0000-000000000002',
    '[{"id":"m_bola_fogo"},{"id":"m_lanca_gelo"}]'),
  ('a0000000-0000-0000-0000-00000000a822',20,'mago',
    '00000002-0000-0000-0000-000000000002','[{"id":"m_bola_fogo"}]'),
  ('a0000000-0000-0000-0000-00000000a823',20,'mago',
    '00000002-0000-0000-0000-000000000002','[{"id":"m_corrente_raio"}]'),
  ('a0000000-0000-0000-0000-00000000a824',20,'mago',
    '00000002-0000-0000-0000-000000000002','[{"id":"m_bola_fogo"}]'),
  ('a0000000-0000-0000-0000-00000000a825',20,'mago',
    '00000002-0000-0000-0000-000000000002','[{"id":"m_lanca_gelo"}]'),
  ('a0000000-0000-0000-0000-00000000a826',20,'mago',
    '00000002-0000-0000-0000-000000000002','[{"id":"test_control"}]');
INSERT INTO public.player_skill_nodes(user_id,node_id,rank)
SELECT u.id,n.id,1 FROM auth.users u CROSS JOIN (VALUES
  ('m_bola_fogo'),('m_lanca_gelo'),('m_fogo_var'),('m_gelo_var')) n(id)
  WHERE u.id IN ('a0000000-0000-0000-0000-00000000a821',
                 'a0000000-0000-0000-0000-00000000a822')
    AND (u.id='a0000000-0000-0000-0000-00000000a821'
      OR n.id IN ('m_bola_fogo','m_fogo_var'));
INSERT INTO public.player_skill_nodes(user_id,node_id,rank) VALUES
  ('a0000000-0000-0000-0000-00000000a823','m_corrente_raio',1),
  ('a0000000-0000-0000-0000-00000000a823','m_raio_var',1),
  ('a0000000-0000-0000-0000-00000000a824','m_bola_fogo',1),
  ('a0000000-0000-0000-0000-00000000a825','m_lanca_gelo',1),
  ('a0000000-0000-0000-0000-00000000a825','m_gelo_var',1),
  ('a0000000-0000-0000-0000-00000000a826','test_control',1);
INSERT INTO public.adventure_state(user_id,stage,last_tick_at) VALUES
  ('a0000000-0000-0000-0000-00000000a822',10,clock_timestamp());
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a821';
SELECT public.sync_auto_adventure() AS response \gset mage_horde_
RESET ROLE;
INSERT INTO app_private.mage_capture VALUES
  ('a0000000-0000-0000-0000-00000000a821', :'mage_horde_response'::jsonb);
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a822';
SELECT public.sync_auto_adventure() AS response \gset mage_boss_
RESET ROLE;
INSERT INTO app_private.mage_capture VALUES
  ('a0000000-0000-0000-0000-00000000a822', :'mage_boss_response'::jsonb);
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a823';
SELECT public.sync_auto_adventure() AS response \gset mage_tornado_
RESET ROLE;
INSERT INTO app_private.mage_capture VALUES
  ('a0000000-0000-0000-0000-00000000a823', :'mage_tornado_response'::jsonb);
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a824';
SELECT public.sync_auto_adventure() AS response \gset mage_single_
RESET ROLE;
INSERT INTO app_private.mage_capture VALUES
  ('a0000000-0000-0000-0000-00000000a824', :'mage_single_response'::jsonb);
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a825';
SELECT public.sync_auto_adventure() AS response \gset mage_nova_
RESET ROLE;
INSERT INTO app_private.mage_capture VALUES
  ('a0000000-0000-0000-0000-00000000a825', :'mage_nova_response'::jsonb);
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a826';
SELECT public.sync_auto_adventure() AS response \gset mage_control_
RESET ROLE;
INSERT INTO app_private.mage_capture VALUES
  ('a0000000-0000-0000-0000-00000000a826', :'mage_control_response'::jsonb);
DO $assert$
DECLARE h app_private.adventure_battles%ROWTYPE; boss app_private.adventure_battles%ROWTYPE;
  h3 jsonb; h2 jsonb;
BEGIN
  SELECT * INTO STRICT h FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000a821';
  SELECT * INTO STRICT boss FROM app_private.adventure_battles
    WHERE user_id='a0000000-0000-0000-0000-00000000a822';
  SELECT x INTO STRICT h3 FROM jsonb_array_elements(h.events) x
    WHERE x->>'skill_id'='m_fogo_var' LIMIT 1;
  SELECT x INTO STRICT h2 FROM jsonb_array_elements(h.events) x
    WHERE x->>'skill_id'='m_gelo_var' LIMIT 1;
  IF h3->'target_slots'<>'[0,1,2]'::jsonb
    OR h2->'target_slots'<>'[1,2]'::jsonb
    OR boss.kind<>'boss'
    OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(boss.events) x
      WHERE x->>'skill_id'='m_fogo_var' AND x->'target_slots'='[0]'::jsonb)
    OR (SELECT public_response->'battle'->>'engine_version' FROM app_private.mage_capture
      WHERE user_id=h.user_id)<>'v4_horde'
    OR NOT EXISTS (SELECT 1 FROM app_private.mage_capture c,
      jsonb_array_elements(c.public_response->'battle'->'events') x
      WHERE c.user_id=h.user_id AND x->>'skill_id'='m_fogo_var'
        AND x->'target_slots'='[0,1,2]'::jsonb)
    OR NOT EXISTS (SELECT 1 FROM app_private.mage_capture c,
      jsonb_array_elements(c.public_response->'battle'->'events') x
      WHERE c.user_id=h.user_id AND x->>'skill_id'='m_gelo_var'
        AND x->'target_slots'='[1,2]'::jsonb)
    OR NOT EXISTS (SELECT 1 FROM app_private.mage_capture c,
      jsonb_array_elements(c.public_response->'battle'->'events') x
      WHERE c.user_id=boss.user_id AND x->>'skill_id'='m_fogo_var'
        AND x->'target_slots'='[0]'::jsonb)
    OR NOT EXISTS (SELECT 1 FROM app_private.mage_capture c,
      jsonb_array_elements(c.public_response->'battle'->'events') x
      WHERE c.user_id='a0000000-0000-0000-0000-00000000a823'
        AND x->>'skill_id'='m_raio_var' AND x->'target_slots'='[0,1,2]'::jsonb)
    OR NOT EXISTS (SELECT 1 FROM app_private.mage_capture c,
      jsonb_array_elements(c.public_response->'battle'->'events') x
      WHERE c.user_id='a0000000-0000-0000-0000-00000000a824'
        AND x->>'skill_id'='m_bola_fogo' AND x->'target_slots'='[0]'::jsonb)
    OR NOT EXISTS (SELECT 1 FROM app_private.mage_capture c,
      jsonb_array_elements(c.public_response->'battle'->'events') x
      WHERE c.user_id='a0000000-0000-0000-0000-00000000a825'
        AND x->>'skill_id'='m_gelo_var' AND x->'target_slots'='[0,1,2]'::jsonb)
    OR NOT EXISTS (SELECT 1 FROM app_private.mage_capture c,
      jsonb_array_elements(c.public_response->'battle'->'events') x
      WHERE c.user_id='a0000000-0000-0000-0000-00000000a826'
        AND x->>'skill_id'='test_control' AND x->'target_slots'='[0]'::jsonb
        AND x->'hits'='[{"target_slot":0,"damage":0,"raw_damage":0,"damage_multiplier":1}]'::jsonb
        AND (x->>'damage')::integer=0)
  THEN RAISE EXCEPTION 'MAGE_CAPTURE_SHAPE_FAILED h3=% h2=% boss=%',h3,h2,boss.kind; END IF;
  RAISE NOTICE 'MAGE_CAPTURE_PUBLIC_WRAPPERS_PASS';
END $assert$;
