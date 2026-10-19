-- P13, applied after A12. Existing points and purchases are left untouched.
-- A level crossing owns exactly one point per five levels, in either direction.
DO $preflight$
DECLARE
  v_record record;
  v_attnums smallint[];
BEGIN
  IF to_regclass('private.mission_effect_receipts') IS NULL
     OR to_regprocedure('public.get_level_from_xp_v2(integer)') IS NULL
     OR md5(replace(pg_get_functiondef(
       'public.get_level_from_xp_v2(integer)'::regprocedure), E'\r\n', E'\n'))
       <> '94aa330f1f9e444fc96b6ffd6be48f8e'
     OR to_regprocedure('public.sync_talent_points_on_level_change()') IS NULL
     OR md5(replace(pg_get_functiondef(
       'public.sync_talent_points_on_level_change()'::regprocedure), E'\r\n', E'\n'))
       <> 'c4481ca3cd7dc1a149443dc4047e0cb8'
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger t
        WHERE t.tgrelid = 'public.profiles'::regclass
          AND t.tgname = 'sync_talent_points_on_level_change_trigger'
          AND t.tgenabled = 'O' AND NOT t.tgisinternal
          AND pg_get_triggerdef(t.oid) =
            'CREATE TRIGGER sync_talent_points_on_level_change_trigger BEFORE UPDATE OF level ON public.profiles FOR EACH ROW EXECUTE FUNCTION sync_talent_points_on_level_change()'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TALENT_LEVEL_SOURCE_DRIFT';
  END IF;

  -- The source schema has one immediate unique key on (owner, talent), and
  -- profiles.user_id is immediate unique. Deferred/changed keys invalidate
  -- the idempotency and row-lock reasoning below.
  FOR v_record IN SELECT * FROM (VALUES
    ('public.profiles'::regclass, 'profiles_user_id_key', 'u', ARRAY['user_id']::text[]),
    ('public.talentos_disponiveis'::regclass, 'talentos_disponiveis_pkey', 'p', ARRAY['id']::text[]),
    ('public.talentos_disponiveis'::regclass, 'talentos_disponiveis_nome_key', 'u', ARRAY['nome']::text[]),
    ('public.talentos_disponiveis'::regclass, 'talentos_disponiveis_efeito_key', 'u', ARRAY['efeito']::text[]),
    ('public.talentos_jogador'::regclass, 'talentos_jogador_pkey', 'p', ARRAY['id']::text[]),
    ('public.talentos_jogador'::regclass, 'talentos_jogador_personagem_id_talento_id_key',
       'u', ARRAY['personagem_id','talento_id']::text[])
  ) AS expected(rel, constraint_name, constraint_type, columns) LOOP
    SELECT array_agg(a.attnum ORDER BY x.ordinality)::smallint[] INTO v_attnums
      FROM unnest(v_record.columns) WITH ORDINALITY AS x(column_name, ordinality)
      JOIN pg_attribute a ON a.attrelid = v_record.rel
                         AND a.attname = x.column_name AND NOT a.attisdropped;
    IF cardinality(v_attnums) IS DISTINCT FROM cardinality(v_record.columns)
       OR NOT EXISTS (
         SELECT 1 FROM pg_constraint c JOIN pg_index i ON i.indexrelid = c.conindid
          WHERE c.conrelid = v_record.rel AND c.conname = v_record.constraint_name
            AND c.contype = v_record.constraint_type::"char"
            AND c.conkey = v_attnums
            AND NOT c.condeferrable AND NOT c.condeferred
            AND i.indisunique AND i.indimmediate AND i.indisvalid AND i.indisready
            AND i.indisprimary = (v_record.constraint_type = 'p')
       ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'TALENT_KEY_DRIFT: ' || v_record.constraint_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
      WHERE c.conrelid='public.talentos_jogador'::regclass
        AND c.conname='talentos_jogador_personagem_id_fkey' AND c.contype='f'
        AND c.confrelid='auth.users'::regclass AND c.confdeltype='c'
        AND NOT c.condeferrable AND NOT c.condeferred
        AND pg_get_constraintdef(c.oid)=
          'FOREIGN KEY (personagem_id) REFERENCES auth.users(id) ON DELETE CASCADE')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint c
      WHERE c.conrelid='public.talentos_jogador'::regclass
        AND c.conname='talentos_jogador_talento_id_fkey' AND c.contype='f'
        AND c.confrelid='public.talentos_disponiveis'::regclass AND c.confdeltype='c'
        AND NOT c.condeferrable AND NOT c.condeferred
        AND pg_get_constraintdef(c.oid)=
          'FOREIGN KEY (talento_id) REFERENCES talentos_disponiveis(id) ON DELETE CASCADE')
  THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='TALENT_FOREIGN_KEY_DRIFT';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.profiles'::regclass
      AND attname='pontos_talento' AND atttypid='integer'::regtype AND attnotnull)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d
          ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid='public.profiles'::regclass AND a.attname='pontos_talento'
          AND pg_get_expr(d.adbin,d.adrelid)='0')
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.talentos_jogador'::regclass
      AND attname='equipped' AND atttypid='boolean'::regtype AND attnotnull)
     OR (SELECT count(*) FROM pg_attribute a
          WHERE a.attrelid='public.talentos_disponiveis'::regclass
            AND a.attname IN ('id','nome','descricao','efeito','created_at')
            AND a.attnotnull AND NOT a.attisdropped) <> 5
     OR (SELECT count(*) FROM pg_attribute a
          WHERE a.attrelid='public.talentos_jogador'::regclass
            AND a.attname IN ('id','personagem_id','talento_id','created_at','equipped')
            AND a.attnotnull AND NOT a.attisdropped) <> 5
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.talentos_jogador'::regclass
      AND relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.talentos_disponiveis'::regclass
      AND relrowsecurity)
     OR NOT has_table_privilege('authenticated','public.profiles','UPDATE')
     OR NOT has_table_privilege('authenticated','public.talentos_disponiveis','SELECT')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='talentos_jogador' AND cmd='INSERT'
      AND policyname='Users can insert own talentos' AND roles=ARRAY['authenticated']::name[]
      AND with_check='(auth.uid() = personagem_id)')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='talentos_jogador' AND cmd='SELECT'
      AND policyname='Users can view own talentos' AND roles=ARRAY['authenticated']::name[]
      AND qual='(auth.uid() = personagem_id)') THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='TALENT_SCHEMA_OR_POLICY_DRIFT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles r
     WHERE (pg_has_role('authenticated',r.oid,'SET') AND r.rolname<>'authenticated')
        OR (pg_has_role('anon',r.oid,'SET') AND r.rolname<>'anon')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='TALENT_AUTHORITY_DRIFT';
  END IF;

  FOR v_record IN SELECT * FROM (VALUES
    ('public._complete_mission_daily(uuid,date,integer)', 'c3ab6baf14ef20b768d1292b8963b77a'),
    ('public._complete_mission_with_weekly(uuid,date)', 'cf92b52abf6ab1291d38bb7fabde1139')
  ) AS expected(signature, body_hash) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(v_record.signature)
        AND p.prokind='f' AND p.prosecdef
        AND p.proconfig=ARRAY['search_path=public']::text[]
        AND md5(replace(p.prosrc,E'\r\n',E'\n'))=v_record.body_hash
    ) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',
        MESSAGE='TALENT_HELPER_SOURCE_DRIFT: ' || v_record.signature;
    END IF;
  END LOOP;
END;
$preflight$;

-- Guard raw browser writes while retaining normal profile edits and auth
-- signup. Trusted SECURITY DEFINER progression and purchase code runs as its
-- owner, and can still modify the balance.
CREATE FUNCTION public._guard_talent_points_client_write()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $guard$
BEGIN
  IF current_user IN ('anon','authenticated') THEN
    IF (TG_OP = 'INSERT' AND NEW.pontos_talento <> 0)
       OR (TG_OP = 'UPDATE' AND NEW.pontos_talento IS DISTINCT FROM OLD.pontos_talento) THEN
      RAISE EXCEPTION USING ERRCODE='P0001',
        MESSAGE='TALENT_POINTS_SERVER_ONLY: pontos de talento sao alterados pelo servidor';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE EXECUTE ON FUNCTION public._guard_talent_points_client_write()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_talent_points_client_write
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._guard_talent_points_client_write();

CREATE OR REPLACE FUNCTION public.sync_talent_points_on_level_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $sync$
DECLARE
  v_delta integer := floor(coalesce(NEW.level,1) / 5.0)::integer
                     - floor(coalesce(OLD.level,1) / 5.0)::integer;
BEGIN
  IF v_delta < 0 AND NEW.pontos_talento < -v_delta THEN
    RAISE EXCEPTION USING ERRCODE='P0001',
      MESSAGE='TALENT_POINTS_SPENT: desfazer reduziria pontos de talento ja usados; reconcilie as compras antes de desfazer';
  END IF;
  NEW.pontos_talento := NEW.pontos_talento + v_delta;
  RETURN NEW;
END;
$sync$;
REVOKE EXECUTE ON FUNCTION public.sync_talent_points_on_level_change()
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.buy_talent(p_talent_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $buy$
DECLARE
  v_uid uuid := auth.uid();
  v_points integer;
  v_name text;
  v_row_id uuid;
  v_equipped_count integer;
  v_equipped boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='NOT_AUTHENTICATED';
  END IF;
  IF p_talent_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='TALENT_NOT_FOUND';
  END IF;
  SELECT p.pontos_talento INTO v_points FROM public.profiles p
   WHERE p.user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PROFILE_NOT_FOUND';
  END IF;
  SELECT tj.id, tj.equipped INTO v_row_id, v_equipped
    FROM public.talentos_jogador tj
   WHERE tj.personagem_id=v_uid AND tj.talento_id=p_talent_id;
  IF FOUND THEN
    RETURN jsonb_build_object('purchased',false,'already_owned',true,
      'talent_row_id',v_row_id,'equipped',v_equipped,'points',v_points);
  END IF;
  SELECT td.nome INTO v_name FROM public.talentos_disponiveis td
   WHERE td.id=p_talent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='TALENT_NOT_FOUND';
  END IF;
  IF v_points < 1 THEN
    RAISE EXCEPTION USING ERRCODE='P0001',
      MESSAGE='TALENT_POINTS_INSUFFICIENT: voce nao tem pontos de talento suficientes';
  END IF;
  SELECT count(*) INTO v_equipped_count FROM public.talentos_jogador tj
   WHERE tj.personagem_id=v_uid AND tj.equipped;
  v_equipped := v_equipped_count < 5;
  UPDATE public.profiles SET pontos_talento=pontos_talento-1 WHERE user_id=v_uid;
  INSERT INTO public.talentos_jogador(personagem_id,talento_id,equipped)
  VALUES(v_uid,p_talent_id,v_equipped) RETURNING id INTO v_row_id;
  INSERT INTO public.activity_log(user_id,action,description,xp_gained)
  VALUES(v_uid,'talent_bought','Talento adquirido: ' || v_name,0);
  RETURN jsonb_build_object('purchased',true,'already_owned',false,
    'talent_row_id',v_row_id,'equipped',v_equipped,'points',v_points-1);
END;
$buy$;
REVOKE ALL ON FUNCTION public.buy_talent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_talent(uuid) TO authenticated;

CREATE FUNCTION public.set_talent_equipped(p_talent_row_id uuid, p_equipped boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $equip$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_before boolean;
  v_equipped_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='NOT_AUTHENTICATED';
  END IF;
  IF p_talent_row_id IS NULL OR p_equipped IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='INVALID_TALENT_EQUIP_REQUEST';
  END IF;
  PERFORM 1 FROM public.profiles WHERE user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='PROFILE_NOT_FOUND';
  END IF;
  SELECT tj.personagem_id,tj.equipped INTO v_owner,v_before
    FROM public.talentos_jogador tj WHERE tj.id=p_talent_row_id FOR UPDATE;
  IF NOT FOUND OR v_owner <> v_uid THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='TALENT_NOT_OWNED';
  END IF;
  IF v_before IS DISTINCT FROM p_equipped THEN
    IF p_equipped THEN
      SELECT count(*) INTO v_equipped_count FROM public.talentos_jogador tj
       WHERE tj.personagem_id=v_uid AND tj.equipped;
      IF v_equipped_count >= 5 THEN
        RAISE EXCEPTION USING ERRCODE='P0001',
          MESSAGE='TALENT_EQUIP_LIMIT: limite de 5 talentos equipados atingido';
      END IF;
    END IF;
    UPDATE public.talentos_jogador SET equipped=p_equipped
     WHERE id=p_talent_row_id;
  END IF;
  RETURN jsonb_build_object('equipped',p_equipped,'changed',v_before IS DISTINCT FROM p_equipped);
END;
$equip$;
REVOKE ALL ON FUNCTION public.set_talent_equipped(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_talent_equipped(uuid,boolean) TO authenticated;

-- Policies keep reads; direct mutations of ownership and equipment stop here.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.talentos_jogador
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.talentos_disponiveis
  FROM PUBLIC, anon, authenticated;

-- The two observed dispatch helpers contain one talent read each. Keep their
-- original bodies, signatures, owner, ACL and all historical reward rows.
DO $equip_effects$
DECLARE
  v_signature text;
  v_source text;
  v_needle text := 'tj.personagem_id = v_uid;';
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public._complete_mission_daily(uuid,date,integer)',
    'public._complete_mission_with_weekly(uuid,date)'
  ] LOOP
    v_source := replace(pg_get_functiondef(to_regprocedure(v_signature)),E'\r\n',E'\n');
    IF (length(v_source)-length(replace(v_source,v_needle,''))) / length(v_needle) <> 1 THEN
      RAISE EXCEPTION USING ERRCODE='P0001',
        MESSAGE='TALENT_HELPER_READ_DRIFT: ' || v_signature;
    END IF;
    EXECUTE replace(v_source,v_needle,'tj.personagem_id = v_uid AND tj.equipped;');
  END LOOP;
END;
$equip_effects$;
