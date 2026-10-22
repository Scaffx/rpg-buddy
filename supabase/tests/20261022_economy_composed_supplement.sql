-- Apply after the 12-file PR70 replay, economy_live_extension_fixture.sql,
-- and the four exact source definitions prepared by Receitas.
-- All identity rows below are synthetic. No current user profile is copied.
BEGIN;
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure))
       <> 'ef8da5af1aa65460a92f160df438462b'
     OR md5(pg_get_functiondef('app_private.hero_class_key(uuid)'::regprocedure))
       <> 'da6e71eb8c5a2087a1cd4296a5418652'
     OR md5(pg_get_functiondef('app_private.class_path_matches(uuid,text,integer)'::regprocedure))
       <> '883c77c3a430855102403124f67c790d'
     OR md5(pg_get_functiondef('public.set_inventory_equipped(uuid,boolean,boolean)'::regprocedure))
       <> 'ba16fefce62bc1a6d06c30ef32c40813'
     OR md5(pg_get_functiondef('public.purchase_game_item(uuid,uuid)'::regprocedure))
       <> 'c87e285ceb35e67951a1a1b72f6d1a25'
     OR md5(pg_get_functiondef('public.buy_shop_item(uuid,date)'::regprocedure))
       <> 'cdb81d6e2dd7197db4e0c67d263a68b5'
     OR md5(pg_get_functiondef('public.buy_pet(text)'::regprocedure))
       <> '664ec81b0a86f65aad2cf7cc38db7b1b'
     OR md5(pg_get_functiondef('app_private.has_boss_unlock(uuid,uuid)'::regprocedure))
       <> 'ff5c308462ba3096ac23d37b6fb08b1a'
  THEN RAISE EXCEPTION 'COMPOSED_SOURCE_DRIFT' USING ERRCODE='22023'; END IF;
END;
$guard$;

ALTER TABLE public.game_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view game items" ON public.game_items FOR SELECT USING (true);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.game_items TO authenticated;
ALTER TABLE public.user_inventory ADD CONSTRAINT composed_inventory_id_unique UNIQUE(id);

CREATE TABLE public.user_crafting_materials(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id),
  quantity integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_crafting_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own crafting materials" ON public.user_crafting_materials
  FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users can update own crafting materials" ON public.user_crafting_materials
  FOR UPDATE TO authenticated USING (auth.uid()=user_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.user_crafting_materials TO authenticated;

UPDATE public.classes SET level_min=CASE WHEN column_index=1 THEN 1
  WHEN column_index=2 THEN 5 ELSE 15 END;
INSERT INTO auth.users(id) VALUES ('44444444-4444-4444-4444-444444444444');
INSERT INTO public.profiles(user_id,level,total_xp,starter_class,starter_item)
VALUES ('44444444-4444-4444-4444-444444444444',5,0,'clerico',NULL);
INSERT INTO app_private.hero_class_identity(user_id,starter_class,starter_item,current_class_id)
VALUES ('44444444-4444-4444-4444-444444444444','clerico',NULL,NULL);
INSERT INTO public.user_crafting_materials(user_id,quantity)
VALUES ('11111111-1111-1111-1111-111111111111',999999);
INSERT INTO public.bosses(id,name,level,icon,is_world_event)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Fixture Boss',10,'B',false);

-- Clone the full engine battle shape, then change only the authoritative
-- receipt fields. This retained synthetic win exercises historical unlock.
INSERT INTO app_private.adventure_battles
SELECT (jsonb_populate_record(NULL::app_private.adventure_battles,
  to_jsonb(b) || jsonb_build_object(
    'id','00000000-0000-0000-0000-000000000010',
    'user_id','11111111-1111-1111-1111-111111111111',
    'stage',10,'kind','boss','status','won','boss_id','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'hero_class','guerreiro','hero_level',1,'biome','forest',
    'started_at','2026-10-21T10:00:00Z','ends_at','2026-10-21T10:01:00Z',
    'gold_awarded',0))).*
FROM app_private.adventure_battles b LIMIT 1;
COMMIT;
