-- Only run after audit_pre.sql, ENABLE REPLICA TRIGGER
-- enforce_mission_priority, and a candidate migration that unexpectedly passed.
SET LOCAL request.jwt.claim.sub = 'b3210000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
DO $audit_replica$
DECLARE v_uid uuid := auth.uid(); v_attr uuid; v_i integer;
BEGIN
  SELECT id INTO STRICT v_attr FROM public.attributes
  WHERE user_id=v_uid AND name='Disciplina';
  FOR v_i IN 1..5 LOOP
    INSERT INTO public.missions(user_id,title,attribute_id,priority,status,days_of_week)
    VALUES(v_uid,'audit-replica-high-'||v_i,v_attr,'alta',NULL,
           '["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]'::jsonb);
  END LOOP;
  IF (SELECT count(*) FROM public.missions
      WHERE user_id=v_uid AND title LIKE 'audit-replica-high-%'
        AND status='pendente') <> 5 THEN
    RAISE EXCEPTION 'AUDIT_REPLICA_BYPASS_NOT_REPRODUCED';
  END IF;
END;
$audit_replica$;
RESET ROLE;
SELECT 'AUDIT_UNSAFE_REPLICA_GUARD_ACCEPTED' AS result;
ROLLBACK;
