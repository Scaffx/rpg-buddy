-- Reduced snapshot overlay, applied after A12 in a local test DB only.
-- Schema/ACL/trigger/curve derive from the 2026-10-19 read-only captures.
ALTER TABLE public.profiles ADD COLUMN pontos_talento integer NOT NULL DEFAULT 0;

-- The integration fixture already has tiny talent tables for dispatcher SQL.
ALTER TABLE public.talentos_disponiveis
  ADD COLUMN nome text NOT NULL DEFAULT 'fixture-placeholder',
  ADD COLUMN descricao text NOT NULL DEFAULT 'fixture-placeholder',
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ALTER COLUMN efeito SET NOT NULL;
ALTER TABLE public.talentos_disponiveis
  ALTER COLUMN nome DROP DEFAULT, ALTER COLUMN descricao DROP DEFAULT,
  ADD CONSTRAINT talentos_disponiveis_nome_key UNIQUE (nome),
  ADD CONSTRAINT talentos_disponiveis_efeito_key UNIQUE (efeito);
ALTER TABLE public.talentos_jogador
  ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN equipped boolean NOT NULL DEFAULT false,
  ALTER COLUMN personagem_id SET NOT NULL,
  ALTER COLUMN talento_id SET NOT NULL;
ALTER TABLE public.talentos_jogador
  ADD CONSTRAINT talentos_jogador_pkey PRIMARY KEY (id),
  ADD CONSTRAINT talentos_jogador_personagem_id_talento_id_key UNIQUE (personagem_id,talento_id),
  ADD CONSTRAINT talentos_jogador_personagem_id_fkey FOREIGN KEY (personagem_id)
    REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT talentos_jogador_talento_id_fkey FOREIGN KEY (talento_id)
    REFERENCES public.talentos_disponiveis(id) ON DELETE CASCADE;
ALTER TABLE public.talentos_disponiveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talentos_jogador ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view talentos disponiveis" ON public.talentos_disponiveis
  FOR SELECT USING (true);
CREATE POLICY "Users can view own talentos" ON public.talentos_jogador
  FOR SELECT TO authenticated USING (auth.uid() = personagem_id);
CREATE POLICY "Users can insert own talentos" ON public.talentos_jogador
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = personagem_id);
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.talentos_disponiveis, public.talentos_jogador TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_level_from_xp_v2(p_total_xp integer)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  xp_table int[] := ARRAY[
        0,    320,   1000,   2080,   3600,   5600,   8120,  11200,  14880,  19200,
    24200,  29920,  36400,  43680,  51800,  60800,  70720,  81600,  93480, 106400,
   120400, 135520, 151800, 169280, 188000, 208000, 229320, 252000, 276080, 301600,
   328600, 357120, 387200, 418880, 452200, 487200, 523920, 562400, 602680, 644800,
   688800, 734720, 782600, 832480, 884400, 938400, 994520,1052800,1113280,1176000,
  1241000,1308320,1378000,1450080,1524600,1601600,1681120,1763200,1847880,1935200
  ];
  v_xp int := GREATEST(0, COALESCE(p_total_xp, 0));
  i int;
BEGIN
  FOR i IN REVERSE array_length(xp_table, 1)..2 LOOP
    IF v_xp >= xp_table[i] THEN RETURN i; END IF;
  END LOOP;
  RETURN 1;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_talent_points_on_level_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  old_chunks integer;
  new_chunks integer;
  gain integer;
BEGIN
  old_chunks := floor(COALESCE(OLD.level, 1) / 5.0);
  new_chunks := floor(COALESCE(NEW.level, 1) / 5.0);
  gain := GREATEST(0, new_chunks - old_chunks);

  IF gain > 0 THEN
    NEW.pontos_talento := COALESCE(NEW.pontos_talento, 0) + gain;
  ELSE
    NEW.pontos_talento := COALESCE(NEW.pontos_talento, 0);
  END IF;

  RETURN NEW;
END;
$function$;
CREATE TRIGGER sync_talent_points_on_level_change_trigger
 BEFORE UPDATE OF level ON public.profiles FOR EACH ROW
 EXECUTE FUNCTION public.sync_talent_points_on_level_change();

DO $fixture_check$
BEGIN
  IF md5(replace(pg_get_functiondef(
      'public.get_level_from_xp_v2(integer)'::regprocedure),E'\r\n',E'\n'))
      <> '94aa330f1f9e444fc96b6ffd6be48f8e'
     OR md5(replace(pg_get_functiondef(
      'public.sync_talent_points_on_level_change()'::regprocedure),E'\r\n',E'\n'))
      <> 'c4481ca3cd7dc1a149443dc4047e0cb8' THEN
    RAISE EXCEPTION 'TALENT_LIVE_FIXTURE_SOURCE_DRIFT';
  END IF;
END;
$fixture_check$;
