BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Frozen LF-normalized v4 definitions after 20261028214109. Fail closed on
-- source, owner, ACL, overload or battle-constraint drift before any rewrite.
DO $preflight$
DECLARE v_bad text;
BEGIN
  SELECT e.signature INTO v_bad FROM (VALUES
    ('app_private.sync_auto_adventure()', 'b2f065b8720f8a91f0d0d42262c87e06',true,'v','{postgres=X/postgres,authenticated=X/postgres}'),
    ('app_private.advance_auto_adventure(uuid)', '09c5c400405def35917f1c63e4f58ac8',true,'v','{postgres=X/postgres,authenticated=X/postgres}'),
    ('app_private.adventure_simulate_horde(timestamptz,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb)', '844a379887ad5f449406400b7116db85',false,'s','{postgres=X/postgres}'),
    ('app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb)', '0e3665739747473c4c8b96cf4a985425',false,'s','{postgres=X/postgres}'),
    ('app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer)', '0f5ed37992ae1f5d91c181ca2b93e2f7',false,'s','{postgres=X/postgres}'),
    ('app_private.adventure_battle_payload(app_private.adventure_battles,timestamptz)', 'e2ae788e646008bd792f7ca7bae12900',true,'s','{postgres=X/postgres}'),
    ('public.sync_auto_adventure()', '1879a24abc08fec402ea5d96f4a199c6',false,'v','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.advance_auto_adventure(uuid)', 'f71174f3366e61e0756fd00674c429ae',false,'v','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}')
  ) e(signature,body_md5,security_definer,volatility,acl)
  LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
  WHERE p.oid IS NULL
    OR md5(replace(pg_get_functiondef(p.oid),chr(13)||chr(10),chr(10)))<>e.body_md5
    OR p.proowner<>'postgres'::regrole OR p.prosecdef<>e.security_definer
    OR p.provolatile<>e.volatility::"char" OR p.proacl::text IS DISTINCT FROM e.acl
    OR p.proconfig<>ARRAY['search_path=""']::text[]
    OR has_function_privilege('anon',p.oid,'EXECUTE')
  LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'MAGE_AREA_SOURCE_OR_ACL_DRIFT: %',v_bad USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE (n.nspname,p.proname) IN (VALUES
        ('app_private','sync_auto_adventure'),('app_private','advance_auto_adventure'),
        ('app_private','adventure_simulate_horde'),('app_private','adventure_simulate_v3'),
        ('app_private','adventure_battle_payload'),('public','sync_auto_adventure'),
        ('public','advance_auto_adventure')))<>8
  THEN RAISE EXCEPTION 'MAGE_AREA_OVERLOAD_DRIFT' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_constraint k ON k.conrelid=c.oid
      WHERE n.nspname='app_private' AND c.relname='adventure_battles'
        AND c.relowner='postgres'::regrole AND c.relacl::text='{postgres=arwdDxtm/postgres}'
        AND c.relrowsecurity AND NOT c.relforcerowsecurity
        AND k.conname='adventure_battles_engine_version_check'
        AND pg_get_constraintdef(k.oid)=
          'CHECK ((engine_version = ANY (ARRAY[''v3''::text, ''v4_horde''::text])))')
  THEN RAISE EXCEPTION 'MAGE_AREA_BATTLE_CONSTRAINT_DRIFT' USING ERRCODE='22023'; END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION app_private.adventure_simulate_horde(
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
  v_hit_damage integer;
  v_hit_raw integer;
  v_hit_multiplier numeric;
  v_hits jsonb;
  v_target_slots jsonb;
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
    v_hits:='[]'::jsonb; v_target_slots:='[]'::jsonb;
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
        -- The only area casts are the three catalogued mage variants. Each
        -- living slot is resolved once at this cast's timestamp.
        FOR k IN 1..v_enemy_count LOOP
          IF v_hp[k]<=0 OR (k<>v_target AND NOT (
            coalesce(v_skill->>'target_mode','single')='all_enemies' AND
            v_skill->>'id' IN ('m_fogo_var','m_gelo_var','m_raio_var')
          )) THEN CONTINUE; END IF;
          v_enemy:=p_enemies->(k-1);
          v_hit_raw:=greatest(1,round(15+(p_attack-(v_enemy->>'power')::integer)*0.5)::integer);
          IF v_type IS NOT NULL THEN v_hit_raw:=v_hit_raw+round(v_power*0.35)::integer; END IF;
          v_hit_multiplier:=1;
          IF v_at_ms<=v_vulnerable_until[k] THEN
            v_hit_multiplier:=v_hit_multiplier+v_vulnerable[k];
          END IF;
          v_resistance:=coalesce((v_enemy->'resistances'->>v_effect)::numeric,1);
          v_hit_multiplier:=v_hit_multiplier*v_resistance;
          v_hit_damage:=least(v_hp[k],greatest(1,round(v_hit_raw*v_hit_multiplier)::integer));
          v_hp[k]:=v_hp[k]-v_hit_damage;
          v_damage:=v_damage+v_hit_damage;
          v_target_slots:=v_target_slots||jsonb_build_array(k-1);
          v_hits:=v_hits||jsonb_build_array(jsonb_build_object(
            'target_slot',k-1,'damage',v_hit_damage,'raw_damage',v_hit_raw,
            'damage_multiplier',v_hit_multiplier));
          IF k=v_target THEN v_raw:=v_hit_raw; v_multiplier:=v_hit_multiplier; END IF;
        END LOOP;
      ELSIF v_type='heal' THEN
        v_heal:=least(p_max_hp-v_hero_hp,v_power);
        v_hero_hp:=v_hero_hp+v_heal; v_note:='heal';
      ELSIF v_type='buff' THEN
        v_guard:=least(0.75,v_power::numeric/100); v_guard_hits:=1; v_note:='guard';
      ELSIF v_type NOT IN ('debuff','cc') THEN
        RAISE EXCEPTION 'unsupported horde skill' USING ERRCODE='22023';
      END IF;
      IF v_type IN ('debuff','cc') AND NOT coalesce((v_skill->>'strike')::boolean,false) THEN
        -- A hostile control action has a real selected slot but no HP damage.
        v_target_slots:=jsonb_build_array(v_target-1);
        v_hits:=jsonb_build_array(jsonb_build_object(
          'target_slot',v_target-1,'damage',0,'raw_damage',0,'damage_multiplier',1));
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
      'target_slot',CASE WHEN v_actor=0 AND (v_type IS NULL OR v_type NOT IN ('heal','buff'))
        THEN v_target-1 ELSE NULL END,
      'kind',CASE WHEN v_skill IS NOT NULL THEN 'skill' ELSE 'attack' END,
      'damage',v_damage,'hero_hp',v_hero_hp,'hero_mp',v_hero_mp,
      'enemy_hp',v_total,'enemy_mp',CASE WHEN v_actor=0 THEN v_mp[v_target] ELSE v_mp[v_actor] END,
      'enemies_hp',to_jsonb(v_hp[1:v_enemy_count]),
      'enemies_mp',to_jsonb(v_mp[1:v_enemy_count]),
      'mp_cost',v_cost,'skill_type',v_type,'healing',v_heal,
      'raw_damage',v_raw,'damage_multiplier',v_multiplier,'effect_note',v_note,
      'skill_id',v_skill->>'id','skill_name',v_skill->>'name','effect',v_effect)
      || CASE WHEN v_actor=0 THEN jsonb_build_object(
        'target_slots',v_target_slots,'hits',v_hits) ELSE '{}'::jsonb END);
    EXIT WHEN v_hero_hp=0 OR v_total=0;
  END LOOP;
  RETURN to_jsonb(v_events);
END $sim$;

-- Transform only an equipped, allocated mage base skill whose matching
-- variant is also allocated. The client profile selects base IDs only;
-- names, bonuses and area mode come from protected catalog rows.
CREATE FUNCTION pg_temp.mage_replace_once(p_source text,p_old text,p_new text)
RETURNS text LANGUAGE plpgsql AS $once$
BEGIN
  IF p_old='' OR (length(p_source)-length(replace(p_source,p_old,'')))<>length(p_old) THEN
    RAISE EXCEPTION 'MAGE_AREA_REPLACEMENT_DRIFT: %',left(p_old,100) USING ERRCODE='22023';
  END IF;
  RETURN replace(p_source,p_old,p_new);
END $once$;

DO $patch$
DECLARE v_source text;
BEGIN
  v_source:=pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure);
  v_source:=pg_temp.mage_replace_once(v_source,
    '  v_loadout_id text;',
    '  v_loadout_id text;
  v_variant_id text;
  v_variant_name text;
  v_variant_bonus numeric;
  v_target_mode text;');
  v_source:=pg_temp.mage_replace_once(v_source,
    '        IF v_skill_id IS NOT NULL AND NOT EXISTS (',
    '        v_target_mode:=''single'';
        IF v_class=''mago'' AND v_has_class AND v_skill_id IN
          (''m_bola_fogo'',''m_lanca_gelo'',''m_corrente_raio'',''m_estouro'') THEN
          SELECT n.id,n.name,least(100,greatest(0,coalesce((n.effect->>''bonus_pct'')::numeric,0)))
            INTO v_variant_id,v_variant_name,v_variant_bonus
            FROM public.player_skill_nodes ps JOIN public.skill_tree_nodes n ON n.id=ps.node_id
           WHERE ps.user_id=v_uid AND ps.rank>=1 AND n.tree=''mago''
             AND n.node_type=''variant'' AND n.effect->>''kind''=''variant''
             AND n.id=CASE v_skill_id
               WHEN ''m_bola_fogo'' THEN ''m_fogo_var''
               WHEN ''m_lanca_gelo'' THEN ''m_gelo_var''
               WHEN ''m_corrente_raio'' THEN ''m_raio_var''
               WHEN ''m_estouro'' THEN ''m_arc_var'' END
             AND coalesce((n.effect->>''aoe'')::boolean,false)=
               (n.id IN (''m_fogo_var'',''m_gelo_var'',''m_raio_var''))
           LIMIT 1;
          IF FOUND THEN
            v_skill_id:=v_variant_id; v_skill_name:=v_variant_name;
            v_skill_power:=least(200,round(v_skill_power*(1+v_variant_bonus/100))::integer);
            IF v_variant_id IN (''m_fogo_var'',''m_gelo_var'',''m_raio_var'') THEN
              v_target_mode:=''all_enemies'';
            END IF;
          END IF;
        END IF;
        IF v_skill_id IS NOT NULL AND NOT EXISTS (');
  v_source:=pg_temp.mage_replace_once(v_source,
    '''strike'',v_skill_id IN (''a_vetor'',''gt_furtivo'',''ferreiro_t1_pancada_atordoante'')))',
    '''strike'',v_skill_id IN (''a_vetor'',''gt_furtivo'',''ferreiro_t1_pancada_atordoante''),
            ''target_mode'',v_target_mode))');
  EXECUTE v_source;
END $patch$;

COMMIT;
