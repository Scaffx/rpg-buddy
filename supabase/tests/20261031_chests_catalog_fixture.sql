\set ON_ERROR_STOP on
DO $role$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $role$;
-- Match live postgres-owned public function default grants; migration must
-- revoke inherited/direct client EXECUTE on its sensitive new functions.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
-- The reduced composed source has two Time Shop rows. Supply the other
-- known pre-migration catalog effects without changing the frozen sources.
UPDATE public.shop_items SET effect='double_xp' WHERE effect='xp_boost';
UPDATE public.shop_items SET cost_percent=3800 WHERE effect='streak_protector';
INSERT INTO public.shop_items(id,name,cost_percent,effect,duration)
SELECT md5('20261031-time-shop:'||effect)::uuid,effect,old_cost,effect,'1h'
FROM (VALUES
 ('tv_session',570),('gaming',760),('extra_time',684),('free_meal',950),('social',1140),
 ('revive',950),('rest',1520),('shield',1900),
 ('adrenalina',1330),('foco_profundo',1520),('attr_boost',1710),
 ('boss_buff',2090),('auto_complete',2280),('streak_protector',3800)
) x(effect,old_cost)
WHERE NOT EXISTS (SELECT 1 FROM public.shop_items s WHERE s.effect=x.effect);

INSERT INTO public.game_items
 (id,name,icon,category,rarity,shop_price,level_required,matk_bonus,
  is_consumable,is_starter,stackable)
VALUES
 ('31000000-0000-4000-8000-000000000101','Pincel da Realidade','P',
  'weapon','raro',165,11,7,false,false,false),
 ('31000000-0000-4000-8000-000000000102','Grimorio do Codigo Limpo','G',
  'weapon','epico',320,16,8,false,false,false),
 ('31000000-0000-4000-8000-000000000103','Caderno de Esbocos Infinito','C',
  'accessory','lendario',510,22,10,false,false,false),
 ('31000000-0000-4000-8000-000000000104','Caderno de Esbocos Infinito','X',
  'accessory','lendario',510,22,10,false,false,false);
UPDATE public.game_items SET boss_drop_level=22
WHERE id='31000000-0000-4000-8000-000000000104';

-- A chest acquired under v1 must retain its material payout after v2 applies.
UPDATE public.user_balance SET gold=100000
WHERE user_id='11111111-1111-1111-1111-111111111111';
INSERT INTO app_private.adventure_chests
 (id,user_id,battle_id,rarity,hero_class,hero_level,gold_amount,scrap_amount,
  essence_material,essence_amount,potion_amount,open_hours,acquired_at)
VALUES('31000000-0000-4000-8000-000000000001',
 '11111111-1111-1111-1111-111111111111',
 '31000000-0000-4000-8000-000000000010',
 'comum','guerreiro',5,40,2,'normal',0,0,1,clock_timestamp()-interval '2 hours');
