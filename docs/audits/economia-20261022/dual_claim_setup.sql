\set ON_ERROR_STOP on
INSERT INTO app_private.adventure_chests
  (id,user_id,battle_id,rarity,hero_class,hero_level,gold_amount,scrap_amount,
   essence_material,essence_amount,potion_amount,open_hours,status,
   acquired_at,started_at,ready_at)
VALUES
  ('00000000-0000-0000-0000-000000000095',
   '11111111-1111-1111-1111-111111111111',
   '00000000-0000-0000-0000-000000000096','comum','guerreiro',10,40,2,
   'normal',0,0,1,'opening',now()-interval '3 hours',
   now()-interval '2 hours',now()-interval '1 hour');
