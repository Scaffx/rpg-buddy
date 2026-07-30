-- ================================================================
-- Moderação (bloquear / denunciar) + Exclusão de conta
--
-- Duas exigências da Google Play que faltavam para publicar:
--   · app com conteúdo trocado entre usuários precisa de bloqueio e denúncia
--   · app com criação de conta precisa de exclusão da conta e dos dados
--
-- Depende de 20260505400000_direct_messages_and_presence.sql, que cria
-- direct_messages. Aplicar as duas em ordem.
-- ================================================================

-- ----------------------------------------------------------------
-- 1) blocked_users — corte unilateral de contato
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocked_users (
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- O lookup mais quente é "fulano me bloqueou?", que parte do bloqueado.
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked
  ON public.blocked_users(blocked_id);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='blocked_users' AND policyname='Users read own blocks'
  ) THEN
    CREATE POLICY "Users read own blocks" ON public.blocked_users
      FOR SELECT USING (auth.uid() = blocker_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='blocked_users' AND policyname='Users create own blocks'
  ) THEN
    CREATE POLICY "Users create own blocks" ON public.blocked_users
      FOR INSERT WITH CHECK (auth.uid() = blocker_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='blocked_users' AND policyname='Users remove own blocks'
  ) THEN
    CREATE POLICY "Users remove own blocks" ON public.blocked_users
      FOR DELETE USING (auth.uid() = blocker_id);
  END IF;
END $$;

-- Quem foi bloqueado NÃO enxerga o bloqueio (não há policy para blocked_id).
-- Isso é intencional: bloqueio silencioso evita retaliação.

-- ----------------------------------------------------------------
-- 2) content_reports — denúncia de usuário ou de mensagem
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id       UUID REFERENCES public.direct_messages(id) ON DELETE SET NULL,
  reason           TEXT NOT NULL CHECK (reason IN
                     ('spam','assedio','conteudo_improprio','discurso_de_odio','outro')),
  details          TEXT CHECK (details IS NULL OR length(details) <= 1000),
  status           TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN
                     ('pendente','em_analise','resolvido','descartado')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (reporter_id <> reported_user_id)
);

CREATE INDEX IF NOT EXISTS idx_content_reports_status
  ON public.content_reports(status, created_at DESC);

ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='content_reports' AND policyname='Users file own reports'
  ) THEN
    CREATE POLICY "Users file own reports" ON public.content_reports
      FOR INSERT WITH CHECK (auth.uid() = reporter_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='content_reports' AND policyname='Users read own reports'
  ) THEN
    CREATE POLICY "Users read own reports" ON public.content_reports
      FOR SELECT USING (auth.uid() = reporter_id);
  END IF;

  -- Admin lê tudo. Mesmo critério do frontend (useIsAdmin.ts): role no
  -- app_metadata do JWT, que o usuário não consegue forjar.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='content_reports' AND policyname='Admins read all reports'
  ) THEN
    CREATE POLICY "Admins read all reports" ON public.content_reports
      FOR SELECT USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='content_reports' AND policyname='Admins update reports'
  ) THEN
    CREATE POLICY "Admins update reports" ON public.content_reports
      FOR UPDATE USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
      WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 3) Bloqueio corta o chat nos dois sentidos
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_blocked_pair(a UUID, b UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_blocked_pair(UUID, UUID) TO authenticated;

-- SELECT: some a conversa dos dois lados assim que existe bloqueio.
DROP POLICY IF EXISTS "Users read messages they participate in" ON public.direct_messages;
CREATE POLICY "Users read messages they participate in"
  ON public.direct_messages
  FOR SELECT
  USING (
    (auth.uid() = sender_id OR auth.uid() = receiver_id)
    AND NOT public.is_blocked_pair(sender_id, receiver_id)
  );

-- INSERT: continua exigindo amizade aceita, agora também sem bloqueio.
DROP POLICY IF EXISTS "Users send messages to friends only" ON public.direct_messages;
CREATE POLICY "Users send messages to friends only"
  ON public.direct_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND NOT public.is_blocked_pair(auth.uid(), receiver_id)
    AND EXISTS (
      SELECT 1 FROM public.friend_requests fr
      WHERE fr.status = 'accepted'
        AND (
          (fr.requester_id = auth.uid() AND fr.receiver_id = direct_messages.receiver_id)
          OR
          (fr.receiver_id = auth.uid() AND fr.requester_id = direct_messages.receiver_id)
        )
    )
  );

-- Badge de não-lidas também ignora bloqueado, senão o contador denuncia
-- mensagem que a tela nunca vai mostrar.
CREATE OR REPLACE FUNCTION public.get_unread_counts_by_sender()
RETURNS TABLE (sender_id uuid, unread bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT dm.sender_id, COUNT(*) AS unread
  FROM public.direct_messages dm
  WHERE dm.receiver_id = auth.uid()
    AND dm.read_at IS NULL
    AND NOT public.is_blocked_pair(dm.sender_id, dm.receiver_id)
  GROUP BY dm.sender_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_counts_by_sender() TO authenticated;

-- ----------------------------------------------------------------
-- 4) delete_my_account — exclusão real, não pedido de exclusão
--
-- Nenhuma tabela de public tem FK para auth.users, então apagar o usuário
-- do auth deixaria 48 tabelas de lixo órfão. Em vez de listar tabela por
-- tabela (que quebra silenciosamente quando alguém cria a 49ª), a função
-- varre o catálogo procurando colunas de dono.
--
-- As passadas repetidas resolvem ordem de FK entre tabelas de public: se
-- um DELETE falha por dependência, ele é tentado de novo na volta
-- seguinte, quando a tabela dependente já foi esvaziada.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid       UUID := auth.uid();
  r         RECORD;
  passada   INT := 0;
  pendentes INT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sem sessao: exclusao exige usuario autenticado';
  END IF;

  LOOP
    passada := passada + 1;
    pendentes := 0;

    FOR r IN
      SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name  = c.table_name
       AND t.table_type  = 'BASE TABLE'
      WHERE c.table_schema = 'public'
        AND c.column_name IN (
          'user_id','requester_id','receiver_id','sender_id',
          'reporter_id','reported_user_id','challenger_id',
          'opponent_id','blocker_id','blocked_id'
        )
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.table_name, r.column_name)
          USING uid;
      EXCEPTION
        WHEN foreign_key_violation THEN
          pendentes := pendentes + 1;
      END;
    END LOOP;

    EXIT WHEN pendentes = 0 OR passada >= 5;
  END LOOP;

  -- Arquivos do usuário (avatar, fotos de progresso).
  DELETE FROM storage.objects WHERE owner = uid;

  -- Por último o próprio login, que é o que invalida a sessão.
  DELETE FROM auth.users WHERE id = uid;
END $$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

NOTIFY pgrst, 'reload schema';
