CREATE OR REPLACE FUNCTION app_private.advance_auto_adventure(p_battle_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_state public.adventure_state%ROWTYPE;
  v_battle app_private.adventure_battles%ROWTYPE;
  v_request_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  IF p_battle_id IS NULL THEN RAISE EXCEPTION 'battle id required' USING ERRCODE='22023'; END IF;
  -- Match sync's profile, balance, state, battle lock order.
  PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  INSERT INTO public.user_balance(user_id,gold) VALUES(v_uid,100)
    ON CONFLICT(user_id) DO NOTHING;
  PERFORM 1 FROM public.user_balance WHERE user_id=v_uid FOR UPDATE;
  SELECT * INTO STRICT v_state FROM public.adventure_state WHERE user_id=v_uid FOR UPDATE;
  IF v_state.current_battle_id IS DISTINCT FROM p_battle_id THEN
    RAISE EXCEPTION 'stale adventure battle' USING ERRCODE='22023';
  END IF;
  SELECT * INTO STRICT v_battle FROM app_private.adventure_battles
   WHERE id=p_battle_id AND user_id=v_uid FOR UPDATE;
  -- A bounded catch-up can leave an already ended battle marked fighting.
  -- Take the clock after both locks so a wait cannot authorize a past fight.
  v_request_at := clock_timestamp();
  IF v_battle.status<>'fighting' OR v_state.adventure_mode<>'holding' OR
     v_state.advance_requested OR v_battle.started_at > v_request_at OR
     v_battle.ends_at <= v_request_at THEN
    RAISE EXCEPTION 'adventure cannot advance now' USING ERRCODE='22023';
  END IF;
  UPDATE public.adventure_state SET
    advance_requested=true,updated_at=clock_timestamp() WHERE user_id=v_uid;
  RETURN app_private.sync_auto_adventure();
END;
$function$
