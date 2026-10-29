\set ON_ERROR_STOP on
-- Run after frozen v4 and before the corrective migration in a fresh clone.
INSERT INTO public.skill_tree_nodes(id,tree,node_type,name,effect) VALUES
  ('m_bola_fogo','mago','skill','Bola de Fogo','{"kind":"skill","element":"fogo","power":60,"mpCost":8,"effectType":"dano","cooldown":2}'),
  ('m_fogo_var','mago','variant','Meteoro','{"kind":"variant","aoe":true,"bonus_pct":40}');
INSERT INTO auth.users(id) VALUES ('a0000000-0000-0000-0000-00000000a811');
INSERT INTO public.profiles(user_id,level,starter_class,current_class_id,combat_skill_loadout)
VALUES ('a0000000-0000-0000-0000-00000000a811',20,'mago',
  '00000002-0000-0000-0000-000000000002','[{"id":"m_bola_fogo"}]');
INSERT INTO public.player_skill_nodes(user_id,node_id,rank) VALUES
  ('a0000000-0000-0000-0000-00000000a811','m_bola_fogo',1),
  ('a0000000-0000-0000-0000-00000000a811','m_fogo_var',1);
SET ROLE authenticated;
SET request.jwt.claim.sub='a0000000-0000-0000-0000-00000000a811';
DO $$ BEGIN PERFORM public.sync_auto_adventure(); END $$;
RESET ROLE;
CREATE TABLE app_private.mage_inflight_marker AS
SELECT id,md5(events::text) events_md5,md5(rules_snapshot::text) rules_md5,
  md5(skills::text) skills_md5 FROM app_private.adventure_battles
WHERE user_id='a0000000-0000-0000-0000-00000000a811';
DO $assert$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_private.adventure_battles b
    WHERE b.user_id='a0000000-0000-0000-0000-00000000a811'
      AND b.engine_version='v4_horde' AND b.status='fighting'
      AND b.skills->0->>'id'='m_bola_fogo'
      AND NOT (b.events->2 ? 'hits'))
  THEN RAISE EXCEPTION 'MAGE_INFLIGHT_NOT_OLD_V4'; END IF;
  RAISE NOTICE 'MAGE_INFLIGHT_BEFORE_PASS';
END $assert$;
