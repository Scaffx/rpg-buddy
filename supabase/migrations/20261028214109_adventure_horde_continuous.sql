BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Snapshot read-only da fonte viva em 28/10/2026. Normalizar LF antes do hash.
DO $preflight$
DECLARE v_bad text;
BEGIN
  SELECT e.signature INTO v_bad FROM (VALUES
    ('app_private.sync_auto_adventure()', '1641aa39afd52bcddae1998819c4b330', true, 'v', '{postgres=X/postgres,authenticated=X/postgres}', true, false),
    ('app_private.advance_auto_adventure(uuid)', '09c5c400405def35917f1c63e4f58ac8', true, 'v', '{postgres=X/postgres,authenticated=X/postgres}', true, false),
    ('app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb)', '0e3665739747473c4c8b96cf4a985425', false, 's', '{postgres=X/postgres}', false, false),
    ('app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer)', '0f5ed37992ae1f5d91c181ca2b93e2f7', false, 's', '{postgres=X/postgres}', false, false),
    ('app_private.adventure_battle_payload(app_private.adventure_battles,timestamptz)', '19652de586465e476978672744f83fd5', true, 's', '{postgres=X/postgres}', false, false),
    ('public.sync_auto_adventure()', '1879a24abc08fec402ea5d96f4a199c6', false, 'v', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}', true, true),
    ('public.advance_auto_adventure(uuid)', 'f71174f3366e61e0756fd00674c429ae', false, 'v', '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}', true, true)
  ) e(signature,body_md5,security_definer,volatility,acl,auth_execute,service_execute)
  LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
  WHERE p.oid IS NULL
    OR md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)))<>e.body_md5
    OR p.proowner<>'postgres'::regrole OR p.prosecdef<>e.security_definer
    OR p.provolatile<>e.volatility::"char" OR p.proacl::text IS DISTINCT FROM e.acl
    OR p.proconfig<>ARRAY['search_path=""']::text[]
    OR has_function_privilege('anon',p.oid,'EXECUTE')
    OR has_function_privilege('authenticated',p.oid,'EXECUTE') IS DISTINCT FROM e.auth_execute
    OR has_function_privilege('service_role',p.oid,'EXECUTE') IS DISTINCT FROM e.service_execute
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'HORDE_SOURCE_OR_ACL_DRIFT: %',v_bad USING ERRCODE='22023';
  END IF;
  IF to_regprocedure('app_private.adventure_simulate_horde(timestamptz,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb)') IS NOT NULL
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='app_private' AND p.proname='adventure_simulate_horde')
  THEN RAISE EXCEPTION 'HORDE_FUNCTION_DRIFT' USING ERRCODE='22023'; END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname,p.proname) IN (VALUES
      ('app_private','sync_auto_adventure'),('app_private','advance_auto_adventure'),
      ('app_private','adventure_simulate_v3'),('app_private','adventure_battle_payload'),
      ('public','sync_auto_adventure'),('public','advance_auto_adventure')))<>7
  THEN RAISE EXCEPTION 'HORDE_OVERLOAD_DRIFT' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_constraint k ON k.conrelid=c.oid
      WHERE n.nspname='app_private' AND c.relname='adventure_battles'
        AND c.relowner='postgres'::regrole AND c.relacl::text='{postgres=arwdDxtm/postgres}'
        AND c.relrowsecurity AND NOT c.relforcerowsecurity
        AND k.conname='adventure_battles_engine_version_check'
        AND pg_get_constraintdef(k.oid)='CHECK ((engine_version = ''v3''::text))')
  THEN RAISE EXCEPTION 'HORDE_BATTLE_CONSTRAINT_DRIFT' USING ERRCODE='22023'; END IF;
END $preflight$;

ALTER TABLE app_private.adventure_battles
  DROP CONSTRAINT adventure_battles_engine_version_check,
  ADD CONSTRAINT adventure_battles_engine_version_check
  CHECK (engine_version IN ('v3','v4_horde'));

-- Simulação fechada no servidor: quatro relógios, três barras de HP/MP e
-- cooldowns independentes. O relogio de 15 min termina em empate; os
-- quatro relogios geram no maximo 1134 acoes ate 900 s, abaixo de 1200.
-- O array evita concatenacao JSONB quadratica e vira JSONB uma vez ao final.
CREATE FUNCTION app_private.adventure_simulate_horde(
  p_start timestamptz, p_attack integer, p_defense integer,
  p_max_hp integer, p_max_mp integer, p_enemies jsonb, p_skills jsonb,
  p_default_effect text, p_rotation integer, p_sustain jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $sim$
DECLARE
  v_events jsonb[]:=ARRAY[]::jsonb[];
  v_hp integer[]:=ARRAY[0,0,0];
  v_mp integer[]:=ARRAY[0,0,0];
  v_due integer[]:=ARRAY[800,1200,1700];
  v_period integer[]:=ARRAY[2900,3400,3800];
  v_cd integer[]:=ARRAY[0,0,0];
  v_stun_until integer[]:=ARRAY[0,0,0];
  v_vulnerable_until integer[]:=ARRAY[0,0,0];
  v_vulnerable numeric[]:=ARRAY[0,0,0];
  v_hero_due integer:=1500;
  v_hero_period integer:=2800;
  v_hero_hp integer:=p_max_hp;
  v_hero_mp integer:=p_max_mp;
  v_hero_cd jsonb:='{}'::jsonb;
  v_next integer:=0;
  v_count integer;
  v_enemy_count integer;
  v_actor integer;
  v_target integer;
  v_at_ms integer;
  v_skill jsonb;
  v_type text;
  v_effect text;
  v_cost integer;
  v_power integer;
  v_raw integer;
  v_damage integer;
  v_heal integer;
  v_multiplier numeric;
  v_guard numeric:=0;
  v_guard_hits integer:=0;
  v_note text;
  v_total integer;
  v_enemy jsonb;
  v_enemy_skill jsonb;
  v_resistance numeric;
BEGIN
  IF p_attack<1 OR p_defense<0 OR p_max_hp<1 OR p_max_mp<0
     OR jsonb_typeof(p_enemies)<>'array' OR jsonb_array_length(p_enemies) NOT IN (1,3)
     OR jsonb_typeof(p_skills)<>'array'
     OR p_default_effect NOT IN ('physical','arcane','fire','ice','lightning','nature','light')
     OR p_rotation<0 THEN
    RAISE EXCEPTION 'invalid horde snapshot' USING ERRCODE='22023';
  END IF;
  v_count:=jsonb_array_length(p_skills);
  v_enemy_count:=jsonb_array_length(p_enemies);
  IF v_count>0 THEN v_next:=p_rotation%v_count; END IF;
  FOR i IN 1..v_enemy_count LOOP
    v_enemy:=p_enemies->(i-1);
    IF (v_enemy->>'slot')::integer<>i-1 OR (v_enemy->>'max_hp')::integer<1
      OR (v_enemy->>'power')::integer<1 OR (v_enemy->>'max_mp')::integer<0
      OR jsonb_typeof(v_enemy->'resistances')<>'object'
    THEN RAISE EXCEPTION 'invalid horde enemy' USING ERRCODE='22023'; END IF;
    v_hp[i]:=(v_enemy->>'max_hp')::integer;
    v_mp[i]:=(v_enemy->>'max_mp')::integer;
  END LOOP;
  FOR step IN 1..1200 LOOP
    v_at_ms:=v_hero_due;
    v_actor:=0;
    FOR i IN 1..v_enemy_count LOOP
      IF v_hp[i]>0 AND v_due[i]<v_at_ms THEN
        v_at_ms:=v_due[i]; v_actor:=i;
      END IF;
    END LOOP;
    IF v_at_ms>900000 THEN EXIT; END IF;
    v_skill:=NULL; v_type:=NULL; v_cost:=0; v_raw:=0;
    v_damage:=0; v_heal:=0; v_multiplier:=1; v_note:=NULL;
    v_target:=NULL;
    IF v_actor=0 THEN
      v_hero_due:=v_hero_due+v_hero_period;
      FOR i IN 1..v_enemy_count LOOP
        IF v_hp[i]>0 THEN v_target:=i; EXIT; END IF;
      END LOOP;
      IF v_target IS NULL THEN EXIT; END IF;
      v_enemy:=p_enemies->(v_target-1);
      v_effect:=p_default_effect;
      FOR j IN 0..v_count-1 LOOP
        v_skill:=p_skills->((v_next+j)%v_count);
        v_cost:=(v_skill->>'mp_cost')::integer;
        IF p_sustain->>'kind'='mp_cost' THEN
          v_cost:=greatest(0,round(v_cost*(1-(p_sustain->>'pct')::numeric))::integer);
        END IF;
        IF v_cost<=v_hero_mp
          AND v_at_ms>=coalesce((v_hero_cd->>(v_skill->>'id'))::integer,0)
          AND (v_skill->>'type'<>'heal' OR v_hero_hp<p_max_hp)
          AND (v_skill->>'type'<>'buff' OR v_guard_hits=0) THEN
          v_type:=v_skill->>'type';
          v_next:=((v_next+j)%v_count+1)%v_count;
          EXIT;
        END IF;
        v_skill:=NULL;
      END LOOP;
      IF v_skill IS NOT NULL THEN
        v_hero_mp:=v_hero_mp-v_cost;
        v_hero_cd:=jsonb_set(v_hero_cd,ARRAY[v_skill->>'id'],
          to_jsonb(v_at_ms+((v_skill->>'cooldown')::integer+1)*v_hero_period));
        v_effect:=v_skill->>'effect';
        v_power:=(v_skill->>'power')::integer;
      ELSE
        v_cost:=0;
        v_hero_mp:=least(p_max_mp,v_hero_mp+2);
      END IF;
      IF v_type IS NULL OR v_type='dano'
         OR (v_type IN ('debuff','cc') AND coalesce((v_skill->>'strike')::boolean,false)) THEN
        v_raw:=greatest(1,round(15+(p_attack-(v_enemy->>'power')::integer)*0.5)::integer);
        IF v_type IS NOT NULL THEN v_raw:=v_raw+round(v_power*0.35)::integer; END IF;
        IF v_at_ms<=v_vulnerable_until[v_target] THEN
          v_multiplier:=v_multiplier+v_vulnerable[v_target];
        END IF;
        v_resistance:=coalesce((v_enemy->'resistances'->>v_effect)::numeric,1);
        v_multiplier:=v_multiplier*v_resistance;
        v_damage:=least(v_hp[v_target],greatest(1,round(v_raw*v_multiplier)::integer));
        v_hp[v_target]:=v_hp[v_target]-v_damage;
      ELSIF v_type='heal' THEN
        v_heal:=least(p_max_hp-v_hero_hp,v_power);
        v_hero_hp:=v_hero_hp+v_heal; v_note:='heal';
      ELSIF v_type='buff' THEN
        v_guard:=least(0.75,v_power::numeric/100); v_guard_hits:=1; v_note:='guard';
      ELSIF v_type NOT IN ('debuff','cc') THEN
        RAISE EXCEPTION 'unsupported horde skill' USING ERRCODE='22023';
      END IF;
      IF v_type='debuff' THEN
        v_vulnerable[v_target]:=least(0.6,v_power::numeric/200);
        v_vulnerable_until[v_target]:=v_at_ms+2*v_hero_period;
        v_note:='vulnerable';
      ELSIF v_type='cc' THEN
        v_stun_until[v_target]:=v_at_ms+v_period[v_target];
        v_note:='stunned';
      END IF;
      IF v_hero_hp>0 AND v_hp[1]+v_hp[2]+v_hp[3]>0 THEN
        IF p_sustain->>'kind'='regen_hp' THEN
          v_hero_hp:=least(p_max_hp,v_hero_hp+
            round(p_max_hp*(p_sustain->>'pct')::numeric)::integer);
        ELSIF p_sustain->>'kind'='regen_mp' THEN
          v_hero_mp:=least(p_max_mp,v_hero_mp+
            round(p_max_mp*(p_sustain->>'pct')::numeric)::integer);
        END IF;
      END IF;
    ELSE
      v_target:=NULL;
      v_enemy:=p_enemies->(v_actor-1);
      v_enemy_skill:=v_enemy->'skill';
      v_due[v_actor]:=v_due[v_actor]+v_period[v_actor];
      v_effect:='physical';
      IF v_at_ms<=v_stun_until[v_actor] THEN
        v_note:='stunned'; v_multiplier:=0;
      ELSE
        IF jsonb_typeof(v_enemy_skill)='object'
          AND v_mp[v_actor]>=(v_enemy_skill->>'mp_cost')::integer
          AND v_at_ms>=v_cd[v_actor] THEN
          v_skill:=v_enemy_skill; v_type:='dano';
          v_cost:=(v_skill->>'mp_cost')::integer;
          v_mp[v_actor]:=v_mp[v_actor]-v_cost;
          v_cd[v_actor]:=v_at_ms+(v_skill->>'cooldown_ms')::integer;
          v_effect:=v_skill->>'effect';
          v_power:=(v_skill->>'power')::integer;
        ELSE
          v_mp[v_actor]:=least((v_enemy->>'max_mp')::integer,v_mp[v_actor]+2);
        END IF;
        v_raw:=greatest(1,round((9+((v_enemy->>'power')::integer-p_defense)*0.5)
          /v_enemy_count)::integer);
        IF v_type IS NOT NULL THEN v_raw:=v_raw+round(v_power*0.25)::integer; END IF;
        IF v_guard_hits>0 THEN
          v_multiplier:=1-v_guard; v_guard_hits:=v_guard_hits-1;
        END IF;
        v_damage:=least(v_hero_hp,greatest(1,round(v_raw*v_multiplier)::integer));
        v_hero_hp:=v_hero_hp-v_damage;
      END IF;
    END IF;
    v_total:=v_hp[1]+v_hp[2]+v_hp[3];
    v_events:=array_append(v_events,jsonb_build_object(
      'at',p_start+v_at_ms*interval '1 millisecond',
      'actor',CASE WHEN v_actor=0 THEN 'hero' ELSE 'enemy' END,
      'actor_slot',CASE WHEN v_actor=0 THEN NULL ELSE v_actor-1 END,
      'target_slot',CASE WHEN v_actor=0 THEN v_target-1 ELSE NULL END,
      'kind',CASE WHEN v_skill IS NOT NULL THEN 'skill' ELSE 'attack' END,
      'damage',v_damage,'hero_hp',v_hero_hp,'hero_mp',v_hero_mp,
      'enemy_hp',v_total,'enemy_mp',CASE WHEN v_actor=0 THEN v_mp[v_target] ELSE v_mp[v_actor] END,
      'enemies_hp',to_jsonb(v_hp[1:v_enemy_count]),
      'enemies_mp',to_jsonb(v_mp[1:v_enemy_count]),
      'mp_cost',v_cost,'skill_type',v_type,'healing',v_heal,
      'raw_damage',v_raw,'damage_multiplier',v_multiplier,'effect_note',v_note,
      'skill_id',v_skill->>'id','skill_name',v_skill->>'name','effect',v_effect));
    EXIT WHEN v_hero_hp=0 OR v_total=0;
  END LOOP;
  RETURN to_jsonb(v_events);
END $sim$;
REVOKE ALL ON FUNCTION app_private.adventure_simulate_horde(
  timestamptz,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;

-- Cirurgia da fonte viva apenas após hash/ACL aprovados. Cada substituição
-- exige ocorrência única; qualquer drift aborta a transação inteira.
CREATE FUNCTION pg_temp.horde_replace_once(p_source text,p_old text,p_new text)
RETURNS text LANGUAGE plpgsql AS $once$
DECLARE v_old text:=replace(p_old,chr(13)||chr(10),chr(10));
  v_new text:=replace(p_new,chr(13)||chr(10),chr(10));
BEGIN
  IF v_old='' OR (length(p_source)-length(replace(p_source,v_old,'')))<>length(v_old) THEN
    RAISE EXCEPTION 'HORDE_REPLACEMENT_DRIFT: %',left(v_old,100) USING ERRCODE='22023';
  END IF;
  RETURN replace(p_source,v_old,v_new);
END $once$;

DO $patch$
DECLARE v_source text;
BEGIN
  v_source:=pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure);
  v_source:=pg_temp.horde_replace_once(v_source,
    '  v_pet jsonb;', '  v_pet jsonb;
  v_enemies jsonb;
  v_add_name text;
  v_add_icon text;
  v_add_resistances jsonb;');
  v_source:=pg_temp.horde_replace_once(v_source,
    'ELSIF v_battle.engine_version=''v3''',
    'ELSIF v_battle.engine_version IN (''v3'',''v4_horde'')');
  v_source:=pg_temp.horde_replace_once(v_source,
    '''end_reason'',CASE WHEN v_battle.status=''draw'' THEN ''turn_limit'' ELSE NULL END',
    '''end_reason'',CASE WHEN v_battle.status=''draw'' THEN
      CASE WHEN v_battle.engine_version=''v4_horde'' THEN ''event_limit'' ELSE ''turn_limit'' END
      ELSE NULL END');
  v_source:=pg_temp.horde_replace_once(v_source,
    'IF v_prior.id IS NOT NULL AND v_start < v_now-interval ''30 seconds'' THEN',
    'IF v_prior.id IS NOT NULL AND v_prior.hero_attack IS NOT NULL
      AND v_start < v_now-interval ''30 seconds'' THEN');
  v_source:=pg_temp.horde_replace_once(v_source,
    'v_engine_version := v_prior.engine_version;', 'v_engine_version := ''v4_horde'';');
  v_source:=pg_temp.horde_replace_once(v_source,
    'v_engine_version := ''v3'';', 'v_engine_version := ''v4_horde'';');
  v_source:=pg_temp.horde_replace_once(v_source,
    'IF v_engine_version=''v3'' AND v_name=''Asa de brasa'' THEN',
    'IF v_engine_version=''v4_horde'' AND v_name=''Asa de brasa'' THEN');
  v_source:=pg_temp.horde_replace_once(v_source,
    '    v_enemy_hp := v_enemy_max;
    IF v_engine_version=''v3'' THEN',
    '    v_enemy_hp := v_enemy_max;
    v_enemies:=''[]''::jsonb;
    FOR j IN 0..CASE WHEN v_kind=''boss'' THEN 0 ELSE 2 END LOOP
      IF v_kind=''boss'' AND j=0 THEN
        v_add_name:=v_name; v_add_icon:=v_icon; v_add_resistances:=v_enemy_resistances;
      ELSE
        SELECT c.name,c.icon,c.resistances
          INTO STRICT v_add_name,v_add_icon,v_add_resistances
          FROM app_private.adventure_enemy_catalog c
          WHERE c.biome=(ARRAY[0,4,1,5,3])[((v_state.stage-1)/10)%5+1]
            AND c.slot=((v_state.stage-1+j)%3);
        IF v_add_name=''Asa de brasa'' THEN
          v_add_resistances:=jsonb_build_object(''fire'',
            coalesce((v_rules_snapshot->>''asa_fire_multiplier'')::numeric,0.5));
        END IF;
      END IF;
      v_enemies:=v_enemies||jsonb_build_array(jsonb_build_object(
        ''slot'',j,''id'',v_state.stage::text||''-''||j::text,
        ''name'',v_add_name,''icon'',v_add_icon,
        ''boss_id'',CASE WHEN v_kind=''boss'' AND j=0 THEN v_boss_id ELSE NULL END,
        ''power'',v_enemy,
        ''max_hp'',CASE WHEN v_kind=''boss'' THEN 150 ELSE 34 END,
        ''max_mp'',0,''resistances'',coalesce(v_add_resistances,''{}''::jsonb),
        ''skill'',NULL));
    END LOOP;
    v_enemy_max:=CASE WHEN v_kind=''boss'' THEN 150 ELSE 102 END;
    v_enemy_hp:=v_enemy_max;
    v_rules_snapshot:=v_rules_snapshot||jsonb_build_object(''version'',''v4_horde'',
      ''enemies'',v_enemies);
    IF v_engine_version=''v4_horde'' THEN');
  v_source:=pg_temp.horde_replace_once(v_source,
    'IF v_engine_version=''v3'' THEN', 'IF v_engine_version=''v4_horde'' THEN');
  v_source:=pg_temp.horde_replace_once(v_source,
    'v_events := app_private.adventure_simulate_v3(v_start,v_hero_attack,v_hero_defense,
        v_hero_max,v_hero_max_mp,v_enemy,v_enemy_max,v_skills,v_enemy_resistances,
        v_default_effect,v_state.skill_rotation,v_rules_snapshot->''pet''->''sustain'');',
    'v_events := app_private.adventure_simulate_horde(v_start,v_hero_attack,v_hero_defense,
        v_hero_max,v_hero_max_mp,v_enemies,v_skills,v_default_effect,
        v_state.skill_rotation,v_rules_snapshot->''pet''->''sustain'');');
  v_source:=pg_temp.horde_replace_once(v_source,
    'CASE WHEN v_engine_version=''v3'' THEN v_enemy_resistances ELSE NULL END',
    'CASE WHEN v_engine_version=''v4_horde'' THEN v_enemy_resistances ELSE NULL END');
  EXECUTE v_source;

  v_source:=pg_get_functiondef('app_private.adventure_battle_payload(app_private.adventure_battles,timestamptz)'::regprocedure);
  v_source:=pg_temp.horde_replace_once(v_source,
    'p_battle.engine_version=''v3''',
    'p_battle.engine_version IN (''v3'',''v4_horde'')');
  v_source:=pg_temp.horde_replace_once(v_source,
    '''end_reason'',CASE WHEN p_battle.status=''draw'' THEN ''turn_limit'' ELSE NULL END',
    '''end_reason'',CASE WHEN p_battle.status=''draw'' THEN
        CASE WHEN p_battle.engine_version=''v4_horde'' THEN ''event_limit'' ELSE ''turn_limit'' END
        ELSE NULL END');
  v_source:=pg_temp.horde_replace_once(v_source,
    'ELSE jsonb_build_object(''pet'',NULL) END;',
    'ELSE jsonb_build_object(''pet'',NULL) END
      || CASE WHEN p_battle.engine_version=''v4_horde'' THEN
        jsonb_build_object(''enemies'',(SELECT jsonb_agg(enemy || jsonb_build_object(
          ''hp'',coalesce((SELECT (event->''enemies_hp''->>(enemy->>''slot'')::integer)::integer
            FROM jsonb_array_elements(p_battle.events) WITH ORDINALITY x(event,ord)
            WHERE (event->>''at'')::timestamptz<=p_now ORDER BY ord DESC LIMIT 1),
            (enemy->>''max_hp'')::integer),
          ''mp'',coalesce((SELECT (event->''enemies_mp''->>(enemy->>''slot'')::integer)::integer
            FROM jsonb_array_elements(p_battle.events) WITH ORDINALITY x(event,ord)
            WHERE (event->>''at'')::timestamptz<=p_now ORDER BY ord DESC LIMIT 1),
            (enemy->>''max_mp'')::integer)) ORDER BY (enemy->>''slot'')::integer)
          FROM jsonb_array_elements(p_battle.rules_snapshot->''enemies'') enemy))
        ELSE ''{}''::jsonb END;');
  EXECUTE v_source;
END $patch$;

COMMIT;
