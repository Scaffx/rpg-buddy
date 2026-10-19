-- Composed public RPC proof: a spent mission reward blocks undo, while gold
-- earned later in the automatic adventure can fund the exact debit and redo.
-- Reduced local fixture only. No external clock or remote state is changed.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '30s';
INSERT INTO auth.users(id,email) VALUES
 ('c7500000-0000-0000-0000-000000000001','gold-undo@example.invalid');
UPDATE public.user_balance SET gold=0
 WHERE user_id='c7500000-0000-0000-0000-000000000001';
INSERT INTO public.game_items(id,name,category,rarity,shop_price,stackable,
  is_consumable,level_required)
VALUES('c7500000-0000-0000-0000-000000000011','Gold undo purchase',
  'weapon','comum',2,false,false,1);
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,days_of_week)
SELECT 'c7500000-0000-0000-0000-000000000101',a.user_id,'Gold undo routine',
       a.id,'media','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb
  FROM public.attributes a
 WHERE a.user_id='c7500000-0000-0000-0000-000000000001'
   AND a.name='Disciplina';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c7500000-0000-0000-0000-000000000001';
SELECT public.complete_mission('c7500000-0000-0000-0000-000000000101',
  (now() AT TIME ZONE 'America/Sao_Paulo')::date);
SELECT public.purchase_game_item('c7500000-0000-0000-0000-000000000011',
  'c7500000-0000-0000-0000-000000000021');
DO $blocked$
BEGIN
  BEGIN
    PERFORM public.undo_mission('c7500000-0000-0000-0000-000000000101',
      (now() AT TIME ZONE 'America/Sao_Paulo')::date);
    RAISE EXCEPTION 'undo unexpectedly debited a spent reward';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'Saldo de ouro insuficiente para desfazer' THEN RAISE; END IF;
  END;
END;
$blocked$;
RESET ROLE;
DO $before_adventure$
BEGIN
  IF (SELECT gold FROM public.user_balance
      WHERE user_id='c7500000-0000-0000-0000-000000000001') <> 0
     OR (SELECT total_xp FROM public.profiles
      WHERE user_id='c7500000-0000-0000-0000-000000000001') <> 25
     OR (SELECT inspired_available FROM public.profiles
      WHERE user_id='c7500000-0000-0000-0000-000000000001') IS DISTINCT FROM false
     OR (SELECT count(*) FROM public.user_inventory
      WHERE user_id='c7500000-0000-0000-0000-000000000001') <> 1
  THEN RAISE EXCEPTION 'failed undo was not atomic or purchase changed'; END IF;
END;
$before_adventure$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c7500000-0000-0000-0000-000000000001';
SELECT public.sync_auto_adventure();
SELECT public.undo_mission('c7500000-0000-0000-0000-000000000101',
  (now() AT TIME ZONE 'America/Sao_Paulo')::date);
SELECT public.complete_mission('c7500000-0000-0000-0000-000000000101',
  (now() AT TIME ZONE 'America/Sao_Paulo')::date);
RESET ROLE;
DO $after_redo$
BEGIN
  IF (SELECT gold FROM public.user_balance
      WHERE user_id='c7500000-0000-0000-0000-000000000001') <> 4
     OR (SELECT total_xp FROM public.profiles
      WHERE user_id='c7500000-0000-0000-0000-000000000001') <> 25
     OR (SELECT count(*) FROM public.user_inventory
      WHERE user_id='c7500000-0000-0000-0000-000000000001') <> 1
     OR (SELECT count(*) FROM public.adventure_encounters
      WHERE user_id='c7500000-0000-0000-0000-000000000001' AND won AND gold=4) <> 1
  THEN RAISE EXCEPTION 'adventure-funded undo/redo changed wallet, XP or item'; END IF;
END;
$after_redo$;
ROLLBACK;
