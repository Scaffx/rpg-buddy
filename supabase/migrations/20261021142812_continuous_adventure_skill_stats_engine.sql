-- Refuse drift before replacing the live combat authority. All hashes were read
-- from Primary on 2026-10-21; no SQL is written to Primary by this task.
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure)) <> '2fcf51bb9183c415a8d434c4c22e4815'
    OR md5(pg_get_functiondef('app_private.adventure_battle_payload(app_private.adventure_battles,timestamptz)'::regprocedure)) <> 'b5fe2a66325209a0d3bc7ce3da76062a'
    OR md5(pg_get_functiondef('public.sync_auto_adventure()'::regprocedure)) <> '1879a24abc08fec402ea5d96f4a199c6'
    OR md5(pg_get_functiondef('app_private.advance_auto_adventure(uuid)'::regprocedure)) <> 'a6f6dd7ab3b787084d47ed47dab100cd'
    OR md5(pg_get_functiondef('public.advance_auto_adventure(uuid)'::regprocedure)) <> 'f71174f3366e61e0756fd00674c429ae' THEN
    RAISE EXCEPTION 'adventure source drift' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) IN (
      ('app_private','sync_auto_adventure',''),
      ('app_private','adventure_battle_payload','p_battle app_private.adventure_battles, p_now timestamp with time zone'),
      ('app_private','advance_auto_adventure','p_battle_id uuid'),
      ('public','sync_auto_adventure',''),('public','advance_auto_adventure','p_battle_id uuid'))
      AND (p.proowner <> 'postgres'::regrole OR p.proconfig IS NULL
           OR NOT ('search_path=""'=ANY(p.proconfig))
           OR has_function_privilege('anon',p.oid,'EXECUTE')
           OR p.prosecdef <> (n.nspname='app_private')
           OR has_function_privilege('authenticated',p.oid,'EXECUTE') <> (p.proname <> 'adventure_battle_payload'))
  ) OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE p.proname IN ('sync_auto_adventure','advance_auto_adventure','adventure_battle_payload')
            AND n.nspname IN ('public','app_private')) <> 5
    OR EXISTS (
    SELECT 1 FROM pg_namespace n WHERE n.nspname='app_private'
      AND (n.nspowner<>'postgres'::regrole
           OR has_schema_privilege('anon',n.oid,'CREATE')
           OR has_schema_privilege('authenticated',n.oid,'CREATE'))
  ) OR EXISTS (
    SELECT 1 FROM pg_class c WHERE c.oid IN (
      'app_private.adventure_battles'::regclass,'app_private.adventure_enemy_catalog'::regclass)
      AND (c.relowner<>'postgres'::regrole
           OR has_table_privilege('anon',c.oid,'SELECT')
           OR has_table_privilege('authenticated',c.oid,'SELECT')
           OR (c.relname='adventure_battles' AND NOT c.relrowsecurity))
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema='app_private' AND c.table_name='adventure_battles'
      AND c.column_name IN ('hero_attack','hero_defense','hero_max_mp','enemy_resistances','engine_version','rules_snapshot')
  ) THEN
    RAISE EXCEPTION 'adventure ownership, ACL or shape drift' USING ERRCODE='22023';
  END IF;
  IF (SELECT md5(string_agg(biome::text||':'||slot::text||':'||name||':'||icon,
                            '|' ORDER BY biome,slot))
      FROM app_private.adventure_enemy_catalog) <> 'f68962f94a698b81a04ea3d0c5823c97' THEN
    RAISE EXCEPTION 'enemy catalog drift' USING ERRCODE='22023';
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid='app_private.adventure_battles'::regclass
        AND conname='adventure_battles_status_check') <>
     'CHECK ((status = ANY (ARRAY[''fighting''::text, ''won''::text, ''defeated''::text])))' THEN
    RAISE EXCEPTION 'adventure status constraint drift' USING ERRCODE='22023';
  END IF;
END;
$guard$;

ALTER TABLE app_private.adventure_enemy_catalog
  ADD COLUMN resistances jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(resistances)='object');
UPDATE app_private.adventure_enemy_catalog
  SET resistances='{"fire":0.5}'::jsonb WHERE biome=3 AND slot=1;
ALTER TABLE app_private.adventure_battles
  DROP CONSTRAINT adventure_battles_status_check;
ALTER TABLE app_private.adventure_battles
  ADD CONSTRAINT adventure_battles_status_check
  CHECK (status IN ('fighting','won','defeated','draw'));
ALTER TABLE app_private.adventure_battles
  ADD COLUMN hero_attack integer CHECK (hero_attack > 0),
  ADD COLUMN hero_defense integer CHECK (hero_defense >= 0),
  ADD COLUMN hero_max_mp integer CHECK (hero_max_mp >= 0),
  ADD COLUMN enemy_resistances jsonb CHECK (jsonb_typeof(enemy_resistances)='object'),
  ADD COLUMN engine_version text CHECK (engine_version='v3'),
  ADD COLUMN rules_snapshot jsonb CHECK (jsonb_typeof(rules_snapshot)='object');

-- A deterministic, server-only timeline. The caller passes immutable values
-- captured from the allocated catalog/equipped item at battle creation.
CREATE FUNCTION app_private.adventure_simulate_v3(
  p_start timestamptz, p_attack integer, p_defense integer, p_max_hp integer,
  p_max_mp integer, p_enemy_power integer, p_enemy_max_hp integer,
  p_skills jsonb, p_resistances jsonb, p_default_effect text, p_rotation integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_events jsonb := '[]'::jsonb;
  v_cooldowns jsonb := '{}'::jsonb;
  v_hero_hp integer := p_max_hp;
  v_enemy_hp integer := p_enemy_max_hp;
  v_mp integer := p_max_mp;
  v_count integer := jsonb_array_length(p_skills);
  v_next integer := CASE WHEN jsonb_array_length(p_skills)>0 THEN p_rotation % jsonb_array_length(p_skills) ELSE 0 END;
  v_turn integer;
  v_idx integer;
  v_skill jsonb;
  v_type text;
  v_effect text;
  v_cost integer;
  v_power integer;
  v_raw integer;
  v_damage integer;
  v_heal integer;
  v_multiplier numeric;
  v_guard numeric := 0;
  v_guard_hits integer := 0;
  v_vulnerability numeric := 0;
  v_vulnerability_until integer := 0;
  v_stun integer := 0;
  v_note text;
BEGIN
  IF p_attack < 1 OR p_defense < 0 OR p_max_hp < 1 OR p_max_mp < 0
    OR p_enemy_power < 1 OR p_enemy_max_hp < 1
    OR jsonb_typeof(p_skills) <> 'array' OR jsonb_typeof(p_resistances) <> 'object'
    OR p_default_effect NOT IN ('physical','arcane','fire','ice','lightning','nature','light') THEN
    RAISE EXCEPTION 'invalid combat snapshot' USING ERRCODE='22023';
  END IF;
  -- 150 boss HP at the guaranteed minimum one damage needs at most 150 hero
  -- attacks (300 events); 320 leaves room for a few support turns. A longer
  -- healing/control cycle ends as an explicit draw, never a false death.
  FOR i IN 1..320 LOOP
    v_turn := (i+1)/2;
    v_skill := NULL;
    v_type := NULL;
    v_effect := CASE WHEN i%2=1 THEN p_default_effect ELSE 'physical' END;
    v_cost := 0; v_raw := 0; v_damage := 0; v_heal := 0;
    v_multiplier := 1; v_note := NULL;
    IF i%2=1 THEN
      FOR j IN 0..v_count-1 LOOP
        v_idx := (v_next+j)%v_count;
        v_skill := p_skills->v_idx;
        v_cost := (v_skill->>'mp_cost')::integer;
        IF v_cost <= v_mp
          AND v_turn >= coalesce((v_cooldowns->>(v_skill->>'id'))::integer,0)
          AND (v_skill->>'type' <> 'heal' OR v_hero_hp < p_max_hp)
          AND (v_skill->>'type' <> 'buff' OR v_guard_hits=0) THEN
          v_type := v_skill->>'type';
          v_next := (v_idx+1)%v_count;
          EXIT;
        END IF;
        v_skill := NULL;
      END LOOP;
      IF v_skill IS NOT NULL THEN
        v_mp := v_mp-v_cost;
        v_cooldowns := jsonb_set(v_cooldowns,ARRAY[v_skill->>'id'],
          to_jsonb(v_turn+(v_skill->>'cooldown')::integer+1));
        v_effect := v_skill->>'effect';
        v_power := (v_skill->>'power')::integer;
      ELSE
        v_cost := 0;
      END IF;
      IF v_type IS NULL OR v_type='dano'
        OR (v_type IN ('debuff','cc') AND coalesce((v_skill->>'strike')::boolean,false)) THEN
        v_raw := greatest(1,round(15+(p_attack-p_enemy_power)*0.5)::integer);
        IF v_type IS NOT NULL THEN v_raw := v_raw+round(v_power*0.35)::integer; END IF;
        IF v_turn <= v_vulnerability_until THEN v_multiplier := v_multiplier+v_vulnerability; END IF;
        v_multiplier := v_multiplier * coalesce((p_resistances->>v_effect)::numeric,1);
        v_damage := least(v_enemy_hp,greatest(1,round(v_raw*v_multiplier)::integer));
        v_enemy_hp := v_enemy_hp-v_damage;
      ELSIF v_type='heal' THEN
        v_heal := least(p_max_hp-v_hero_hp,v_power);
        v_hero_hp := v_hero_hp+v_heal;
        v_note := 'heal';
      ELSIF v_type='buff' THEN
        v_guard := least(0.75,v_power::numeric/100);
        v_guard_hits := 1;
        v_note := 'guard';
      ELSIF v_type NOT IN ('debuff','cc') THEN
        RAISE EXCEPTION 'unsupported skill type' USING ERRCODE='22023';
      END IF;
      IF v_type='debuff' THEN
        v_vulnerability := least(0.6,v_power::numeric/200);
        v_vulnerability_until := v_turn+2;
        v_note := 'vulnerable';
      ELSIF v_type='cc' THEN
        v_stun := 1;
        v_note := 'stunned';
      END IF;
    ELSE
      v_raw := greatest(1,round(9+(p_enemy_power-p_defense)*0.5)::integer);
      IF v_stun>0 THEN
        v_stun := v_stun-1;
        v_multiplier := 0;
        v_note := 'stunned';
      ELSE
        IF v_guard_hits>0 THEN
          v_multiplier := 1-v_guard;
          v_guard_hits := v_guard_hits-1;
        END IF;
        v_damage := least(v_hero_hp,greatest(1,round(v_raw*v_multiplier)::integer));
        v_hero_hp := v_hero_hp-v_damage;
      END IF;
    END IF;
    v_events := v_events || jsonb_build_array(jsonb_build_object(
      'at',p_start+i*interval '1.6 seconds',
      'actor',CASE WHEN i%2=1 THEN 'hero' ELSE 'enemy' END,
      'kind',CASE WHEN i%2=1 AND v_type IS NOT NULL THEN 'skill' ELSE 'attack' END,
      'damage',v_damage,'hero_hp',v_hero_hp,'enemy_hp',v_enemy_hp,
      'hero_mp',v_mp,'mp_cost',v_cost,'skill_type',v_type,'healing',v_heal,
      'raw_damage',v_raw,'damage_multiplier',v_multiplier,'effect_note',v_note,
      'skill_id',CASE WHEN i%2=1 THEN v_skill->>'id' ELSE NULL END,
      'skill_name',CASE WHEN i%2=1 THEN v_skill->>'name' ELSE NULL END,
      'effect',v_effect));
    EXIT WHEN v_hero_hp=0 OR v_enemy_hp=0;
  END LOOP;
  RETURN v_events;
END;
$$;
REVOKE ALL ON FUNCTION app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION app_private.adventure_battle_payload(
  p_battle app_private.adventure_battles, p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id',p_battle.id,'stage',p_battle.stage,'attempt',p_battle.attempt,
    'kind',p_battle.kind,'status',p_battle.status,'replay',p_battle.replay,
    'biome',p_battle.biome,
    'started_at',p_battle.started_at,'ends_at',p_battle.ends_at,
    'hero_power',p_battle.hero_power,'hero_class',p_battle.hero_class,
    'enemy_power',p_battle.enemy_power,
    'hero_max_hp',p_battle.hero_max_hp,'enemy_max_hp',p_battle.enemy_max_hp,
    'hero_hp',coalesce((SELECT (event->>'hero_hp')::integer
      FROM jsonb_array_elements(p_battle.events) WITH ORDINALITY AS x(event,ord)
      WHERE (event->>'at')::timestamptz <= p_now ORDER BY ord DESC LIMIT 1),p_battle.hero_max_hp),
    'enemy_hp',coalesce((SELECT (event->>'enemy_hp')::integer
      FROM jsonb_array_elements(p_battle.events) WITH ORDINALITY AS x(event,ord)
      WHERE (event->>'at')::timestamptz <= p_now ORDER BY ord DESC LIMIT 1),p_battle.enemy_max_hp),
    'enemy_name',p_battle.enemy_name,'enemy_icon',p_battle.enemy_icon,
    'boss_id',p_battle.boss_id,'events',p_battle.events)
    || CASE WHEN p_battle.engine_version='v3' THEN jsonb_build_object(
      'hero_max_mp',p_battle.hero_max_mp,
      'hero_mp',coalesce((SELECT (event->>'hero_mp')::integer
        FROM jsonb_array_elements(p_battle.events) WITH ORDINALITY AS x(event,ord)
        WHERE (event->>'at')::timestamptz <= p_now ORDER BY ord DESC LIMIT 1),p_battle.hero_max_mp),
      'hero_attack',p_battle.hero_attack,'hero_defense',p_battle.hero_defense,
      'engine_version',p_battle.engine_version,
      'end_reason',CASE WHEN p_battle.status='draw' THEN 'turn_limit' ELSE NULL END,
      'enemy_resistances',p_battle.enemy_resistances) ELSE '{}'::jsonb END;
$$;
REVOKE ALL ON FUNCTION app_private.adventure_battle_payload(app_private.adventure_battles,timestamptz)
  FROM PUBLIC, anon, authenticated;

-- Central gate for the later class-authority migration. `p_has_class` is true
-- only for the validated current_class_id ancestry, never starter_class text.
CREATE FUNCTION app_private.adventure_skill_tree_allowed(
  p_tree text,p_class text,p_has_class boolean)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT p_tree='aprendiz'
    OR (p_tree='novato' AND p_class IN ('novato','clerico'))
    OR (p_has_class AND p_tree=p_class);
$$;
REVOKE ALL ON FUNCTION app_private.adventure_skill_tree_allowed(text,text,boolean)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION app_private.sync_auto_adventure()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_today date := timezone('America/Sao_Paulo',v_now)::date;
  v_state public.adventure_state%ROWTYPE;
  v_battle app_private.adventure_battles%ROWTYPE;
  v_last_battle app_private.adventure_battles%ROWTYPE;
  v_prior app_private.adventure_battles%ROWTYPE;
  v_start timestamptz;
  v_level integer;
  v_class text;
  v_hero_class text;
  v_class_id uuid;
  v_has_class boolean := false;
  v_class_node public.classes%ROWTYPE;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_hops integer := 0;
  v_previous_column integer;
  v_attributes record;
  v_attribute_power integer;
  v_equipment record;
  v_hero integer;
  v_hero_attack integer;
  v_hero_defense integer;
  v_hero_max_mp integer;
  v_engine_version text;
  v_rules_snapshot jsonb;
  v_enemy_resistances jsonb := '{}'::jsonb;
  v_default_effect text := 'physical';
  v_enemy integer;
  v_hero_hp integer;
  v_enemy_hp integer;
  v_hero_max integer;
  v_enemy_max integer;
  v_damage integer;
  v_events jsonb := '[]'::jsonb;
  v_event_at timestamptz;
  v_end timestamptz;
  v_kind text;
  v_name text;
  v_icon text;
  v_boss_id uuid;
  v_boss_count integer;
  v_next_boss_stage integer;
  v_next_boss jsonb;
  v_encounters jsonb;
  v_result jsonb;
  v_gold integer := 0;
  v_item uuid;
  v_item_count integer;
  v_boss_wins_credited integer := 0;
  v_replay boolean;
  v_first_clear boolean;
  v_biome text;
  v_skill_id text;
  v_skill_name text;
  v_skill_power integer := 0;
  v_skill_effect text;
  v_skill_type text;
  v_skill_cost integer;
  v_skill_cooldown integer;
  v_skills jsonb := '[]'::jsonb;
  v_skill jsonb;
  v_skill_count integer;
  v_loadout jsonb;
  v_loadout_id text;
  v_summary_battles integer := 0;
  v_summary_from_stage integer;
  v_summary_to_stage integer;
  v_summary_wins integer := 0;
  v_summary_defeats integer := 0;
  v_summary_draws integer := 0;
  v_summary_retreats integer := 0;
  v_summary_gold integer := 0;
  v_summary_items jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  -- Preserve the original serialization order: state, encounter, boss receipt,
  -- balance/history, inventory. Concurrent tabs can create or settle once.
  INSERT INTO public.adventure_state(user_id,last_tick_at)
  VALUES(v_uid,v_now) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT v_state FROM public.adventure_state WHERE user_id=v_uid FOR UPDATE;
  SELECT count(*) INTO v_boss_count FROM public.bosses WHERE is_world_event=false;
  IF v_boss_count = 0 THEN RAISE EXCEPTION 'regular boss catalog is empty' USING ERRCODE='22023'; END IF;

  FOR batch IN 1..24 LOOP
  v_gold := 0;
  v_item := NULL;
  v_events := '[]'::jsonb;
  v_skill_id := NULL;
  v_skill_name := NULL;
  v_skill_power := 0;
  v_skill_effect := NULL;
  v_skills := '[]'::jsonb;
  v_boss_id := NULL;
  IF v_state.current_battle_id IS NOT NULL THEN
    SELECT * INTO STRICT v_battle FROM app_private.adventure_battles
      WHERE id=v_state.current_battle_id AND user_id=v_uid FOR UPDATE;
    IF v_battle.status='fighting' AND v_now >= v_battle.ends_at THEN
      -- This choice was fixed by the server power calculation when events were
      -- created. The client supplies neither outcome nor amount.
      IF (v_battle.events->-1->>'enemy_hp')::integer = 0 THEN
        v_battle.status := 'won';
        v_summary_wins := v_summary_wins+1;
      ELSIF v_battle.engine_version='v3'
        AND (v_battle.events->-1->>'hero_hp')::integer > 0 THEN
        v_battle.status := 'draw';
        v_summary_draws := v_summary_draws+1;
      ELSE
        v_battle.status := 'defeated';
        v_summary_defeats := v_summary_defeats+1;
        IF v_state.adventure_mode='progressing' AND v_battle.stage>1 THEN
          v_summary_retreats := v_summary_retreats+1;
        END IF;
      END IF;
      UPDATE app_private.adventure_battles SET status=v_battle.status WHERE id=v_battle.id;
      v_summary_battles := v_summary_battles+1;
      v_summary_from_stage := coalesce(v_summary_from_stage,v_battle.stage);
      v_summary_to_stage := v_battle.stage;
      IF v_state.reward_day <> timezone('America/Sao_Paulo',v_battle.ends_at)::date THEN
        v_state.reward_day := timezone('America/Sao_Paulo',v_battle.ends_at)::date;
        v_state.gold_today := 0;
        v_state.loot_today := 0;
      END IF;
      v_first_clear := v_battle.status='won' AND NOT v_battle.replay;
      IF v_battle.status='won' THEN
        IF v_state.next_reward_at IS NULL OR v_battle.ends_at>=v_state.next_reward_at THEN
          v_state.reward_slot_count := v_state.reward_slot_count+1;
          v_gold := least(CASE WHEN v_battle.kind='boss' THEN 12 ELSE 4 END,
                          greatest(0,120-v_state.gold_today));
          IF v_state.loot_today < 2 AND
             (v_battle.kind='boss' OR v_state.reward_slot_count % 7 = 0) THEN
            SELECT count(*) INTO v_item_count FROM public.game_items i
             WHERE i.category IN ('weapon','armor','accessory') AND lower(i.rarity)='comum'
               AND NOT i.is_consumable AND i.effect IS NULL AND i.level_required <=
                   v_battle.hero_level;
            IF v_item_count > 0 THEN
              SELECT i.id INTO v_item FROM public.game_items i
               WHERE i.category IN ('weapon','armor','accessory') AND lower(i.rarity)='comum'
                 AND NOT i.is_consumable AND i.effect IS NULL AND i.level_required <=
                     v_battle.hero_level
               ORDER BY i.id OFFSET ((v_battle.stage / 7) % v_item_count) LIMIT 1;
            END IF;
          END IF;
          v_state.next_reward_at := v_battle.ends_at+interval '30 minutes';
        END IF;
        IF v_first_clear THEN
          INSERT INTO public.adventure_encounters
          (user_id,stage,attempt,fought_at,kind,won,hero_power,enemy_power,gold,item_id,boss_id)
          VALUES(v_uid,v_battle.stage,v_battle.attempt,v_battle.ends_at,v_battle.kind,
                 true,v_battle.hero_power,v_battle.enemy_power,
                 v_gold,v_item,v_battle.boss_id);
        END IF;
        IF v_first_clear AND v_battle.boss_id IS NOT NULL THEN
          v_boss_wins_credited := 1;
          INSERT INTO public.boss_battles(user_id,boss_id,damage_dealt,won)
          SELECT v_uid,v_battle.boss_id,v_battle.enemy_max_hp,true
          WHERE NOT EXISTS (SELECT 1 FROM public.boss_battles
            WHERE user_id=v_uid AND boss_id=v_battle.boss_id AND won);
        END IF;
        IF v_gold > 0 THEN
          INSERT INTO public.user_balance(user_id,gold) VALUES(v_uid,100)
            ON CONFLICT(user_id) DO NOTHING;
          INSERT INTO public.gold_history(user_id,type,amount,reason)
          VALUES(v_uid,'adventure',v_gold,'Aventura etapa ' || v_battle.stage);
          UPDATE public.user_balance SET gold=gold+v_gold,updated_at=v_now WHERE user_id=v_uid;
          v_state.gold_today := v_state.gold_today+v_gold;
          v_summary_gold := v_summary_gold+v_gold;
        END IF;
        IF v_item IS NOT NULL THEN
          INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped)
          VALUES(v_uid,v_item,1,false)
          ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=public.user_inventory.quantity+1;
          v_state.loot_today := v_state.loot_today+1;
          v_summary_items := v_summary_items || jsonb_build_array(v_item);
        END IF;
      END IF;
      UPDATE app_private.adventure_battles
         SET gold_awarded=v_gold,item_id=v_item WHERE id=v_battle.id;
      IF v_battle.status='won' AND
         (v_state.adventure_mode='progressing' OR v_state.advance_requested) THEN
        v_state.stage := least(100000,v_battle.stage+1);
        v_state.adventure_mode := 'progressing';
      ELSIF v_battle.status='defeated' THEN
        IF v_state.adventure_mode='progressing' THEN
          v_state.stage := greatest(1,v_battle.stage-1);
        END IF;
        v_state.adventure_mode := 'holding';
      END IF;
      v_state.advance_requested := false;
      v_state.attempt := v_state.attempt+1;
      v_state.current_battle_id := NULL;
      v_state.last_tick_at := v_battle.ends_at + interval '1 second';
      v_result := jsonb_build_object('stage',v_battle.stage,'kind',v_battle.kind,
        'status',v_battle.status,
        'end_reason',CASE WHEN v_battle.status='draw' THEN 'turn_limit' ELSE NULL END,
        'won',v_battle.status='won','hero_power',v_battle.hero_power,
        'enemy_power',v_battle.enemy_power,'gold',v_gold,'item_id',v_item,
        'boss_id',v_battle.boss_id,
        'boss_name',CASE WHEN v_battle.kind='boss' THEN v_battle.enemy_name ELSE NULL END,
        'boss_icon',CASE WHEN v_battle.kind='boss' THEN v_battle.enemy_icon ELSE NULL END);
      v_state.last_result := v_result;
    END IF;
  END IF;

  -- Continue a bounded batch from the stored combat snapshot. The cursor
  -- remains behind the server clock when more offline battles are pending.
  IF v_state.current_battle_id IS NULL AND v_now >= v_state.last_tick_at THEN
    v_start := least(v_now,greatest(v_state.last_tick_at,v_now-interval '24 hours'));
    SELECT * INTO v_prior FROM app_private.adventure_battles
      WHERE user_id=v_uid ORDER BY created_at DESC,id DESC LIMIT 1;
    IF v_prior.id IS NOT NULL AND v_start < v_now-interval '30 seconds' THEN
      v_level := v_prior.hero_level;
      v_hero := v_prior.hero_power;
      v_hero_class := v_prior.hero_class;
      v_hero_max := v_prior.hero_max_hp;
      v_hero_attack := v_prior.hero_attack;
      v_hero_defense := v_prior.hero_defense;
      v_hero_max_mp := v_prior.hero_max_mp;
      v_engine_version := v_prior.engine_version;
      v_rules_snapshot := v_prior.rules_snapshot;
      v_default_effect := coalesce(v_rules_snapshot->>'default_effect','physical');
      v_skill_id := v_prior.skill_id;
      v_skill_name := v_prior.skill_name;
      v_skill_power := v_prior.skill_power;
      v_skill_effect := v_prior.skill_effect;
      v_skills := v_prior.skills;
    ELSE
      v_start := v_now;
    SELECT coalesce(p.level,1),p.current_class_id,
           lower(coalesce(nullif(btrim(p.starter_class),''),'novato')),
           p.combat_skill_loadout
      INTO v_level,v_class_id,v_class,v_loadout FROM public.profiles p WHERE p.user_id=v_uid;
    v_level := greatest(1,coalesce(v_level,1));
    v_class := coalesce(v_class,'novato');
    IF v_class NOT IN ('novato','aprendiz','guerreiro','mago','gatuno','arqueiro','ferreiro','clerico') THEN
      v_class := 'novato';
    END IF;
    v_has_class := v_class_id IS NOT NULL;
    IF v_class_id IS NOT NULL THEN
      LOOP
        v_hops := v_hops+1;
        IF v_hops > 16 OR v_class_id=ANY(v_seen) THEN
          RAISE EXCEPTION 'invalid current class ancestry' USING ERRCODE='22023';
        END IF;
        v_seen := array_append(v_seen,v_class_id);
        SELECT * INTO v_class_node FROM public.classes WHERE id=v_class_id;
        IF NOT FOUND OR v_class_node.column_index IS NULL OR
           (v_previous_column IS NOT NULL AND v_class_node.column_index<>v_previous_column-1) THEN
          RAISE EXCEPTION 'invalid current class ancestry' USING ERRCODE='22023';
        END IF;
        IF v_class_node.column_index=1 AND v_class_node.name='Aprendiz' THEN
          v_class := 'novato'; EXIT;
        ELSIF v_class_node.column_index=2 THEN
          v_class := CASE v_class_node.name
            WHEN 'Espadachim' THEN 'guerreiro' WHEN 'Mago' THEN 'mago'
            WHEN 'Gatuno' THEN 'gatuno' WHEN 'Noviço' THEN 'clerico'
            WHEN 'Arqueiro' THEN 'arqueiro' WHEN 'Ferreiro' THEN 'ferreiro' END;
          IF v_class IS NULL THEN RAISE EXCEPTION 'unknown current class base' USING ERRCODE='22023'; END IF;
          EXIT;
        ELSIF v_class_node.column_index<=1 OR v_class_node.parent_class_id IS NULL THEN
          RAISE EXCEPTION 'invalid current class ancestry' USING ERRCODE='22023';
        END IF;
        v_previous_column := v_class_node.column_index;
        v_class_id := v_class_node.parent_class_id;
      END LOOP;
    END IF;
    -- A later migration may install immutable class identity. Resolve it only
    -- after both private helpers exist; this migration remains deployable on
    -- the reviewed live schema and retains the strict legacy gate until then.
    IF to_regprocedure('app_private.hero_class_key(uuid)') IS NOT NULL
       AND to_regprocedure('app_private.has_hero_class(uuid)') IS NOT NULL THEN
      EXECUTE 'SELECT app_private.hero_class_key($1), app_private.has_hero_class($1)'
        INTO v_class,v_has_class USING v_uid;
      v_class := coalesce(v_class,'novato');
      IF v_class NOT IN ('novato','guerreiro','mago','gatuno','arqueiro','ferreiro','clerico')
        OR v_has_class IS NULL THEN
        RAISE EXCEPTION 'invalid canonical class identity' USING ERRCODE='22023';
      END IF;
    END IF;
    v_hero_class := v_class;
    SELECT coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name) IN ('força','forca')),1) AS strength,
           coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name) IN ('inteligência','inteligencia')),1) AS intelligence,
           coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name)='disciplina'),1) AS discipline,
           coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name)='sabedoria'),1) AS wisdom,
           coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name) IN ('resiliência','resiliencia')),1) AS resilience,
           coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name)='vitalidade'),1) AS vitality,
           coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name)='agilidade'),1) AS agility,
           coalesce(max(least(greatest(a.level,1),50)) FILTER (WHERE lower(a.name)='criatividade'),1) AS creativity
      INTO v_attributes FROM public.attributes a WHERE a.user_id=v_uid;
    v_attribute_power := least(180,
      CASE WHEN v_class IN ('mago','clerico') THEN
        4*(v_attributes.intelligence-1)+2*(v_attributes.wisdom-1)
      WHEN v_class IN ('guerreiro','ferreiro','arqueiro','gatuno') THEN
        6*(v_attributes.strength-1)+2*(v_attributes.discipline-1)
      ELSE greatest(6*(v_attributes.strength-1)+2*(v_attributes.discipline-1),
                    4*(v_attributes.intelligence-1)+2*(v_attributes.wisdom-1)) END
      +(5*(v_attributes.resilience-1)+3*(v_attributes.vitality-1))/2
      +(6*(v_attributes.agility-1)+2*(v_attributes.creativity-1))/3
      +(8*(v_attributes.strength-1)+14*(v_attributes.vitality-1))/10);
    SELECT coalesce(sum(greatest(0,i.atk_bonus)),0) AS attack,
           coalesce(sum(greatest(0,i.matk_bonus)),0) AS magic_attack,
           coalesce(sum(greatest(0,i.def_bonus)),0) AS defense,
           coalesce(sum(greatest(0,i.hp_bonus)),0) AS hp,
           coalesce(sum(greatest(0,i.mp_bonus)),0) AS mp
      INTO v_equipment FROM public.user_inventory ui JOIN public.game_items i ON i.id=ui.item_id
     WHERE ui.user_id=v_uid AND ui.equipped AND ui.quantity>0
       AND i.level_required<=v_level
       AND (NOT (i.requer_sintonizacao OR lower(i.rarity) IN ('epico','lendario')) OR ui.sintonizado);
    SELECT CASE lower(i.weapon_element)
      WHEN 'arcano' THEN 'arcane' WHEN 'fogo' THEN 'fire'
      WHEN 'gelo' THEN 'ice' WHEN 'raio' THEN 'lightning'
      WHEN 'natureza' THEN 'nature' WHEN 'sagrado' THEN 'light'
      ELSE 'physical' END INTO v_default_effect
      FROM public.user_inventory ui JOIN public.game_items i ON i.id=ui.item_id
     WHERE ui.user_id=v_uid AND ui.equipped AND ui.quantity>0 AND i.category='weapon'
       AND i.level_required<=v_level
       AND (NOT (i.requer_sintonizacao OR lower(i.rarity) IN ('epico','lendario')) OR ui.sintonizado)
     ORDER BY i.id LIMIT 1;
    v_default_effect := coalesce(v_default_effect,'physical');

    -- The profile loadout is client editable. Only its IDs select candidates;
    -- name, power and effect are read from the allocated node or equipped item.
    IF jsonb_typeof(v_loadout)='array' THEN
      FOR v_loadout_id IN SELECT value->>'id' FROM jsonb_array_elements(v_loadout)
                          WITH ORDINALITY AS selected(value,position)
                          WHERE jsonb_typeof(value)='object' ORDER BY position LOOP
        SELECT n.id,n.name,least(200,greatest(0,
          round(coalesce((n.effect->>'power')::numeric,30)
          *(1+(greatest(1,ps.rank)-1)*coalesce((n.effect->>'pct_per_rank')::numeric,10)/100))::integer)),
          CASE lower(coalesce(n.effect->>'element','neutro'))
            WHEN 'arcano' THEN 'arcane' WHEN 'fogo' THEN 'fire'
            WHEN 'gelo' THEN 'ice' WHEN 'raio' THEN 'lightning'
            WHEN 'natureza' THEN 'nature' WHEN 'sagrado' THEN 'light'
            ELSE 'physical' END,
          CASE coalesce(n.effect->>'effectType','dano')
            WHEN 'damage' THEN 'dano' ELSE coalesce(n.effect->>'effectType','dano') END,
          least(100,greatest(0,coalesce((n.effect->>'mpCost')::integer,0))),
          least(8,greatest(1,coalesce((n.effect->>'cooldown')::integer,1)))
          INTO v_skill_id,v_skill_name,v_skill_power,v_skill_effect,
               v_skill_type,v_skill_cost,v_skill_cooldown
          FROM public.player_skill_nodes ps JOIN public.skill_tree_nodes n ON n.id=ps.node_id
         WHERE ps.user_id=v_uid AND ps.rank>=1 AND n.id=v_loadout_id
           AND n.node_type='skill'
           AND app_private.adventure_skill_tree_allowed(n.tree,v_class,v_has_class)
           AND coalesce(n.effect->>'effectType','dano') IN ('dano','damage','heal','buff','debuff','cc')
           AND ((n.requires_weapon_element IS NULL AND n.requires_weapon_type IS NULL) OR EXISTS (
             SELECT 1 FROM public.user_inventory req_ui JOIN public.game_items req_i ON req_i.id=req_ui.item_id
             WHERE req_ui.user_id=v_uid AND req_ui.equipped AND req_ui.quantity>0 AND req_i.category='weapon'
               AND req_i.level_required<=v_level
               AND (n.requires_weapon_element IS NULL OR req_i.weapon_element=n.requires_weapon_element)
               AND (n.requires_weapon_type IS NULL OR req_i.weapon_type=n.requires_weapon_type)
               AND (NOT (req_i.requer_sintonizacao OR lower(req_i.rarity) IN ('epico','lendario')) OR req_ui.sintonizado)))
         LIMIT 1;
        IF NOT FOUND THEN
          SELECT 'weapon_' || i.id::text,coalesce(i.weapon_skill->>'name','Golpe de arma'),
                least(200,greatest(0,coalesce((i.weapon_skill->>'power')::numeric,0)::integer))
                ,CASE lower(coalesce(i.weapon_skill->>'element','neutro'))
                  WHEN 'arcano' THEN 'arcane' WHEN 'fogo' THEN 'fire'
                  WHEN 'gelo' THEN 'ice' WHEN 'raio' THEN 'lightning'
                  WHEN 'natureza' THEN 'nature' WHEN 'sagrado' THEN 'light'
                  ELSE 'physical' END,
                CASE coalesce(i.weapon_skill->>'effectType','dano')
                  WHEN 'damage' THEN 'dano' ELSE coalesce(i.weapon_skill->>'effectType','dano') END,
                least(100,greatest(0,coalesce((i.weapon_skill->>'mpCost')::integer,0))),
                least(8,greatest(1,coalesce((i.weapon_skill->>'cooldown')::integer,1)))
          INTO v_skill_id,v_skill_name,v_skill_power,v_skill_effect,
               v_skill_type,v_skill_cost,v_skill_cooldown
          FROM public.user_inventory ui JOIN public.game_items i ON i.id=ui.item_id
         WHERE ui.user_id=v_uid AND ui.equipped AND ui.quantity>0 AND i.category='weapon'
           AND i.level_required<=v_level AND i.weapon_skill IS NOT NULL
           AND (NOT (i.requer_sintonizacao OR lower(i.rarity) IN ('epico','lendario')) OR ui.sintonizado)
           AND 'weapon_' || i.id::text=v_loadout_id
           AND coalesce(i.weapon_skill->>'effectType','dano') IN ('dano','damage','heal','buff','debuff','cc')
         LIMIT 1;
        END IF;
        IF v_skill_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_skills) s WHERE s->>'id'=v_skill_id) THEN
          v_skills := v_skills || jsonb_build_array(jsonb_build_object(
            'id',v_skill_id,'name',v_skill_name,'power',v_skill_power,'effect',v_skill_effect,
            'type',v_skill_type,'mp_cost',v_skill_cost,'cooldown',v_skill_cooldown,
            'strike',v_skill_id IN ('a_vetor','gt_furtivo','ferreiro_t1_pancada_atordoante')));
        END IF;
      END LOOP;
    END IF;
    v_skill_count := jsonb_array_length(v_skills);
    IF v_skill_count > 0 THEN
      v_skill := v_skills->(v_state.skill_rotation % v_skill_count);
      v_skill_id := v_skill->>'id';
      v_skill_name := v_skill->>'name';
      v_skill_power := (v_skill->>'power')::integer;
      v_skill_effect := v_skill->>'effect';
    ELSE
      v_skill_id := NULL; v_skill_name := NULL; v_skill_power := 0;
      v_skill_effect := NULL;
    END IF;
    -- Mirrors computeSoloCombatStats: class-mapped offense, calibrated attr
    -- fractions, full valid gear bonuses, and the same HP/MP baselines.
    v_hero_attack := round(14+v_level*2+0.45*CASE
      WHEN v_class IN ('gatuno','arqueiro') THEN 6*v_attributes.agility+2*v_attributes.creativity
      WHEN v_class IN ('mago','clerico','novato') THEN 4*v_attributes.intelligence+2*v_attributes.wisdom
      ELSE 6*v_attributes.strength+2*v_attributes.discipline END)::integer
      +v_equipment.attack+floor(v_equipment.magic_attack/2);
    v_hero_defense := round(8+v_level*1.4+0.35*(5*v_attributes.resilience+3*v_attributes.vitality))::integer
      +v_equipment.defense;
    v_hero_max := round(100+v_level*12+0.8*(8*v_attributes.strength+14*v_attributes.vitality))::integer
      +v_equipment.hp;
    v_hero_max_mp := greatest(10,40+v_level*8+10*v_attributes.intelligence+6*v_attributes.wisdom+v_equipment.mp);
    v_hero := v_hero_attack+v_hero_defense/2+v_hero_max/10;
    v_engine_version := 'v3';
    v_rules_snapshot := jsonb_build_object('version','v3','hero_attack',v_hero_attack,
      'hero_defense',v_hero_defense,'hero_max_hp',v_hero_max,'hero_max_mp',v_hero_max_mp,
      'skills',v_skills,'default_effect',v_default_effect,'asa_fire_multiplier',0.5);
    END IF;
    IF v_skills <> '[]'::jsonb THEN
      v_skill := v_skills->(v_state.skill_rotation % jsonb_array_length(v_skills));
      v_skill_id := v_skill->>'id';
      v_skill_name := v_skill->>'name';
      v_skill_power := (v_skill->>'power')::integer;
      v_skill_effect := v_skill->>'effect';
    END IF;
    v_biome := (ARRAY['forest','aquatic','ruins','volcanic'])[
      ((v_state.stage-1)/10)%4+1];
    v_kind := CASE WHEN v_state.stage % 10=0 THEN 'boss' ELSE 'normal' END;
    IF v_kind='boss' THEN
      SELECT b.id,b.name,b.icon INTO STRICT v_boss_id,v_name,v_icon
        FROM public.bosses b WHERE b.is_world_event=false ORDER BY b.level,b.id
        OFFSET ((v_state.stage/10-1)%v_boss_count) LIMIT 1;
      v_enemy_resistances := '{}'::jsonb;
    ELSE
      SELECT c.name,c.icon,c.resistances INTO STRICT v_name,v_icon,v_enemy_resistances
        FROM app_private.adventure_enemy_catalog c
       WHERE c.biome=((v_state.stage-1)/10)%4 AND c.slot=(v_state.stage-1)%3;
      IF v_engine_version='v3' AND v_name='Asa de brasa' THEN
        v_enemy_resistances := jsonb_build_object('fire',
          coalesce((v_rules_snapshot->>'asa_fire_multiplier')::numeric,0.5));
      END IF;
    END IF;
    v_enemy := CASE WHEN v_kind='boss' THEN least(400,30+floor(1.5*v_state.stage)::integer)
                    ELSE least(380,20+floor(1.5*v_state.stage)::integer) END;
    v_enemy_max := CASE WHEN v_kind='boss' THEN 150 ELSE 100 END;
    v_hero_hp := v_hero_max;
    v_enemy_hp := v_enemy_max;
    IF v_engine_version='v3' THEN
      v_events := app_private.adventure_simulate_v3(v_start,v_hero_attack,v_hero_defense,
        v_hero_max,v_hero_max_mp,v_enemy,v_enemy_max,v_skills,v_enemy_resistances,
        v_default_effect,v_state.skill_rotation);
      v_end := (v_events->-1->>'at')::timestamptz;
    ELSE
    FOR i IN 1..10 LOOP
      v_event_at := v_start + i * interval '1.6 seconds';
      IF i % 2=1 THEN
        v_damage := ceil(v_enemy_max::numeric / CASE WHEN v_hero>=v_enemy THEN 5 ELSE 8 END)::integer;
        IF i=3 AND v_skill_id IS NOT NULL THEN
          v_damage := v_damage+least(20,v_skill_power/10);
        END IF;
        v_damage := least(v_enemy_hp,v_damage);
        v_enemy_hp := v_enemy_hp-v_damage;
      ELSE
        v_damage := ceil(v_hero_max::numeric / CASE WHEN v_hero>=v_enemy THEN 7 ELSE 5 END)::integer;
        v_damage := least(v_hero_hp,v_damage);
        v_hero_hp := v_hero_hp-v_damage;
      END IF;
      v_events := v_events || jsonb_build_array(jsonb_build_object(
        'at',v_event_at,'actor',CASE WHEN i%2=1 THEN 'hero' ELSE 'enemy' END,
        'kind',CASE WHEN i=3 AND v_skill_id IS NOT NULL THEN 'skill' ELSE 'attack' END,
        'damage',v_damage,'hero_hp',v_hero_hp,'enemy_hp',v_enemy_hp,
        'skill_id',CASE WHEN i=3 THEN v_skill_id ELSE NULL END,
        'skill_name',CASE WHEN i=3 THEN v_skill_name ELSE NULL END,
        'effect',CASE WHEN i=3 AND v_skill_id IS NOT NULL THEN v_skill_effect
                      WHEN i%2=1 AND v_hero_class IN ('mago','clerico') THEN 'arcane'
                      ELSE 'physical' END));
      v_end := v_event_at;
      EXIT WHEN v_hero_hp=0 OR v_enemy_hp=0;
    END LOOP;
    END IF;
    v_replay := EXISTS(SELECT 1 FROM public.adventure_encounters
      WHERE user_id=v_uid AND stage=v_state.stage AND won);
    INSERT INTO app_private.adventure_battles
      (user_id,stage,attempt,kind,status,replay,biome,started_at,ends_at,
        hero_power,hero_class,hero_level,enemy_power,hero_max_hp,enemy_max_hp,enemy_name,enemy_icon,
        boss_id,skill_id,skill_name,skill_power,skill_effect,skills,events,
        hero_attack,hero_defense,hero_max_mp,enemy_resistances,engine_version,rules_snapshot)
    VALUES(v_uid,v_state.stage,v_state.attempt,v_kind,'fighting',v_replay,v_biome,v_start,v_end,
            v_hero,v_hero_class,v_level,v_enemy,v_hero_max,v_enemy_max,v_name,v_icon,v_boss_id,
            v_skill_id,v_skill_name,v_skill_power,v_skill_effect,v_skills,v_events,
            v_hero_attack,v_hero_defense,v_hero_max_mp,
            CASE WHEN v_engine_version='v3' THEN v_enemy_resistances ELSE NULL END,
            v_engine_version,v_rules_snapshot) RETURNING * INTO v_battle;
    v_state.current_battle_id := v_battle.id;
    v_state.skill_rotation := v_state.skill_rotation+1;
  END IF;
  EXIT WHEN v_state.current_battle_id IS NULL OR v_battle.ends_at>v_now;
  END LOOP;

  UPDATE public.adventure_state SET stage=v_state.stage,attempt=v_state.attempt,
    last_tick_at=v_state.last_tick_at,reward_day=v_state.reward_day,
    next_reward_at=v_state.next_reward_at,
    gold_today=v_state.gold_today,loot_today=v_state.loot_today,
    last_result=v_state.last_result,current_battle_id=v_state.current_battle_id,
    adventure_mode=v_state.adventure_mode,advance_requested=v_state.advance_requested,
    skill_rotation=v_state.skill_rotation,reward_slot_count=v_state.reward_slot_count,
    updated_at=v_now WHERE user_id=v_uid;
  -- Only rendering timelines are pruned; public first clears and financial
  -- history remain durable. IDs of pruned battles are never reusable.
  DELETE FROM app_private.adventure_battles old
   WHERE old.user_id=v_uid AND old.status<>'fighting'
     AND old.id NOT IN (SELECT kept.id FROM app_private.adventure_battles kept
       WHERE kept.user_id=v_uid ORDER BY kept.started_at DESC,kept.created_at DESC,kept.id DESC
       LIMIT 127);
  SELECT coalesce(jsonb_agg(e ORDER BY e.fought_at DESC,e.stage DESC,e.attempt DESC),'[]'::jsonb)
    INTO v_encounters FROM (
      SELECT ab.stage,ab.attempt,ab.ends_at AS fought_at,ab.kind,ab.status,
             CASE WHEN ab.status='draw' THEN 'turn_limit' ELSE NULL END AS end_reason,
             ab.status='won' AS won,
             ab.hero_power,ab.enemy_power,ab.gold_awarded AS gold,ab.item_id,ab.boss_id,
             b.name AS boss_name,b.icon AS boss_icon
      FROM app_private.adventure_battles ab LEFT JOIN public.bosses b ON b.id=ab.boss_id
      WHERE ab.user_id=v_uid AND ab.status<>'fighting'
      ORDER BY ab.ends_at DESC,ab.created_at DESC LIMIT 8
    ) e;
  SELECT * INTO v_last_battle FROM app_private.adventure_battles
   WHERE user_id=v_uid AND status<>'fighting'
   ORDER BY ends_at DESC,created_at DESC,id DESC LIMIT 1;
  v_next_boss_stage := ((v_state.stage+9)/10)*10;
  SELECT jsonb_build_object('stage',v_next_boss_stage,'id',b.id,'name',b.name,'icon',b.icon)
    INTO STRICT v_next_boss FROM public.bosses b WHERE b.is_world_event=false
    ORDER BY b.level,b.id OFFSET ((v_next_boss_stage/10-1)%v_boss_count) LIMIT 1;
  RETURN jsonb_build_object('stage',v_state.stage,'mode',v_state.adventure_mode,
    'advance_pending',v_state.advance_requested,
    'next_at',CASE WHEN v_battle.status='fighting' THEN greatest(v_now,v_battle.ends_at)
                   ELSE greatest(v_now,v_state.last_tick_at) END,
    'server_now',v_now,'last_result',v_state.last_result,'encounters',v_encounters,
    'boss',v_next_boss,'boss_wins_credited',v_boss_wins_credited,
    'gold_today',v_state.gold_today,'loot_today',v_state.loot_today,
    'reward_day',v_state.reward_day,
    'catchup',jsonb_build_object('battles',v_summary_battles,
       'from_stage',v_summary_from_stage,'to_stage',v_summary_to_stage,
       'wins',v_summary_wins,'defeats',v_summary_defeats,'draws',v_summary_draws,
       'retreats',v_summary_retreats,
       'gold',v_summary_gold,'items',v_summary_items,
       'defeated',v_summary_defeats>0,
       'pending',v_battle.status='fighting' AND v_battle.ends_at<=v_now),
    'battle',CASE WHEN v_battle.id IS NULL THEN NULL
                   ELSE app_private.adventure_battle_payload(v_battle,v_now) END,
    'last_battle',CASE WHEN v_last_battle.id IS NULL THEN NULL
                   ELSE app_private.adventure_battle_payload(v_last_battle,v_now) END,
    'limits',jsonb_build_object('interval_minutes',CASE
       WHEN v_battle.id IS NOT NULL AND v_battle.ends_at>v_battle.started_at
         THEN round(extract(epoch FROM v_battle.ends_at-v_battle.started_at)/60,4)
       WHEN v_last_battle.id IS NOT NULL AND v_last_battle.ends_at>v_last_battle.started_at
         THEN round(extract(epoch FROM v_last_battle.ends_at-v_last_battle.started_at)/60,4)
       ELSE 0.25 END,'reward_interval_minutes',30,'offline_hours',24,
       'gold_per_day',120,'items_per_day',2));
END;
$$;
REVOKE ALL ON FUNCTION app_private.sync_auto_adventure() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION app_private.sync_auto_adventure() TO authenticated;
