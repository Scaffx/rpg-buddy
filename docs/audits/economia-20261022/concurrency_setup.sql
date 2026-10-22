\set ON_ERROR_STOP on
-- Synthetic balances/materials/chests used only inside the isolated PG17 fixture.
UPDATE public.profiles SET level=10
WHERE user_id='11111111-1111-1111-1111-111111111111';
UPDATE public.user_balance SET gold=250000
WHERE user_id='11111111-1111-1111-1111-111111111111';
SELECT app_private.credit_adventure_material(
  '11111111-1111-1111-1111-111111111111','scrap',10,'review_concurrency',
  '00000000-0000-0000-0000-000000000090');
SELECT app_private.credit_adventure_material(
  '11111111-1111-1111-1111-111111111111','normal',10,'review_concurrency',
  '00000000-0000-0000-0000-000000000090');
INSERT INTO app_private.adventure_chests
  (id,user_id,battle_id,rarity,hero_class,hero_level,gold_amount,scrap_amount,
   essence_material,essence_amount,potion_amount,open_hours,status,
   acquired_at,started_at,ready_at)
VALUES
  ('00000000-0000-0000-0000-000000000090',
   '11111111-1111-1111-1111-111111111111',
   '00000000-0000-0000-0000-000000000091','comum','guerreiro',10,40,2,
   'normal',0,0,1,'opening',now()-interval '3 hours',
   now()-interval '2 hours',now()-interval '1 hour');
SELECT 'CONCURRENCY_SETUP_PASS';
