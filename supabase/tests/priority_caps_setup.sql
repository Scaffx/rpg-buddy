-- Cluster PostgreSQL 17 descartavel: setup minimo para executar a migration
-- isoladamente sem reaplicar a cadeia historica no projeto remoto.
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.uid', true), '')::uuid;
$$;
CREATE TABLE public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'fixture',
  priority text DEFAULT 'media',
  xp_reward integer NOT NULL DEFAULT 25,
  completed boolean NOT NULL DEFAULT false,
  status text DEFAULT 'pendente',
  days_of_week jsonb DEFAULT '[]'::jsonb,
  daily_status jsonb DEFAULT '{}'::jsonb,
  due_date date,
  frequency_type text NOT NULL DEFAULT 'daily'
);
-- Legado hostil: chave com formato correto, mas data impossivel, e XP acima
-- da base nova. A migration deve ignorar a chave sem falhar nem pagar credito.
INSERT INTO public.missions (user_id, priority, xp_reward, days_of_week, daily_status)
VALUES
  ('00000000-0000-0000-0000-000000000010', 'alta', 1000, '["Seg"]',
   '{"2026-99-99":"completed","2026-02-30":"completed","2026-10-19":"completed"}'),
  ('00000000-0000-0000-0000-000000000011', 'baixa', 1000, '["Seg"]', '{}');
CREATE FUNCTION public._complete_mission_daily(uuid, date, integer)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_priority_mult numeric;
BEGIN
  v_priority_mult := CASE lower('alta')
    WHEN 'alta' THEN 1.5
    WHEN 'baixa' THEN 0.7
    ELSE 1.0 END;
  RETURN jsonb_build_object('priority_mult', v_priority_mult);
END;
$$;
CREATE FUNCTION public._complete_mission_with_weekly(uuid, date)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_priority_mult numeric;
BEGIN
  v_priority_mult := CASE lower('alta')
    WHEN 'alta' THEN 1.5
    WHEN 'baixa' THEN 0.7
    ELSE 1.0 END;
  RETURN jsonb_build_object('priority_mult', v_priority_mult);
END;
$$;
