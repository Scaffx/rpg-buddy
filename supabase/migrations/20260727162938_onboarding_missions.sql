-- Missões únicas de onboarding: progresso por ação e recompensa one-shot.

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS creation_source text NOT NULL DEFAULT 'user';

ALTER TABLE public.missions
  DROP CONSTRAINT IF EXISTS missions_creation_source_check;

ALTER TABLE public.missions
  ADD CONSTRAINT missions_creation_source_check
  CHECK (creation_source IN ('user', 'onboarding_template', 'system'));

CREATE TABLE public.onboarding_mission_catalog (
  code text PRIMARY KEY,
  sort_order smallint NOT NULL UNIQUE,
  xp_reward integer NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
  reward_kind text NOT NULL CHECK (reward_kind IN ('starter_kit', 'xp')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.onboarding_mission_catalog (
  code,
  sort_order,
  xp_reward,
  reward_kind
) VALUES
  ('enter_system', 1, 0, 'starter_kit'),
  ('create_mission', 2, 25, 'xp'),
  ('create_goal', 3, 25, 'xp'),
  ('log_meal', 4, 25, 'xp'),
  ('log_water', 5, 25, 'xp'),
  ('record_measurement', 6, 25, 'xp')
ON CONFLICT (code) DO UPDATE
SET sort_order = EXCLUDED.sort_order,
    xp_reward = EXCLUDED.xp_reward,
    reward_kind = EXCLUDED.reward_kind,
    active = true;

CREATE TABLE public.user_onboarding_mission_claims (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_code text NOT NULL
    REFERENCES public.onboarding_mission_catalog(code) ON DELETE RESTRICT,
  xp_reward integer NOT NULL DEFAULT 0,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mission_code)
);

CREATE INDEX user_onboarding_claims_user_idx
  ON public.user_onboarding_mission_claims (user_id, claimed_at DESC);

ALTER TABLE public.onboarding_mission_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_onboarding_mission_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read onboarding catalog"
  ON public.onboarding_mission_catalog
  FOR SELECT
  TO authenticated
  USING (active = true);

CREATE POLICY "Users read own onboarding claims"
  ON public.user_onboarding_mission_claims
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.onboarding_mission_catalog FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.user_onboarding_mission_claims FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.onboarding_mission_catalog,
           public.user_onboarding_mission_claims
  FROM authenticated;
GRANT SELECT ON TABLE public.onboarding_mission_catalog TO authenticated;
GRANT SELECT ON TABLE public.user_onboarding_mission_claims TO authenticated;

-- Usuários que já receberam o kit não devem recebê-lo de novo.
INSERT INTO public.user_onboarding_mission_claims (
  user_id,
  mission_code,
  xp_reward,
  claimed_at
)
SELECT
  p.user_id,
  'enter_system',
  0,
  COALESCE(p.updated_at, p.created_at, now())
FROM public.profiles p
WHERE COALESCE(p.starter_kit_claimed, false)
ON CONFLICT (user_id, mission_code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_onboarding_missions()
RETURNS TABLE (
  code text,
  sort_order smallint,
  xp_reward integer,
  reward_kind text,
  unlocked boolean,
  claimed boolean,
  claimed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH current_user_id AS (
    SELECT auth.uid() AS id
  )
  SELECT
    catalog.code,
    catalog.sort_order,
    catalog.xp_reward,
    catalog.reward_kind,
    CASE catalog.code
      WHEN 'enter_system' THEN EXISTS (
        SELECT 1
        FROM public.profiles profile, current_user_id viewer
        WHERE profile.user_id = viewer.id
          AND profile.onboarding_completed = true
      )
      WHEN 'create_mission' THEN EXISTS (
        SELECT 1
        FROM public.missions mission, current_user_id viewer
        WHERE mission.user_id = viewer.id
          AND mission.creation_source = 'user'
      )
      WHEN 'create_goal' THEN EXISTS (
        SELECT 1
        FROM public.plans plan, current_user_id viewer
        WHERE plan.user_id = viewer.id
      )
      WHEN 'log_meal' THEN EXISTS (
        SELECT 1
        FROM public.meal_log meal, current_user_id viewer
        WHERE meal.user_id = viewer.id
      )
      WHEN 'log_water' THEN EXISTS (
        SELECT 1
        FROM public.water_log water, current_user_id viewer
        WHERE water.user_id = viewer.id
      )
      WHEN 'record_measurement' THEN EXISTS (
        SELECT 1
        FROM public.body_measurements measurement, current_user_id viewer
        WHERE measurement.user_id = viewer.id
      )
      ELSE false
    END AS unlocked,
    claim.mission_code IS NOT NULL AS claimed,
    claim.claimed_at
  FROM public.onboarding_mission_catalog catalog
  CROSS JOIN current_user_id viewer
  LEFT JOIN public.user_onboarding_mission_claims claim
    ON claim.user_id = viewer.id
   AND claim.mission_code = catalog.code
  WHERE viewer.id IS NOT NULL
    AND catalog.active = true
  ORDER BY catalog.sort_order;
$$;

CREATE OR REPLACE FUNCTION public.claim_onboarding_mission(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_xp_reward integer;
  v_reward_kind text;
  v_unlocked boolean := false;
  v_starter_class text;
  v_onboarding_completed boolean;
  v_starter_kit_claimed boolean;
  v_gear_count integer := 0;
  v_new_total_xp integer;
  v_new_level integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_AUTHENTICATED';
  END IF;

  SELECT catalog.xp_reward, catalog.reward_kind
    INTO v_xp_reward, v_reward_kind
  FROM public.onboarding_mission_catalog catalog
  WHERE catalog.code = p_code
    AND catalog.active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ONBOARDING_MISSION_NOT_FOUND';
  END IF;

  CASE p_code
    WHEN 'enter_system' THEN
      SELECT
        profile.starter_class,
        profile.onboarding_completed,
        profile.starter_kit_claimed
        INTO
          v_starter_class,
          v_onboarding_completed,
          v_starter_kit_claimed
      FROM public.profiles profile
      WHERE profile.user_id = v_uid
      FOR UPDATE;

      v_unlocked := COALESCE(v_onboarding_completed, false);
    WHEN 'create_mission' THEN
      v_unlocked := EXISTS (
        SELECT 1
        FROM public.missions mission
        WHERE mission.user_id = v_uid
          AND mission.creation_source = 'user'
      );
    WHEN 'create_goal' THEN
      v_unlocked := EXISTS (
        SELECT 1 FROM public.plans plan WHERE plan.user_id = v_uid
      );
    WHEN 'log_meal' THEN
      v_unlocked := EXISTS (
        SELECT 1 FROM public.meal_log meal WHERE meal.user_id = v_uid
      );
    WHEN 'log_water' THEN
      v_unlocked := EXISTS (
        SELECT 1 FROM public.water_log water WHERE water.user_id = v_uid
      );
    WHEN 'record_measurement' THEN
      v_unlocked := EXISTS (
        SELECT 1
        FROM public.body_measurements measurement
        WHERE measurement.user_id = v_uid
      );
    ELSE
      v_unlocked := false;
  END CASE;

  IF NOT v_unlocked THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ONBOARDING_MISSION_LOCKED';
  END IF;

  INSERT INTO public.user_onboarding_mission_claims (
    user_id,
    mission_code,
    xp_reward
  ) VALUES (
    v_uid,
    p_code,
    v_xp_reward
  )
  ON CONFLICT (user_id, mission_code) DO NOTHING;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ONBOARDING_MISSION_ALREADY_CLAIMED';
  END IF;

  IF v_reward_kind = 'starter_kit' AND NOT COALESCE(v_starter_kit_claimed, false) THEN
    INSERT INTO public.user_inventory (
      user_id,
      item_id,
      quantity,
      equipped
    )
    SELECT
      v_uid,
      item.id,
      1,
      lower(COALESCE(item.category, '')) IN ('weapon', 'armor')
    FROM public.game_items item
    WHERE item.is_starter = true
      AND item.starter_class = COALESCE(NULLIF(v_starter_class, ''), 'novato')
      AND item.is_consumable = false
    ON CONFLICT (user_id, item_id) DO UPDATE
    SET quantity = GREATEST(public.user_inventory.quantity, EXCLUDED.quantity),
        equipped = public.user_inventory.equipped OR EXCLUDED.equipped;

    GET DIAGNOSTICS v_gear_count = ROW_COUNT;

    IF v_gear_count = 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STARTER_KIT_ITEMS_NOT_FOUND';
    END IF;

    INSERT INTO public.user_inventory (
      user_id,
      item_id,
      quantity,
      equipped
    )
    SELECT
      v_uid,
      item.id,
      CASE WHEN item.name = 'Poção de MP Menor' THEN 2 ELSE 1 END,
      false
    FROM public.game_items item
    WHERE item.name IN ('Poção de MP Menor', 'Poção de HP Menor')
    ON CONFLICT (user_id, item_id) DO UPDATE
    SET quantity = GREATEST(public.user_inventory.quantity, EXCLUDED.quantity);

    UPDATE public.profiles
    SET starter_kit_claimed = true,
        class_kit_claimed = true
    WHERE user_id = v_uid;
  END IF;

  IF v_xp_reward > 0 THEN
    UPDATE public.profiles profile
    SET total_xp = COALESCE(profile.total_xp, 0) + v_xp_reward,
        xp_today = COALESCE(profile.xp_today, 0) + v_xp_reward,
        level = public.get_level_from_xp_v2(
          COALESCE(profile.total_xp, 0) + v_xp_reward
        )
    WHERE profile.user_id = v_uid
    RETURNING profile.total_xp, profile.level
      INTO v_new_total_xp, v_new_level;

    INSERT INTO public.xp_history (user_id, xp_gained, type)
    VALUES (v_uid, v_xp_reward, 'onboarding_mission');
  ELSE
    SELECT profile.total_xp, profile.level
      INTO v_new_total_xp, v_new_level
    FROM public.profiles profile
    WHERE profile.user_id = v_uid;
  END IF;

  INSERT INTO public.activity_log (
    user_id,
    action,
    description,
    xp_gained
  ) VALUES (
    v_uid,
    'onboarding_mission_claimed',
    'Missão de onboarding resgatada: ' || p_code,
    v_xp_reward
  );

  RETURN jsonb_build_object(
    'code', p_code,
    'xp_reward', v_xp_reward,
    'reward_kind', v_reward_kind,
    'total_xp', v_new_total_xp,
    'level', v_new_level
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_onboarding_missions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_onboarding_missions() TO authenticated;

REVOKE ALL ON FUNCTION public.claim_onboarding_mission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_onboarding_mission(text) TO authenticated;

COMMENT ON COLUMN public.missions.creation_source IS
  'Origem da criação: user, onboarding_template ou system.';
COMMENT ON TABLE public.onboarding_mission_catalog IS
  'Catálogo server-authoritative das missões únicas de onboarding.';
COMMENT ON TABLE public.user_onboarding_mission_claims IS
  'Registro imutável das recompensas únicas já resgatadas por usuário.';
