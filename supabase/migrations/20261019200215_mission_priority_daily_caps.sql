-- Reforma 19/10: agenda e recompensa de prioridade. Aplicar depois das RPCs de
-- progressao da mesma reforma; a substituicao abaixo preserva o restante delas.
-- PostgreSQL 16+ (pg_input_is_valid) evita casts acidentais de datas malformadas.
DO $$
DECLARE v_sig text; v_def text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public._complete_mission_daily(uuid,date,integer)',
    'public._complete_mission_with_weekly(uuid,date)'
  ] LOOP
    SELECT pg_catalog.pg_get_functiondef(v_sig::regprocedure) INTO v_def;
    IF v_def !~ 'WHEN\s+''alta''\s+THEN\s+1\.5' OR
       v_def !~ 'WHEN\s+''baixa''\s+THEN\s+0\.7' THEN
      RAISE EXCEPTION 'MISSION_PRIORITY_RPC_DRIFT: %', v_sig;
    END IF;
  END LOOP;
END;
$$;

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.mission_priority_paid_days (
  user_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  priority text NOT NULL CHECK (priority IN ('alta', 'media')),
  day date NOT NULL,
  PRIMARY KEY (user_id, mission_id, priority, day)
);
ALTER TABLE private.mission_priority_paid_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.mission_priority_paid_days FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.mission_priority_key(p_priority text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE lower(COALESCE(p_priority, 'media'))
    WHEN 'alta' THEN 'alta' WHEN 'baixa' THEN 'baixa' ELSE 'media' END;
$$;
REVOKE ALL ON FUNCTION private.mission_priority_key(text) FROM PUBLIC, anon, authenticated;

-- Antes do trigger, preservar conclusoes ainda presentes no legado. Nao cria
-- exclusao retroativa nem tenta reconstruir missoes ja apagadas.
INSERT INTO private.mission_priority_paid_days (user_id, mission_id, priority, day)
SELECT m.user_id, m.id, private.mission_priority_key(m.priority), d.key::date
FROM public.missions m
CROSS JOIN LATERAL jsonb_each_text(COALESCE(m.daily_status, '{}'::jsonb)) d
WHERE private.mission_priority_key(m.priority) IN ('alta', 'media')
  AND d.value = 'completed'
  AND d.key ~ '^\d{4}-\d{2}-\d{2}$'
  AND pg_catalog.pg_input_is_valid(d.key, 'date')
ON CONFLICT DO NOTHING;

INSERT INTO private.mission_priority_paid_days (user_id, mission_id, priority, day)
SELECT m.user_id, m.id, private.mission_priority_key(m.priority), m.due_date
FROM public.missions m
WHERE private.mission_priority_key(m.priority) IN ('alta', 'media')
  AND m.completed AND m.due_date IS NOT NULL
ON CONFLICT DO NOTHING;

-- A base futura e 25 para todas as prioridades, inclusive missoes legadas
-- com xp_reward arbitrario. Nao altera perfis, ledgers nem XP ja creditado.
UPDATE public.missions SET xp_reward = 25 WHERE xp_reward IS DISTINCT FROM 25;

CREATE OR REPLACE FUNCTION private.mission_priority_occurs_on(m public.missions, p_day date)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN m.frequency_type = 'weekly' THEN true
    WHEN pg_catalog.jsonb_typeof(m.days_of_week) = 'array'
      AND pg_catalog.jsonb_array_length(m.days_of_week) > 0 THEN EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements_text(m.days_of_week) d(value)
      WHERE lower(replace(d.value, 'á', 'a')) =
        (ARRAY['dom','seg','ter','qua','qui','sex','sab'])[(extract(dow FROM p_day)::int + 1)]
    )
    ELSE m.due_date = p_day
  END;
$$;
REVOKE ALL ON FUNCTION private.mission_priority_occurs_on(public.missions, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.enforce_mission_priority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_row public.missions;
  v_priority text;
  v_cap integer;
  v_day date;
  v_dow integer;
  v_count integer;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_recurring boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
    IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'MISSION_OWNER_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
    IF auth.uid() IS NOT NULL AND auth.uid() <> NEW.user_id THEN
      RAISE EXCEPTION 'MISSION_OWNER_MISMATCH' USING ERRCODE = '42501';
    END IF;
    -- Toda recompensa futura usa a mesma base, inclusive payload privilegiado.
    NEW.xp_reward := 25;
    v_row := NEW;
  END IF;

  -- Todas as mutacoes do mesmo usuario observam a mesma fila, inclusive
  -- criacao concorrente por Data API, reclassificacao, pausa e exclusao.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_row.user_id::text), 20261019);

  IF TG_OP IN ('UPDATE', 'DELETE') AND private.mission_priority_key(OLD.priority) IN ('alta', 'media') THEN
    INSERT INTO private.mission_priority_paid_days (user_id, mission_id, priority, day)
    SELECT OLD.user_id, OLD.id, private.mission_priority_key(OLD.priority), d.key::date
    FROM pg_catalog.jsonb_each_text(COALESCE(OLD.daily_status, '{}'::jsonb)) d
    WHERE d.value = 'completed' AND d.key ~ '^\d{4}-\d{2}-\d{2}$'
      AND pg_catalog.pg_input_is_valid(d.key, 'date')
    ON CONFLICT DO NOTHING;
    IF OLD.completed AND OLD.due_date IS NOT NULL THEN
      INSERT INTO private.mission_priority_paid_days VALUES (OLD.user_id, OLD.id, private.mission_priority_key(OLD.priority), OLD.due_date)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  -- Alteracoes de estado/schedule sobre legado excedente nao apagam dados.
  -- Edicao de texto, conclusao e pausa sem mudar vaga seguem normalmente.
  IF TG_OP = 'INSERT' OR
     (TG_OP = 'UPDATE' AND (
       NEW.priority IS DISTINCT FROM OLD.priority OR
       NEW.days_of_week IS DISTINCT FROM OLD.days_of_week OR
       NEW.due_date IS DISTINCT FROM OLD.due_date OR
       NEW.frequency_type IS DISTINCT FROM OLD.frequency_type OR
       (OLD.completed AND NOT NEW.completed) OR
       (OLD.status = 'arquivada' AND NEW.status <> 'arquivada')
     )) THEN
    v_priority := private.mission_priority_key(NEW.priority);
    IF v_priority IN ('alta', 'media') AND NOT NEW.completed
       AND COALESCE(NEW.status, '') <> 'arquivada' THEN
      v_cap := CASE v_priority WHEN 'alta' THEN 4 ELSE 8 END;
      IF NEW.frequency_type NOT IN ('daily', 'weekly') OR
         NEW.frequency_type <> 'weekly' AND
         (NEW.days_of_week IS NULL OR pg_catalog.jsonb_typeof(NEW.days_of_week) <> 'array') THEN
        RAISE EXCEPTION 'MISSION_SCHEDULE_INVALID' USING ERRCODE = '23514';
      END IF;
      IF NEW.frequency_type = 'daily' AND EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_array_elements_text(NEW.days_of_week) d(value)
        WHERE lower(replace(d.value, 'á', 'a')) NOT IN
          ('dom','seg','ter','qua','qui','sex','sab')
      ) THEN
        RAISE EXCEPTION 'MISSION_SCHEDULE_INVALID' USING ERRCODE = '23514';
      END IF;
      v_recurring := NEW.frequency_type = 'weekly' OR
        COALESCE(pg_catalog.jsonb_array_length(COALESCE(NEW.days_of_week, '[]'::jsonb)), 0) > 0;
      IF NOT v_recurring AND NEW.due_date IS NULL THEN
        RAISE EXCEPTION 'MISSION_SCHEDULE_INVALID' USING ERRCODE = '23514';
      END IF;

      IF v_recurring THEN
        FOR v_dow IN 0..6 LOOP
          v_day := v_today + ((v_dow - extract(dow FROM v_today)::int + 7) % 7);
          IF private.mission_priority_occurs_on(NEW, v_day) THEN
            SELECT count(*) INTO v_count FROM public.missions m
            WHERE m.user_id = NEW.user_id AND m.id <> NEW.id
              AND private.mission_priority_key(m.priority) = v_priority
              AND NOT m.completed AND COALESCE(m.status, '') <> 'arquivada'
              AND (m.frequency_type = 'weekly' OR
                   COALESCE(pg_catalog.jsonb_array_length(COALESCE(m.days_of_week, '[]'::jsonb)), 0) > 0)
              AND private.mission_priority_occurs_on(m, v_day);
            IF v_count >= v_cap THEN
              RAISE EXCEPTION 'MISSION_PRIORITY_CAP:%:%:%', v_priority, v_day, v_cap USING ERRCODE = '23514';
            END IF;
          END IF;
        END LOOP;
      END IF;

      -- Datas unicas e dias ja pagos so concorrem na data exata. Ontem e
      -- incluido para a janela D-1; historico anterior nao bloqueia o futuro.
      FOR v_day IN
        SELECT NEW.due_date WHERE NOT v_recurring
        UNION
        SELECT m.due_date FROM public.missions m
        WHERE v_recurring AND m.user_id = NEW.user_id AND m.due_date >= v_today - 1
          AND m.due_date IS NOT NULL AND m.frequency_type <> 'weekly'
          AND COALESCE(pg_catalog.jsonb_array_length(COALESCE(m.days_of_week, '[]'::jsonb)), 0) = 0
        UNION
        SELECT p.day FROM private.mission_priority_paid_days p
        WHERE v_recurring AND p.user_id = NEW.user_id AND p.day >= v_today - 1
        UNION SELECT v_today WHERE v_recurring
        UNION SELECT v_today - 1 WHERE v_recurring
      LOOP
        IF v_day IS NULL OR NOT private.mission_priority_occurs_on(NEW, v_day) THEN CONTINUE; END IF;
        SELECT count(DISTINCT slot.mission_id) INTO v_count FROM (
          SELECT m.id AS mission_id FROM public.missions m
          WHERE m.user_id = NEW.user_id AND m.id <> NEW.id
            AND private.mission_priority_key(m.priority) = v_priority
            AND NOT m.completed AND COALESCE(m.status, '') <> 'arquivada'
            AND private.mission_priority_occurs_on(m, v_day)
          UNION ALL
          SELECT p.mission_id FROM private.mission_priority_paid_days p
          WHERE p.user_id = NEW.user_id AND p.mission_id <> NEW.id
            AND p.priority = v_priority AND p.day = v_day
        ) slot;
        IF v_count >= v_cap THEN
          RAISE EXCEPTION 'MISSION_PRIORITY_CAP:%:%:%', v_priority, v_day, v_cap USING ERRCODE = '23514';
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF v_priority IS NULL THEN v_priority := private.mission_priority_key(NEW.priority); END IF;
  IF v_priority IN ('alta', 'media') THEN
    INSERT INTO private.mission_priority_paid_days (user_id, mission_id, priority, day)
    SELECT NEW.user_id, NEW.id, v_priority, d.key::date
    FROM pg_catalog.jsonb_each_text(COALESCE(NEW.daily_status, '{}'::jsonb)) d
    WHERE d.value = 'completed' AND d.key ~ '^\d{4}-\d{2}-\d{2}$'
      AND pg_catalog.pg_input_is_valid(d.key, 'date')
    ON CONFLICT DO NOTHING;
    IF NEW.completed AND NEW.due_date IS NOT NULL THEN
      INSERT INTO private.mission_priority_paid_days VALUES (NEW.user_id, NEW.id, v_priority, NEW.due_date)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enforce_mission_priority() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_mission_priority ON public.missions;
CREATE TRIGGER enforce_mission_priority
BEFORE INSERT OR UPDATE OR DELETE ON public.missions
FOR EACH ROW EXECUTE FUNCTION private.enforce_mission_priority();

-- Ajusta apenas o CASE conhecido; mantem a implementacao D-1/undo e qualquer
-- outro calculo da RPC instalada. Falha se a versao viva divergir para exigir
-- reconciliacao explicita, em vez de publicar recompensa parcial.
DO $$
DECLARE v_sig text; v_def text; v_new text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'public._complete_mission_daily(uuid,date,integer)',
    'public._complete_mission_with_weekly(uuid,date)'
  ] LOOP
    SELECT pg_catalog.pg_get_functiondef(v_sig::regprocedure) INTO v_def;
    IF v_def !~ 'WHEN\s+''alta''\s+THEN\s+1\.5' OR
       v_def !~ 'WHEN\s+''baixa''\s+THEN\s+0\.7' THEN
      RAISE EXCEPTION 'MISSION_PRIORITY_RPC_DRIFT: %', v_sig;
    END IF;
    v_new := pg_catalog.regexp_replace(v_def, 'WHEN\s+''alta''\s+THEN\s+1\.5', 'WHEN ''alta'' THEN 2.0');
    v_new := pg_catalog.regexp_replace(v_new, 'WHEN\s+''baixa''\s+THEN\s+0\.7', 'WHEN ''baixa'' THEN 0.2');
    EXECUTE v_new;
  END LOOP;
END;
$$;
