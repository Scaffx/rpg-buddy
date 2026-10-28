CREATE OR REPLACE FUNCTION app_private.adventure_simulate_v3(p_start timestamp with time zone, p_attack integer, p_defense integer, p_max_hp integer, p_max_mp integer, p_enemy_power integer, p_enemy_max_hp integer, p_skills jsonb, p_resistances jsonb, p_default_effect text, p_rotation integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$
