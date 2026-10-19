-- Reduced composition overlay for the live talent table shape and grants.
-- Apply after 20261019_integracao_live_effects_fixture.sql and before the
-- ordered package. The earlier overlay already supplies the captured live
-- points column, level curve and attached trigger; no historical trigger is
-- installed again here. This is a local fixture, not a remote schema dump.
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

DO $source$
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
$source$;
