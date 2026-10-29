\set ON_ERROR_STOP on
DO $test$
DECLARE s app_private.pet_care_state%ROWTYPE;
  c public.companions%ROWTYPE; v_part numeric;
BEGIN
  SELECT * INTO STRICT s FROM app_private.pet_care_state
    WHERE companion_id='d0000000-0000-0000-0000-000000000001';
  SELECT * INTO STRICT c FROM public.companions WHERE id=s.companion_id;
  v_part:=app_private.pet_care_participation(s.companion_id,clock_timestamp());
  IF s.baseline_at<c.created_at OR s.baseline_at<clock_timestamp()-interval '1 minute'
    OR s.last_feed_at<>s.baseline_at OR s.last_care_at<>s.baseline_at
    OR s.next_feed_at<>s.baseline_at+interval '24 hours' OR v_part<>1 THEN
    RAISE EXCEPTION 'PET_CARE_EXISTING_BASELINE'; END IF;
  RAISE NOTICE 'PET_CARE_EXISTING_BASELINE_PASS';
END $test$;
