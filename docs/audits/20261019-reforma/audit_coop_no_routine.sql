-- Negative public-RPC probe against a disposable database seeded with the
-- historical co-op migrations and then the eleven reform migrations.
-- psql -X -v ON_ERROR_STOP=1 -f this_file; disconnect rolls back on failure.
BEGIN;
SET LOCAL statement_timeout = '30s';
INSERT INTO auth.users(id,email) VALUES
 ('99999999-9999-9999-9999-999999999999','audit-coop-direct@example.invalid');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
DO $audit$
DECLARE
  v_mission uuid;
  v_xp integer;
BEGIN
  v_mission := public.create_co_op_mission('Audit collective', 'No routine linked',
    ARRAY['11111111-1111-1111-1111-111111111111'::uuid],7,7);
  PERFORM public.complete_co_op_mission(v_mission);
  SELECT total_xp INTO v_xp FROM public.profiles WHERE user_id=auth.uid();
  RAISE NOTICE 'co-op requested target=7, routine completions=0, profile XP=%',v_xp;
  IF v_xp<>0 THEN
    RAISE EXCEPTION 'AUDIT_COOP_XP_WITHOUT_ROUTINE: target 7 ignored by reward RPC';
  END IF;
END;
$audit$;
ROLLBACK;
