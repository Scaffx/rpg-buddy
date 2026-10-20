-- KNOWN P1, expected exit 3 until reparo13. Run after reduced integrated
-- fixture + eleven migrations + A12; the transaction always rolls back.
-- Trigger body matches the read-only live snapshot of 2026-10-19.
BEGIN;
SET LOCAL statement_timeout='30s';
ALTER TABLE public.profiles ADD COLUMN pontos_talento integer NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.get_level_from_xp_v2(p_total_xp integer)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  xp_table int[] := ARRAY[
        0,    320,   1000,   2080,   3600,   5600,   8120,  11200,  14880,  19200,
    24200,  29920,  36400,  43680,  51800,  60800,  70720,  81600,  93480, 106400,
   120400, 135520, 151800, 169280, 188000, 208000, 229320, 252000, 276080, 301600,
   328600, 357120, 387200, 418880, 452200, 487200, 523920, 562400, 602680, 644800,
   688800, 734720, 782600, 832480, 884400, 938400, 994520,1052800,1113280,1176000,
  1241000,1308320,1378000,1450080,1524600,1601600,1681120,1763200,1847880,1935200
  ];
  v_xp int := GREATEST(0, COALESCE(p_total_xp, 0));
  i int;
BEGIN
  FOR i IN REVERSE array_length(xp_table, 1)..2 LOOP
    IF v_xp >= xp_table[i] THEN RETURN i; END IF;
  END LOOP;
  RETURN 1;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_talent_points_on_level_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  old_chunks integer;
  new_chunks integer;
  gain integer;
BEGIN
  old_chunks := floor(COALESCE(OLD.level, 1) / 5.0);
  new_chunks := floor(COALESCE(NEW.level, 1) / 5.0);
  gain := GREATEST(0, new_chunks - old_chunks);

  IF gain > 0 THEN
    NEW.pontos_talento := COALESCE(NEW.pontos_talento, 0) + gain;
  ELSE
    NEW.pontos_talento := COALESCE(NEW.pontos_talento, 0);
  END IF;

  RETURN NEW;
END;
$function$;
CREATE TRIGGER sync_talent_points_on_level_change_trigger
 BEFORE UPDATE OF level ON public.profiles FOR EACH ROW
 EXECUTE FUNCTION public.sync_talent_points_on_level_change();
DO $source$
BEGIN
  IF md5(replace(pg_get_functiondef(
      'public.get_level_from_xp_v2(integer)'::regprocedure),E'\r\n',E'\n'))
      <> '94aa330f1f9e444fc96b6ffd6be48f8e' THEN
    RAISE EXCEPTION 'LEVEL_CURVE_SOURCE_DRIFT';
  END IF;
  IF md5(replace(pg_get_functiondef(
      'public.sync_talent_points_on_level_change()'::regprocedure),E'\r\n',E'\n'))
      <> 'c4481ca3cd7dc1a149443dc4047e0cb8' THEN
    RAISE EXCEPTION 'TALENT_TRIGGER_SOURCE_DRIFT';
  END IF;
END;
$source$;
INSERT INTO auth.users(id,email) VALUES
 ('c7400000-0000-0000-0000-000000000001','talent-repro@example.invalid');
UPDATE public.profiles SET total_xp=3590,level=4
 WHERE user_id='c7400000-0000-0000-0000-000000000001';
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,frequency_type,days_of_week,mission_category)
SELECT 'c7400000-0000-0000-0000-000000000101',a.user_id,'Level threshold',a.id,
       'media','daily','["Dom","Seg","Ter","Qua","Qui","Sex","Sab"]'::jsonb,'geral'
  FROM public.attributes a
 WHERE a.user_id='c7400000-0000-0000-0000-000000000001' AND a.name='Disciplina';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c7400000-0000-0000-0000-000000000001';
DO $repro$
DECLARE
  d date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  u uuid := auth.uid();
BEGIN
  PERFORM public.complete_mission('c7400000-0000-0000-0000-000000000101',d);
  IF (SELECT (level,total_xp,pontos_talento) FROM public.profiles WHERE user_id=u)
     IS DISTINCT FROM ROW(5,3615,1) THEN
    RAISE EXCEPTION 'Threshold fixture did not grant the expected point';
  END IF;
  PERFORM public.undo_mission('c7400000-0000-0000-0000-000000000101',d);
  IF (SELECT (level,total_xp,pontos_talento) FROM public.profiles WHERE user_id=u)
     IS DISTINCT FROM ROW(4,3590,1) THEN
    RAISE EXCEPTION 'Threshold undo fixture changed';
  END IF;
  RAISE EXCEPTION 'AUDIT_TALENT_POINT_REMAINS: live level-5 threshold 3600, XP3590 and point 1 after undo';
END;
$repro$;
ROLLBACK;
