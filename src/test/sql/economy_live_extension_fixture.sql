-- Incremental economy-only PG17 fixture after the exact 12-file PR70 replay.
-- Shop/buy functions are copied from the frozen live-source-snapshot.json;
-- hero_class_key matches live-source-supplement.json (md5 da6e71eb...).
-- The local class_path_matches here is not hash-equivalent to Primary and this
-- fixture does not provide the full Recipe/Chest dependencies. Use the shared
-- composed fixture for final integration; this one verifies economy in isolation.
ALTER TABLE public.game_items ADD COLUMN name text NOT NULL DEFAULT 'Fixture', ADD COLUMN description text, ADD COLUMN icon text NOT NULL DEFAULT 'X', ADD COLUMN stat_label text, ADD COLUMN agi_bonus integer NOT NULL DEFAULT 0, ADD COLUMN crit_bonus integer NOT NULL DEFAULT 0, ADD COLUMN shop_price integer, ADD COLUMN stackable boolean NOT NULL DEFAULT false, ADD COLUMN is_starter boolean NOT NULL DEFAULT false, ADD COLUMN starter_class text, ADD COLUMN boss_drop_level integer, ADD COLUMN required_attribute text, ADD COLUMN required_attribute_level integer DEFAULT 1, ADD COLUMN weapon_passive text, ADD COLUMN unlocks_node_id text;
ALTER TABLE public.user_balance ADD COLUMN balance_percent integer NOT NULL DEFAULT 100;
ALTER TABLE public.gold_history ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid(), ADD COLUMN created_at timestamptz NOT NULL DEFAULT clock_timestamp();
ALTER TABLE public.user_inventory ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid(), ADD COLUMN obtained_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN streak_protector_week text, ADD COLUMN streak_protector_charges integer, ADD COLUMN streak_protector_max integer;
ALTER TABLE public.profiles ADD COLUMN starter_item text;
ALTER TABLE public.classes ADD COLUMN level_min integer NOT NULL DEFAULT 1;
CREATE TABLE public.inventory_purchase_requests(user_id uuid NOT NULL, request_id uuid NOT NULL, item_id uuid NOT NULL, price integer NOT NULL, PRIMARY KEY(user_id,request_id));
CREATE TABLE public.shop_items(id uuid PRIMARY KEY, name text NOT NULL, cost_percent integer NOT NULL, effect text NOT NULL, duration text);
INSERT INTO public.shop_items VALUES ('12345678-0000-0000-0000-000000000001','Protetor',15,'streak_protector',NULL),('12345678-0000-0000-0000-000000000002','XP',35,'xp_boost','1h');
CREATE TABLE public.talentos_disponiveis(id uuid PRIMARY KEY, efeito text);
CREATE TABLE public.talentos_jogador(personagem_id uuid, talento_id uuid);
CREATE TABLE public.user_buffs(user_id uuid,item_id uuid,expires_at timestamptz);
CREATE TABLE public.activity_log(user_id uuid,action text,description text,xp_gained integer);
-- The following class functions mirror the protected live definitions, rather
-- than replacing the class authority with a permissive test helper.
CREATE FUNCTION app_private.base_class_id(p_starter text)
RETURNS uuid LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog AS $$
  SELECT CASE p_starter
    WHEN 'guerreiro' THEN '00000002-0000-0000-0000-000000000001'
    WHEN 'mago' THEN '00000002-0000-0000-0000-000000000002'
    WHEN 'gatuno' THEN '00000002-0000-0000-0000-000000000003'
    WHEN 'ferreiro' THEN '00000002-0000-0000-0000-000000000004'
    WHEN 'clerico' THEN '00000002-0000-0000-0000-000000000005'
    WHEN 'novato' THEN '00000002-0000-0000-0000-000000000005'
    WHEN 'arqueiro' THEN '00000002-0000-0000-0000-000000000006'
  END::uuid;
$$;
REVOKE ALL ON FUNCTION app_private.base_class_id(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION app_private.class_path_matches(p_current uuid,p_starter text,p_level integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
  WITH RECURSIVE path AS (
    SELECT c.id,c.parent_class_id,c.column_index,c.level_min,true AS adjacent,
           ARRAY[c.id] AS visited,1 AS hops
    FROM public.classes c WHERE c.id=p_current
    UNION ALL
    SELECT c.id,c.parent_class_id,c.column_index,c.level_min,
           path.adjacent AND ((path.column_index=c.column_index+1) IS TRUE),
           path.visited||c.id,path.hops+1
    FROM path JOIN public.classes c ON c.id=path.parent_class_id
    WHERE path.hops<16 AND NOT c.id=ANY(path.visited)
  )
  SELECT EXISTS (SELECT 1 FROM path HAVING bool_and(level_min<=p_level)
    AND bool_and(adjacent)
    AND count(*) FILTER (WHERE id=app_private.base_class_id(p_starter)
                         AND column_index=2)=1
    AND count(*) FILTER (WHERE id='00000001-0000-0000-0000-000000000001'::uuid
                         AND column_index=1 AND parent_class_id IS NULL)=1
    AND count(*) FILTER (WHERE parent_class_id IS NULL)=1);
$$;
REVOKE ALL ON FUNCTION app_private.class_path_matches(uuid,text,integer) FROM PUBLIC,anon,authenticated;
CREATE TABLE app_private.hero_class_identity (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  starter_class text NOT NULL CHECK(starter_class IN
    ('guerreiro','mago','gatuno','ferreiro','clerico','novato','arqueiro')),
  starter_item text,
  current_class_id uuid REFERENCES public.classes(id),
  chosen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_private.hero_class_identity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.hero_class_identity FROM PUBLIC,anon,authenticated;
INSERT INTO app_private.hero_class_identity(user_id,starter_class,starter_item,current_class_id)
SELECT user_id,starter_class,starter_item,current_class_id
FROM public.profiles WHERE starter_class IS NOT NULL;
CREATE OR REPLACE FUNCTION app_private.hero_class_key(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app_private'
AS $function$
DECLARE v_identity app_private.hero_class_identity%ROWTYPE;
        v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_identity FROM app_private.hero_class_identity WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    IF v_profile.current_class_id = '00000001-0000-0000-0000-000000000001'::uuid
       AND v_profile.level >= 1 THEN RETURN 'aprendiz'; END IF;
    RETURN NULL;
  END IF;
  IF (v_profile.starter_class,v_profile.current_class_id,v_profile.starter_item)
     IS DISTINCT FROM
     (v_identity.starter_class,v_identity.current_class_id,v_identity.starter_item)
  THEN RETURN NULL; END IF;
  IF v_identity.current_class_id IS NOT NULL THEN
    IF v_identity.current_class_id = '00000001-0000-0000-0000-000000000001'::uuid
       AND v_profile.level >= 1 THEN RETURN 'aprendiz'; END IF;
    IF NOT app_private.class_path_matches(
      v_identity.current_class_id,v_identity.starter_class,v_profile.level
    ) THEN RETURN NULL; END IF;
  END IF;
  RETURN CASE WHEN v_identity.starter_class = 'clerico' THEN 'novato'
              ELSE v_identity.starter_class END;
END;
$function$;
REVOKE ALL ON FUNCTION app_private.hero_class_key(uuid) FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.game_items,public.shop_items TO authenticated;
INSERT INTO public.game_items(id,name,description,icon,category,rarity,stat_label,atk_bonus,matk_bonus,def_bonus,hp_bonus,mp_bonus,shop_price,level_required,stackable,is_consumable,effect,is_starter,boss_drop_level) VALUES ('36aa16a5-153d-4c08-941e-ae3ee51d54d4','Poção de HP Menor','Restaura 30 HP.','🧪','consumable','comum','Restaura 30 HP',0,0,0,0,0,15,1,true,true,'heal_30',false,NULL);
INSERT INTO public.game_items(id,name,description,icon,category,rarity,stat_label,atk_bonus,matk_bonus,def_bonus,hp_bonus,mp_bonus,shop_price,level_required,stackable,is_consumable,effect,is_starter,boss_drop_level) VALUES ('874346e5-c815-4de4-ae2d-099ce211f05e','Poção de HP Média','Restaura 80 HP.','🧪','consumable','incomum','Restaura 80 HP',0,0,0,0,0,40,5,true,true,'heal_80',false,NULL);
INSERT INTO public.game_items(id,name,description,icon,category,rarity,stat_label,atk_bonus,matk_bonus,def_bonus,hp_bonus,mp_bonus,shop_price,level_required,stackable,is_consumable,effect,is_starter,boss_drop_level) VALUES ('3d99dfbe-2735-4eff-9928-5efca01fc254','Poção de HP Grande','Restaura 200 HP.','🧪','consumable','raro','Restaura 200 HP',0,0,0,0,0,100,15,true,true,'heal_200',false,NULL);
INSERT INTO public.game_items(id,name,description,icon,category,rarity,stat_label,atk_bonus,matk_bonus,def_bonus,hp_bonus,mp_bonus,shop_price,level_required,stackable,is_consumable,effect,is_starter,boss_drop_level) VALUES ('ea63052e-8530-4c4e-98ed-9d62a9cbf781','Poção de MP Menor','Restaura 20 MP.','💧','consumable','comum','Restaura 20 MP',0,0,0,0,0,15,1,true,true,'mana_20',false,NULL);
INSERT INTO public.game_items(id,name,description,icon,category,rarity,stat_label,atk_bonus,matk_bonus,def_bonus,hp_bonus,mp_bonus,shop_price,level_required,stackable,is_consumable,effect,is_starter,boss_drop_level) VALUES ('125cd22f-a693-4e93-ac8e-9092bc1b3792','Poção de MP Média','Restaura 60 MP.','💧','consumable','incomum','Restaura 60 MP',0,0,0,0,0,40,5,true,true,'mana_60',false,NULL);
INSERT INTO public.game_items(id,name,description,icon,category,rarity,stat_label,atk_bonus,matk_bonus,def_bonus,hp_bonus,mp_bonus,shop_price,level_required,stackable,is_consumable,effect,is_starter,boss_drop_level) VALUES ('72ce75f5-aa16-4480-96d4-e9caa1961c1e','Couraça de Couro','Armadura leve de couro curtido. Defesa modesta com mobilidade.','🛡️','armor','comum','DEF +5 / HP +8',0,0,5,8,0,45,1,false,false,NULL,false,NULL);
INSERT INTO public.game_items(id,name,description,icon,category,rarity,stat_label,atk_bonus,matk_bonus,def_bonus,hp_bonus,mp_bonus,shop_price,level_required,stackable,is_consumable,effect,is_starter,boss_drop_level) VALUES ('cab90bce-5b79-408a-b2b5-ae86deb098a1','Colar de Pétalas','Pétalas secas de flores raras concedem leve regeneração de mana.','📿','accessory','comum','MATK +2 / MP +6',0,2,0,0,6,35,1,false,false,NULL,false,NULL);
INSERT INTO public.game_items(id,name,description,icon,category,rarity,stat_label,atk_bonus,matk_bonus,def_bonus,hp_bonus,mp_bonus,shop_price,level_required,stackable,is_consumable,effect,is_starter,boss_drop_level) VALUES ('dc3bb3be-1d81-41ab-ab0e-32ddad07a9a1','Adaga Iniciante','Lâmina simples, leve e confiável para os primeiros combates.','🗡️','weapon','comum','ATK +4',4,0,0,0,0,35,1,false,false,NULL,false,NULL);
INSERT INTO public.game_items(id,name,description,icon,category,rarity,stat_label,atk_bonus,matk_bonus,def_bonus,hp_bonus,mp_bonus,shop_price,level_required,stackable,is_consumable,effect,is_starter,boss_drop_level) VALUES ('f45bdbbd-eff1-42e1-8bb0-45a4714542b0','Anel de Cobre','Um anel simples, mas sua liga reflete um pouco da energia mágica.','💍','accessory','comum','ATK/MATK +1 / MP +3',1,1,1,0,3,30,1,false,false,NULL,false,NULL);
INSERT INTO public.game_items(id,name,description,icon,category,rarity,stat_label,atk_bonus,matk_bonus,def_bonus,hp_bonus,mp_bonus,shop_price,level_required,stackable,is_consumable,effect,is_starter,boss_drop_level) VALUES ('66f40ee6-ef2e-4ca9-ae46-b5dbcda9565c','Capuz do Caminhante','Protege a cabeça e ajuda a manter o foco em longas jornadas.','🧢','armor','comum','DEF +3 / HP +5',0,0,3,5,3,40,1,false,false,NULL,false,NULL);
INSERT INTO public.game_items(id,name,description,icon,category,rarity,stat_label,atk_bonus,matk_bonus,def_bonus,hp_bonus,mp_bonus,shop_price,level_required,stackable,is_consumable,effect,is_starter,boss_drop_level) VALUES ('40c70192-e386-4478-acce-eba1caa9b237','Cajado de Madeira','Canaliza um pouco de mana — boa escolha para magos novatos.','🪄','weapon','comum','MATK +4 / MP +4',0,4,0,0,4,40,1,false,false,NULL,false,NULL);
CREATE OR REPLACE FUNCTION public.buy_shop_item(p_item_id uuid, p_today date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_server_date date := (now())::date;
  v_item public.shop_items%ROWTYPE;
  v_has_merchant boolean;
  v_cost int;
  v_gold int;
  v_expires timestamptz;
  v_week date;
  v_cur_week text;
  v_default_charges int;
  v_max_slots int;
  v_next_charges int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF p_today IS NULL OR p_today < v_server_date - 1 OR p_today > v_server_date + 1 THEN
    p_today := v_server_date;
  END IF;

  SELECT * INTO v_item FROM public.shop_items WHERE id = p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.talentos_jogador tj
    JOIN public.talentos_disponiveis td ON td.id = tj.talento_id
    WHERE tj.personagem_id = v_uid AND td.efeito = 'mestre_mercador'
  ) INTO v_has_merchant;

  v_cost := COALESCE(v_item.cost_percent, 0);
  IF v_has_merchant THEN v_cost := GREATEST(1, floor(v_cost * 0.9)::int); END IF;

  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id = v_uid FOR UPDATE;
  IF v_gold IS NULL THEN v_gold := 0; END IF;
  IF v_gold < v_cost THEN
    RAISE EXCEPTION 'Saldo insuficiente! Ganhe ouro completando missões.';
  END IF;

  UPDATE public.user_balance SET gold = v_gold - v_cost, updated_at = now() WHERE user_id = v_uid;

  IF v_item.effect = 'streak_protector' THEN
    v_week := date_trunc('week', p_today)::date;  -- segunda-feira ISO
    SELECT streak_protector_week,
           CASE WHEN streak_protector_week = v_week::text THEN COALESCE(streak_protector_charges, 2) ELSE 2 END,
           LEAST(3, GREATEST(1, COALESCE(streak_protector_max, 3)))
      INTO v_cur_week, v_default_charges, v_max_slots
      FROM public.profiles WHERE user_id = v_uid;

    v_next_charges := LEAST(v_max_slots, v_default_charges + 1);

    UPDATE public.profiles
       SET streak_protector_charges = v_next_charges,
           streak_protector_max = v_max_slots,
           streak_protector_week = v_week::text
     WHERE user_id = v_uid;

    INSERT INTO public.activity_log (user_id, action, description, xp_gained)
    VALUES (v_uid, 'streak_protector_bought',
            'Protetor de Streak comprado. Cargas: ' || v_next_charges || '/' || v_max_slots, 0);
  ELSE
    v_expires := CASE v_item.duration
      WHEN '50m'   THEN now() + interval '50 minutes'
      WHEN '1h'    THEN now() + interval '1 hour'
      WHEN '1h30m' THEN now() + interval '90 minutes'
      WHEN '2h'    THEN now() + interval '2 hours'
      WHEN '3h'    THEN now() + interval '3 hours'
      WHEN '12h'   THEN now() + interval '12 hours'
      WHEN '24h'   THEN now() + interval '24 hours'
      ELSE NULL END;

    INSERT INTO public.user_buffs (user_id, item_id, expires_at) VALUES (v_uid, p_item_id, v_expires);
  END IF;

  INSERT INTO public.gold_history (user_id, type, amount, reason)
  VALUES (v_uid, 'compra_loja', -v_cost,
          CASE WHEN v_has_merchant THEN 'Comprou ' || v_item.name || ' com desconto de talento'
               ELSE 'Comprou ' || v_item.name END);

  RETURN jsonb_build_object('ok', true, 'cost', v_cost);
END;
$function$;
CREATE OR REPLACE FUNCTION app_private.sync_auto_adventure()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_budget_started timestamptz;
  v_response_now timestamptz;
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

  v_budget_started := clock_timestamp();
  -- Preserve every settlement and receipt; bound work by time as well as count.
  FOR batch IN 1..256 LOOP
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
        IF v_battle.stage>1 THEN
          v_summary_retreats := v_summary_retreats+1;
        END IF;
      END IF;
      UPDATE app_private.adventure_battles SET status=v_battle.status WHERE id=v_battle.id;
      v_summary_battles := v_summary_battles+1;
      v_summary_from_stage := coalesce(v_summary_from_stage,v_battle.stage);
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
        v_state.stage := greatest(1,v_battle.stage-1);
        v_state.adventure_mode := 'holding';
      END IF;
      v_summary_to_stage := v_state.stage;
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
    -- A settled row is already the exact preceding server snapshot. Reuse it
    -- instead of sorting every retained timeline again for each offline fight.
    IF v_battle.id IS NOT NULL THEN
      v_prior := v_battle;
    ELSE
      SELECT * INTO v_prior FROM app_private.adventure_battles
        WHERE user_id=v_uid ORDER BY started_at DESC,id DESC LIMIT 1;
    END IF;
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
    v_biome := (ARRAY['forest','desert','aquatic','ice','volcanic'])[
      ((v_state.stage-1)/10)%5+1];
    v_kind := CASE WHEN v_state.stage % 10=0 THEN 'boss' ELSE 'normal' END;
    IF v_kind='boss' THEN
      SELECT b.id,b.name,b.icon INTO STRICT v_boss_id,v_name,v_icon
        FROM public.bosses b WHERE b.is_world_event=false ORDER BY b.level,b.id
        OFFSET ((v_state.stage/10-1)%v_boss_count) LIMIT 1;
      v_enemy_resistances := '{}'::jsonb;
    ELSE
      SELECT c.name,c.icon,c.resistances INTO STRICT v_name,v_icon,v_enemy_resistances
        FROM app_private.adventure_enemy_catalog c
       WHERE c.biome=(ARRAY[0,4,1,5,3])[((v_state.stage-1)/10)%5+1] AND c.slot=(v_state.stage-1)%3;
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
  EXIT WHEN v_state.current_battle_id IS NULL OR v_battle.ends_at>v_now
    OR clock_timestamp() >= v_budget_started + interval '250 milliseconds';
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
  v_response_now := clock_timestamp();
  RETURN jsonb_build_object('stage',v_state.stage,'mode',v_state.adventure_mode,
    'advance_pending',v_state.advance_requested,
    'next_at',CASE WHEN v_battle.status='fighting' THEN greatest(v_response_now,v_battle.ends_at)
                   ELSE greatest(v_response_now,v_state.last_tick_at) END,
    'server_now',v_response_now,'last_result',v_state.last_result,'encounters',v_encounters,
    'boss',v_next_boss,'boss_wins_credited',v_boss_wins_credited,
    'gold_today',v_state.gold_today,'loot_today',v_state.loot_today,
    'reward_day',v_state.reward_day,
    'catchup',jsonb_build_object('battles',v_summary_battles,
       'from_stage',v_summary_from_stage,'to_stage',v_summary_to_stage,
       'wins',v_summary_wins,'defeats',v_summary_defeats,'draws',v_summary_draws,
       'retreats',v_summary_retreats,
       'gold',v_summary_gold,'items',v_summary_items,
       'defeated',v_summary_defeats>0,
       'pending',v_battle.status='fighting' AND v_battle.ends_at<=v_response_now),
    'battle',CASE WHEN v_battle.id IS NULL THEN NULL
                   ELSE app_private.adventure_battle_payload(v_battle,v_response_now) END,
    'last_battle',CASE WHEN v_last_battle.id IS NULL THEN NULL
                   ELSE app_private.adventure_battle_payload(v_last_battle,v_response_now) END,
    'limits',jsonb_build_object('interval_minutes',CASE
       WHEN v_battle.id IS NOT NULL AND v_battle.ends_at>v_battle.started_at
         THEN round(extract(epoch FROM v_battle.ends_at-v_battle.started_at)/60,4)
       WHEN v_last_battle.id IS NOT NULL AND v_last_battle.ends_at>v_last_battle.started_at
         THEN round(extract(epoch FROM v_last_battle.ends_at-v_last_battle.started_at)/60,4)
       ELSE 0.25 END,'reward_interval_minutes',30,'offline_hours',24,
       'gold_per_day',120,'items_per_day',2));
END;
$function$;
CREATE OR REPLACE FUNCTION public.buy_pet(p_pet_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pet public.pet_catalog%ROWTYPE;
  v_gold integer;
  v_boss_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO v_pet FROM public.pet_catalog WHERE pet_type=p_pet_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pet inválido.'; END IF;
  IF NOT app_private.has_boss_unlock(v_uid,v_pet.unlock_boss_id) THEN
    SELECT name INTO v_boss_name FROM public.bosses WHERE id=v_pet.unlock_boss_id;
    RAISE EXCEPTION 'Derrote % antes de chamar este companheiro.',
      coalesce(v_boss_name,'a criatura correspondente');
  END IF;
  -- The balance lock serializes two buys by the same owner.
  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id=v_uid FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.companions
             WHERE user_id=v_uid AND companion_type=p_pet_type) THEN
    RAISE EXCEPTION 'Você já possui este pet.';
  END IF;
  IF coalesce(v_gold,0) < v_pet.price THEN
    RAISE EXCEPTION 'Ouro insuficiente — custa % de ouro.',v_pet.price;
  END IF;
  UPDATE public.user_balance SET gold=gold-v_pet.price,updated_at=now()
    WHERE user_id=v_uid;
  INSERT INTO public.gold_history(user_id,type,amount,reason)
    VALUES(v_uid,'compra_pet',-v_pet.price,'Compra de pet: ' || v_pet.name);
  INSERT INTO public.companions
    (user_id,companion_type,companion_role,origin,name,atk,def,max_hp,current_hp,max_mp,current_mp)
  VALUES(v_uid,p_pet_type,v_pet.role,'shop',v_pet.name,v_pet.atk,v_pet.def,
         v_pet.hp,v_pet.hp,v_pet.mp,v_pet.mp);
  RETURN jsonb_build_object('ok',true,'pet',v_pet.name,'gold_spent',v_pet.price);
END;
$function$;
CREATE OR REPLACE FUNCTION public.purchase_game_item(p_item_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_item public.game_items%ROWTYPE;
  v_existing public.inventory_purchase_requests%ROWTYPE;
  v_gold integer;
  v_inserted uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_item_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_PURCHASE'; END IF;

  SELECT * INTO v_existing FROM public.inventory_purchase_requests
  WHERE user_id = v_user AND request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.item_id <> p_item_id THEN RAISE EXCEPTION 'PURCHASE_REQUEST_CONFLICT'; END IF;
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'price', v_existing.price);
  END IF;

  SELECT * INTO v_item FROM public.game_items WHERE id = p_item_id FOR SHARE;
  IF NOT FOUND OR v_item.shop_price IS NULL OR v_item.shop_price <= 0
     OR v_item.is_starter OR v_item.boss_drop_level IS NOT NULL
     OR v_item.category NOT IN ('weapon', 'armor', 'accessory', 'consumable') THEN
    RAISE EXCEPTION 'ITEM_NOT_FOR_SALE';
  END IF;

  INSERT INTO public.inventory_purchase_requests(user_id, request_id, item_id, price)
  VALUES (v_user, p_request_id, p_item_id, v_item.shop_price)
  ON CONFLICT (user_id, request_id) DO NOTHING RETURNING request_id INTO v_inserted;
  IF v_inserted IS NULL THEN
    SELECT * INTO v_existing FROM public.inventory_purchase_requests
    WHERE user_id = v_user AND request_id = p_request_id;
    IF v_existing.item_id <> p_item_id THEN RAISE EXCEPTION 'PURCHASE_REQUEST_CONFLICT'; END IF;
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'price', v_existing.price);
  END IF;

  INSERT INTO public.user_balance(user_id, balance_percent, gold)
  VALUES (v_user, 100, 100) ON CONFLICT (user_id) DO NOTHING;
  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id = v_user FOR UPDATE;
  IF v_gold IS NULL OR v_gold < v_item.shop_price THEN RAISE EXCEPTION 'INSUFFICIENT_GOLD'; END IF;

  IF NOT v_item.stackable AND EXISTS (
    SELECT 1 FROM public.user_inventory WHERE user_id = v_user AND item_id = p_item_id
  ) THEN RAISE EXCEPTION 'ITEM_ALREADY_OWNED'; END IF;

  UPDATE public.user_balance SET gold = gold - v_item.shop_price, updated_at = now()
  WHERE user_id = v_user;
  INSERT INTO public.user_inventory(user_id, item_id, quantity, equipped)
  VALUES (v_user, p_item_id, 1, false)
  ON CONFLICT (user_id, item_id) DO UPDATE
  SET quantity = public.user_inventory.quantity + 1
  WHERE v_item.stackable;
  IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_ALREADY_OWNED'; END IF;

  INSERT INTO public.gold_history(user_id, type, amount, reason)
  VALUES (v_user, 'compra_equipamento', -v_item.shop_price, 'Comprou ' || v_item.name);
  RETURN jsonb_build_object('ok', true, 'replayed', false, 'price', v_item.shop_price,
                            'gold', v_gold - v_item.shop_price);
END;
$function$;
REVOKE ALL ON FUNCTION public.purchase_game_item(uuid,uuid),
  public.buy_shop_item(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.purchase_game_item(uuid,uuid),
  public.buy_shop_item(uuid,date) TO authenticated;
