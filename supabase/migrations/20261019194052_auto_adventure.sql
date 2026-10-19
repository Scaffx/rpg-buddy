-- Lazy catch-up: the authenticated caller only asks the server to reconcile time.
-- No user-supplied clock, outcome, reward, stage, or identity parameters exist.
CREATE TABLE IF NOT EXISTS public.adventure_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stage integer NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 100000),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  last_tick_at timestamptz NOT NULL DEFAULT now(),
  reward_day date NOT NULL DEFAULT (timezone('America/Sao_Paulo', now())::date),
  gold_today integer NOT NULL DEFAULT 0 CHECK (gold_today BETWEEN 0 AND 120),
  loot_today integer NOT NULL DEFAULT 0 CHECK (loot_today BETWEEN 0 AND 2),
  last_result jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.adventure_encounters (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage integer NOT NULL CHECK (stage > 0),
  attempt integer NOT NULL CHECK (attempt >= 0),
  fought_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('normal', 'boss')),
  won boolean NOT NULL,
  hero_power integer NOT NULL,
  enemy_power integer NOT NULL,
  gold integer NOT NULL DEFAULT 0 CHECK (gold BETWEEN 0 AND 12),
  item_id uuid REFERENCES public.game_items(id),
  PRIMARY KEY (user_id, stage, attempt)
);

CREATE UNIQUE INDEX IF NOT EXISTS adventure_one_win_per_stage
  ON public.adventure_encounters(user_id, stage) WHERE won;
CREATE INDEX IF NOT EXISTS adventure_encounters_recent
  ON public.adventure_encounters(user_id, fought_at DESC);
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_private TO authenticated;

ALTER TABLE public.adventure_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adventure_encounters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adventure_state, public.adventure_encounters FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.adventure_state, public.adventure_encounters TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='adventure_state' AND policyname='adventure_state_own_read') THEN
    CREATE POLICY adventure_state_own_read ON public.adventure_state FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='adventure_encounters' AND policyname='adventure_encounters_own_read') THEN
    CREATE POLICY adventure_encounters_own_read ON public.adventure_encounters FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_private.sync_auto_adventure()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_today date := timezone('America/Sao_Paulo', now())::date;
  v_state public.adventure_state%ROWTYPE;
  v_cursor timestamptz;
  v_slots integer;
  v_level integer;
  v_equipment record;
  v_hero integer;
  v_enemy integer;
  v_stage integer;
  v_kind text;
  v_won boolean;
  v_gold integer;
  v_item uuid;
  v_item_count integer;
  v_result jsonb;
  v_events jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000'; END IF;

  INSERT INTO public.adventure_state(user_id, last_tick_at)
  VALUES (v_uid, v_now - interval '30 minutes') ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO STRICT v_state FROM public.adventure_state WHERE user_id = v_uid FOR UPDATE;

  IF v_state.reward_day <> v_today THEN
    v_state.reward_day := v_today;
    v_state.gold_today := 0;
    v_state.loot_today := 0;
  END IF;

  -- Discard time older than eight hours; never let repeat requests harvest it.
  v_cursor := greatest(v_state.last_tick_at, v_now - interval '8 hours');
  v_slots := least(16, greatest(0, floor(extract(epoch FROM (v_now - v_cursor)) / 1800)::integer));
  SELECT coalesce(p.level, 1) INTO v_level FROM public.profiles p WHERE p.user_id = v_uid;
  v_level := greatest(1, coalesce(v_level, 1));
  SELECT coalesce(sum(greatest(0, i.atk_bonus) + greatest(0, i.matk_bonus)),0) AS attack,
         coalesce(sum(greatest(0, i.def_bonus)),0) AS defense,
         coalesce(sum(greatest(0, i.hp_bonus)),0) AS hp
    INTO v_equipment
    FROM public.user_inventory ui JOIN public.game_items i ON i.id = ui.item_id
   WHERE ui.user_id = v_uid AND ui.equipped
     AND (NOT (i.requer_sintonizacao OR lower(i.rarity) IN ('epico','lendario')) OR ui.sintonizado);

  FOR n IN 1..v_slots LOOP
    v_stage := v_state.stage;
    v_kind := CASE WHEN v_stage % 10 = 0 THEN 'boss' ELSE 'normal' END;
    v_hero := 70 + least(v_level, 50) * 3
      + least(v_equipment.attack, 200) * 2
      + least(v_equipment.defense, 150)
      + least(v_equipment.hp, 400) / 10;
    v_enemy := CASE WHEN v_kind = 'boss' THEN 30 + v_stage * 5 ELSE 20 + v_stage * 4 END;
    v_won := v_hero >= v_enemy;
    v_gold := 0;
    v_item := NULL;

    IF v_won THEN
      v_gold := least(CASE WHEN v_kind = 'boss' THEN 12 ELSE 4 END, greatest(0, 120 - v_state.gold_today));
      IF v_state.loot_today < 2 AND (v_kind = 'boss' OR v_stage % 7 = 0) THEN
        SELECT count(*) INTO v_item_count FROM public.game_items i
         WHERE i.category IN ('weapon','armor','accessory') AND lower(i.rarity) = 'comum'
           AND NOT i.is_consumable AND i.effect IS NULL AND i.level_required <= v_level;
        IF v_item_count > 0 THEN
          SELECT i.id INTO v_item FROM public.game_items i
           WHERE i.category IN ('weapon','armor','accessory') AND lower(i.rarity) = 'comum'
             AND NOT i.is_consumable AND i.effect IS NULL AND i.level_required <= v_level
           ORDER BY i.id OFFSET ((v_stage / 7) % v_item_count) LIMIT 1;
        END IF;
      END IF;
    END IF;

    INSERT INTO public.adventure_encounters(user_id,stage,attempt,fought_at,kind,won,hero_power,enemy_power,gold,item_id)
    VALUES (v_uid,v_stage,v_state.attempt,v_cursor + interval '30 minutes',v_kind,v_won,v_hero,v_enemy,v_gold,v_item);

    IF v_won THEN
      IF v_gold > 0 THEN
        INSERT INTO public.user_balance(user_id, gold) VALUES (v_uid, 100) ON CONFLICT (user_id) DO NOTHING;
        INSERT INTO public.gold_history(user_id,type,amount,reason)
        VALUES (v_uid,'adventure',v_gold,'Aventura etapa ' || v_stage);
        UPDATE public.user_balance SET gold = gold + v_gold, updated_at = v_now WHERE user_id = v_uid;
        v_state.gold_today := v_state.gold_today + v_gold;
      END IF;
      IF v_item IS NOT NULL THEN
        INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped)
        VALUES (v_uid,v_item,1,false)
        ON CONFLICT (user_id,item_id) DO UPDATE SET quantity = public.user_inventory.quantity + 1;
        v_state.loot_today := v_state.loot_today + 1;
      END IF;
      v_state.stage := v_stage + 1;
      v_state.attempt := 0;
      v_cursor := v_cursor + interval '30 minutes';
    ELSE
      -- A defeat stops this catch-up batch and discards accumulated time.
      -- The same stage is tried automatically after another 30 minutes.
      v_state.attempt := v_state.attempt + 1;
      v_cursor := v_now;
    END IF;

    v_result := jsonb_build_object('stage',v_stage,'kind',v_kind,'won',v_won,
      'gold',v_gold,'item_id',v_item,'hero_power',v_hero,'enemy_power',v_enemy);
    v_state.last_result := v_result;
    EXIT WHEN NOT v_won;
  END LOOP;

  v_state.last_tick_at := v_cursor;
  UPDATE public.adventure_state SET stage=v_state.stage,attempt=v_state.attempt,last_tick_at=v_state.last_tick_at,
    reward_day=v_state.reward_day,gold_today=v_state.gold_today,loot_today=v_state.loot_today,
    last_result=v_state.last_result,updated_at=v_now WHERE user_id=v_uid;

  SELECT coalesce(jsonb_agg(e ORDER BY e.fought_at DESC, e.stage DESC, e.attempt DESC),'[]'::jsonb)
    INTO v_events FROM (
      SELECT stage,attempt,fought_at,kind,won,hero_power,enemy_power,gold,item_id
      FROM public.adventure_encounters WHERE user_id=v_uid
      ORDER BY fought_at DESC,stage DESC,attempt DESC LIMIT 8
    ) e;

  RETURN jsonb_build_object('stage',v_state.stage,'next_at',v_state.last_tick_at + interval '30 minutes',
    'server_now',v_now,'last_result',v_state.last_result,'encounters',v_events,
    'gold_today',v_state.gold_today,'loot_today',v_state.loot_today,
    'limits',jsonb_build_object('interval_minutes',30,'offline_hours',8,'gold_per_day',120,'items_per_day',2));
END;
$$;

REVOKE ALL ON FUNCTION app_private.sync_auto_adventure() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.sync_auto_adventure() TO authenticated;

-- Public Data API entry point has invoker privileges. Privileged writes live
-- only in the private implementation and always derive identity from auth.uid().
CREATE OR REPLACE FUNCTION public.sync_auto_adventure()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT app_private.sync_auto_adventure() $$;
REVOKE ALL ON FUNCTION public.sync_auto_adventure() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_auto_adventure() TO authenticated;
