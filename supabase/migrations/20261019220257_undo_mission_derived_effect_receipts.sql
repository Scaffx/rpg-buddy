-- A12: exact provenance for effects produced while a mission is completed.
-- This migration deliberately leaves old completions without a receipt.
DO $preflight$
DECLARE
  v_expected text[] := ARRAY[
    'public._complete_mission_daily(uuid,date,integer)',
    'public._complete_mission_with_weekly(uuid,date)',
    'public.complete_mission(uuid,date)',
    'public.undo_mission(uuid,date)'];
  v_hashes text[] := ARRAY[
    '38daea9a87fbbc6624558f7f6ec6854e',
    'e54f3a202d324d8a532af8ae64f77b7b',
    '2382dc23f38614791ac3d5097043e805',
    '3fcc37484f12b57956f49507e31e0160'];
  v_index integer;
  v_proc pg_proc%ROWTYPE;
BEGIN
  FOR v_index IN 1..4 LOOP
    SELECT * INTO v_proc FROM pg_proc
     WHERE oid = to_regprocedure(v_expected[v_index]);
    IF NOT FOUND OR v_proc.prokind <> 'f' OR NOT v_proc.prosecdef
       OR v_proc.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
       OR md5(replace(v_proc.prosrc, E'\r\n', E'\n')) <> v_hashes[v_index] THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='DERIVED_EFFECT_RPC_DRIFT: ' || v_expected[v_index];
    END IF;
  END LOOP;
  IF to_regprocedure('private.undo_mission_attribute_awards(uuid,date,uuid,boolean,date)') IS NULL
     OR to_regprocedure('public._grant_flow_xp_buff(uuid)') IS NULL
     OR to_regprocedure('public._apply_mission_health_effects(uuid,numeric,integer,integer)') IS NULL
     OR has_function_privilege('authenticated','public._grant_flow_xp_buff(uuid)','EXECUTE')
     OR md5(replace(pg_get_functiondef(
          'public._grant_flow_xp_buff(uuid)'::regprocedure),E'\r\n',E'\n'))
        <> '97780c88457be4637d52124a86f6b701'
     OR md5(replace(pg_get_functiondef(
          'public._apply_mission_health_effects(uuid,numeric,integer,integer)'::regprocedure),E'\r\n',E'\n'))
        <> 'ec7b2cbdc6035c3b129ef400c6f20bb9'
     OR EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.profiles'::regclass
          AND tgname='sync_health_on_profile_level_change_trigger' AND NOT tgisinternal)
     OR to_regclass('private.mission_attribute_receipts') IS NULL
     OR to_regclass('public.user_health_stats') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='user_health_stats'
         AND column_name IN ('max_hp','current_hp','max_mp','current_mp')
       GROUP BY table_schema,table_name HAVING count(*)=4
     ) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='DERIVED_EFFECT_SCHEMA_DRIFT';
  END IF;
END;
$preflight$;

CREATE TABLE private.mission_effect_receipts (
  mission_id uuid NOT NULL,
  completion_date date NOT NULL,
  user_id uuid NOT NULL,
  inspiration_before boolean NOT NULL,
  inspiration_before_at timestamptz,
  inspiration_issued boolean NOT NULL DEFAULT false,
  inspiration_after_at timestamptz,
  flow_buff_id uuid,
  flow_item_id uuid,
  flow_expires_at timestamptz,
  health_before_hp integer,
  health_before_max_hp integer,
  health_before_mp integer,
  health_before_max_mp integer,
  health_after_hp integer,
  health_after_max_hp integer,
  health_after_mp integer,
  health_after_max_mp integer,
  health_max_hp_delta integer NOT NULL DEFAULT 0 CHECK (health_max_hp_delta >= 0),
  health_max_mp_delta integer NOT NULL DEFAULT 0 CHECK (health_max_mp_delta >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  receipt_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  PRIMARY KEY (mission_id, completion_date),
  FOREIGN KEY (mission_id, completion_date)
    REFERENCES private.mission_attribute_receipts(mission_id, completion_date)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK ((flow_buff_id IS NULL AND flow_item_id IS NULL AND flow_expires_at IS NULL)
      OR (flow_buff_id IS NOT NULL AND flow_item_id IS NOT NULL AND flow_expires_at IS NOT NULL)),
  CHECK (NOT inspiration_issued OR inspiration_after_at IS NOT NULL)
);
ALTER TABLE private.mission_effect_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.mission_effect_receipts FROM PUBLIC, anon, authenticated;

-- Same item selection and 48-hour expiry as _grant_flow_xp_buff. The ID is
-- captured at INSERT, so a concurrent shop purchase cannot be misattributed.
CREATE FUNCTION private.grant_mission_flow_buff(
  p_uid uuid, p_mission_id uuid, p_date date
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $flow$
DECLARE
  v_item uuid;
  v_buff uuid;
  v_expiry timestamptz;
BEGIN
  SELECT id INTO v_item FROM public.shop_items
   WHERE effect='estado_fluxo_xp' LIMIT 1;
  IF v_item IS NULL THEN RETURN; END IF;
  INSERT INTO public.user_buffs(user_id,item_id,active,expires_at)
    VALUES (p_uid,v_item,true,now()+interval '48 hours')
    RETURNING id,expires_at INTO v_buff,v_expiry;
  UPDATE private.mission_effect_receipts
     SET flow_buff_id=v_buff, flow_item_id=v_item, flow_expires_at=v_expiry
   WHERE mission_id=p_mission_id AND completion_date=p_date AND user_id=p_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='DERIVED_EFFECT_RECEIPT_MISSING';
  END IF;
END;
$flow$;
REVOKE ALL ON FUNCTION private.grant_mission_flow_buff(uuid,uuid,date)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.undo_mission_effects(
  p_mission_id uuid, p_date date, p_uid uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $undo_effects$
DECLARE
  r private.mission_effect_receipts%ROWTYPE;
  v_health public.user_health_stats%ROWTYPE;
  v_new_max_hp integer;
  v_new_max_mp integer;
  v_apply_hp_delta integer;
  v_apply_mp_delta integer;
  v_other_health_receipt boolean;
BEGIN
  SELECT * INTO r FROM private.mission_effect_receipts
   WHERE mission_id=p_mission_id AND completion_date=p_date AND user_id=p_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0001',
      MESSAGE='DERIVED_EFFECT_RECEIPT_MISSING: conclusao anterior a correcao requer conciliacao';
  END IF;

  -- Compare the unique post-grant marker. A later grant or combat consumption
  -- changes it, so neither a newer inspiration nor an already used one moves.
  IF r.inspiration_issued THEN
    -- An intervening mission may now own the visible inspiration. Rewire its
    -- predecessor so undoing that later mission cannot resurrect this one.
    UPDATE private.mission_effect_receipts successor
       SET inspiration_before=r.inspiration_before,
           inspiration_before_at=r.inspiration_before_at
     WHERE successor.user_id=p_uid AND successor.inspiration_issued
       AND successor.inspiration_before
       AND successor.inspiration_before_at=r.inspiration_after_at;
    UPDATE public.profiles
       SET inspired_available=r.inspiration_before,
           inspired_earned_at=r.inspiration_before_at
     WHERE user_id=p_uid AND inspired_available=true
       AND inspired_earned_at=r.inspiration_after_at;
  END IF;
  IF r.flow_buff_id IS NOT NULL THEN
    UPDATE public.user_buffs SET active=false
     WHERE id=r.flow_buff_id AND user_id=p_uid AND active=true
       AND item_id=r.flow_item_id AND expires_at=r.flow_expires_at;
  END IF;

  -- Maxima from this completion are exact additive deltas after the helper's
  -- 200/60 cap. Subtracting them leaves later additive grants in place.
  SELECT * INTO v_health FROM public.user_health_stats
   WHERE user_id=p_uid FOR UPDATE;
  IF (r.health_max_hp_delta > 0 OR r.health_max_mp_delta > 0) AND NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='DERIVED_EFFECT_HEALTH_ROW_MISSING';
  END IF;
  IF FOUND THEN
    -- A lower maximum than this receipt's post-state signals an external
    -- overwrite or already removed grant. Do not debit an unproven remainder.
    v_apply_hp_delta := CASE WHEN r.health_max_hp_delta>0
      AND v_health.max_hp>=r.health_after_max_hp THEN r.health_max_hp_delta ELSE 0 END;
    v_apply_mp_delta := CASE WHEN r.health_max_mp_delta>0
      AND v_health.max_mp>=r.health_after_max_mp THEN r.health_max_mp_delta ELSE 0 END;
    v_new_max_hp := v_health.max_hp-v_apply_hp_delta;
    v_new_max_mp := v_health.max_mp-v_apply_mp_delta;
    -- Earlier grants can be undone before later missions. Rewrite the later
    -- reference snapshots by the debit just made; their own deltas stay exact.
    UPDATE private.mission_effect_receipts successor
       SET health_before_max_hp=CASE WHEN health_before_max_hp IS NULL THEN NULL
                                   ELSE health_before_max_hp-v_apply_hp_delta END,
           health_after_max_hp=CASE WHEN health_after_max_hp IS NULL THEN NULL
                                  ELSE health_after_max_hp-v_apply_hp_delta END,
           health_before_max_mp=CASE WHEN health_before_max_mp IS NULL THEN NULL
                                   ELSE health_before_max_mp-v_apply_mp_delta END,
           health_after_max_mp=CASE WHEN health_after_max_mp IS NULL THEN NULL
                                  ELSE health_after_max_mp-v_apply_mp_delta END
     WHERE successor.user_id=p_uid AND successor.receipt_order>r.receipt_order;
    SELECT EXISTS(
      SELECT 1 FROM private.mission_effect_receipts other
       WHERE other.user_id=p_uid
         AND (other.mission_id,other.completion_date)<>(p_mission_id,p_date)
         AND (other.health_max_hp_delta<>0 OR other.health_max_mp_delta<>0
              OR other.health_before_hp IS DISTINCT FROM other.health_after_hp
              OR other.health_before_mp IS DISTINCT FROM other.health_after_mp)
    ) INTO v_other_health_receipt;
    UPDATE public.user_health_stats
       SET max_hp=v_new_max_hp, max_mp=v_new_max_mp,
           current_hp=LEAST(v_new_max_hp, CASE
             WHEN NOT v_other_health_receipt
                  AND v_health.current_hp IS NOT DISTINCT FROM r.health_after_hp
                  AND r.health_before_hp IS DISTINCT FROM r.health_after_hp
               THEN COALESCE(r.health_before_hp,100)
             ELSE v_health.current_hp END),
           current_mp=LEAST(v_new_max_mp, CASE
             WHEN NOT v_other_health_receipt
                  AND v_health.current_mp IS NOT DISTINCT FROM r.health_after_mp
                  AND r.health_before_mp IS DISTINCT FROM r.health_after_mp
               THEN COALESCE(r.health_before_mp,10)
             ELSE v_health.current_mp END)
     WHERE user_id=p_uid;
  END IF;

  DELETE FROM private.mission_effect_receipts
   WHERE mission_id=p_mission_id AND completion_date=p_date AND user_id=p_uid;
END;
$undo_effects$;
REVOKE ALL ON FUNCTION private.undo_mission_effects(uuid,date,uuid)
  FROM PUBLIC, anon, authenticated;

-- Patch only the four pinned RPC bodies. CREATE OR REPLACE keeps their ACLs,
-- public signatures, locks, reward arithmetic, D-1 and weekly branches.
DO $install$
DECLARE
  v_definition text;
  v_signature text;
  v_old text;
  v_new text;
  v_count integer;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public._complete_mission_daily(uuid,date,integer)',
    'public._complete_mission_with_weekly(uuid,date)'] LOOP
    v_definition := replace(pg_get_functiondef(to_regprocedure(v_signature)), E'\r\n', E'\n');
    IF v_signature LIKE '%_daily%' THEN
      v_old := 'IF v_grant_flow THEN PERFORM public._grant_flow_xp_buff(v_uid); END IF;';
      v_new := 'IF v_grant_flow THEN PERFORM private.grant_mission_flow_buff(v_uid,p_mission_id,p_today); END IF;';
    ELSE
      v_old := E'IF v_grant_flow THEN\n    PERFORM public._grant_flow_xp_buff(v_uid);\n  END IF;';
      v_new := E'IF v_grant_flow THEN\n    PERFORM private.grant_mission_flow_buff(v_uid,p_mission_id,v_today);\n  END IF;';
    END IF;
    v_count := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
    IF v_count <> 1 THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='DERIVED_EFFECT_FLOW_ANCHOR_DRIFT';
    END IF;
    EXECUTE replace(v_definition,v_old,v_new);
  END LOOP;

  v_definition := replace(pg_get_functiondef('public.complete_mission(uuid,date)'::regprocedure), E'\r\n', E'\n');
  v_old := '  v_result := public._complete_mission_with_weekly(p_mission_id, v_target);';
  v_new := $before_dispatch$
  -- The per-user advisory lock and mission lock are already held here.
  PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR UPDATE;
  PERFORM 1 FROM public.user_health_stats WHERE user_id=v_uid FOR UPDATE;
  INSERT INTO private.mission_effect_receipts(
    mission_id,completion_date,user_id,inspiration_before,inspiration_before_at,
    health_before_hp,health_before_max_hp,health_before_mp,health_before_max_mp)
  SELECT p_mission_id,v_target,v_uid,p.inspired_available,p.inspired_earned_at,
         h.current_hp,h.max_hp,h.current_mp,h.max_mp
    FROM public.profiles p LEFT JOIN public.user_health_stats h ON h.user_id=v_uid
   WHERE p.user_id=v_uid
  ON CONFLICT (mission_id,completion_date) DO NOTHING;
  IF NOT FOUND THEN
    -- Let the published dispatcher reject a replay with its existing error.
    -- If the ledger is somehow stale and dispatch would succeed, abort the
    -- entire call rather than reuse another completion's provenance receipt.
    PERFORM public._complete_mission_with_weekly(p_mission_id, v_target);
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='DERIVED_EFFECT_RECEIPT_CONFLICT';
  END IF;
  v_result := public._complete_mission_with_weekly(p_mission_id, v_target);
  -- The dispatcher has completed all talent and perfect-day effects.
  UPDATE private.mission_effect_receipts r
     SET inspiration_issued = p.inspired_available AND
          (NOT r.inspiration_before OR p.inspired_earned_at IS DISTINCT FROM r.inspiration_before_at),
         inspiration_after_at = CASE WHEN p.inspired_available AND
          (NOT r.inspiration_before OR p.inspired_earned_at IS DISTINCT FROM r.inspiration_before_at)
          THEN clock_timestamp() ELSE NULL END,
         health_after_hp=h.current_hp, health_after_max_hp=h.max_hp,
         health_after_mp=h.current_mp, health_after_max_mp=h.max_mp,
         health_max_hp_delta=CASE WHEN h.max_hp IS NOT NULL
           THEN h.max_hp-COALESCE(r.health_before_max_hp,100) ELSE 0 END,
         health_max_mp_delta=CASE WHEN h.max_mp IS NOT NULL
           THEN h.max_mp-COALESCE(r.health_before_max_mp,10) ELSE 0 END
    FROM public.profiles p LEFT JOIN public.user_health_stats h ON h.user_id=v_uid
   WHERE r.mission_id=p_mission_id AND r.completion_date=v_target
     AND r.user_id=v_uid AND p.user_id=v_uid;
  UPDATE public.profiles p SET inspired_earned_at=r.inspiration_after_at
    FROM private.mission_effect_receipts r
   WHERE r.mission_id=p_mission_id AND r.completion_date=v_target
     AND r.user_id=v_uid AND p.user_id=v_uid AND r.inspiration_issued;
$before_dispatch$;
  v_count := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
  IF v_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='DERIVED_EFFECT_COMPLETE_ANCHOR_DRIFT';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);

  v_definition := replace(pg_get_functiondef('public.undo_mission(uuid,date)'::regprocedure), E'\r\n', E'\n');
  v_old := '  v_status := (v_m.daily_status - p_today::text);';
  v_new := E'  PERFORM private.undo_mission_effects(p_mission_id,p_today,v_uid);\n' || v_old;
  v_count := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
  IF v_count <> 1 THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='DERIVED_EFFECT_UNDO_ANCHOR_DRIFT';
  END IF;
  EXECUTE replace(v_definition,v_old,v_new);
END;
$install$;
