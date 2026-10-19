-- Simulate a completion whose old ledger has no A12 provenance receipt.
BEGIN;
SET LOCAL statement_timeout='30s';
INSERT INTO auth.users(id,email) VALUES
 ('a1700000-0000-0000-0000-000000000001','cold-legacy@example.invalid');
INSERT INTO public.missions(id,user_id,title,priority,frequency_type,days_of_week,mission_category)
VALUES ('a1700000-0000-0000-0000-000000000101',
 'a1700000-0000-0000-0000-000000000001','legacy receipt','media','daily',
 '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]','geral');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='a1700000-0000-0000-0000-000000000001';
SELECT public.complete_mission('a1700000-0000-0000-0000-000000000101',
 (now() AT TIME ZONE 'America/Sao_Paulo')::date)->>'xp_gained' AS paid_xp;
RESET ROLE;
DELETE FROM private.mission_effect_receipts
WHERE mission_id='a1700000-0000-0000-0000-000000000101';
SET LOCAL ROLE authenticated;
DO $legacy$
DECLARE
 d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
 x integer;
 g integer;
 a integer;
 refused boolean := false;
BEGIN
 SELECT total_xp INTO x FROM public.profiles WHERE user_id=auth.uid();
 SELECT gold INTO g FROM public.user_balance WHERE user_id=auth.uid();
 SELECT xp INTO a FROM public.attributes WHERE user_id=auth.uid() AND name='Disciplina';
 BEGIN
   PERFORM public.undo_mission('a1700000-0000-0000-0000-000000000101',d);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
   IF SQLERRM LIKE 'DERIVED_EFFECT_RECEIPT_MISSING:%' THEN refused := true; ELSE RAISE; END IF;
 END;
 IF NOT refused
    OR (SELECT total_xp FROM public.profiles WHERE user_id=auth.uid()) <> x
    OR (SELECT gold FROM public.user_balance WHERE user_id=auth.uid()) <> g
    OR (SELECT xp FROM public.attributes WHERE user_id=auth.uid() AND name='Disciplina') <> a
    OR NOT EXISTS (SELECT 1 FROM public.mission_daily_completions
      WHERE mission_id='a1700000-0000-0000-0000-000000000101' AND completion_date=d)
 THEN RAISE EXCEPTION 'UNVERIFIED_LEGACY_UNDO_CHANGED_STATE'; END IF;
 RAISE NOTICE 'COLD_LEGACY_PASS: missing effect provenance refused without balance change';
END $legacy$;
ROLLBACK;
