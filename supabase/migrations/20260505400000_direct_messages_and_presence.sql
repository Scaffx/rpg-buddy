-- ================================================================
-- Direct Messages (chat privado entre amigos) + Presença online
-- ================================================================

-- 1) Presença: adiciona last_seen_at em profiles para indicador online/offline.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at
  ON public.profiles(last_seen_at);

-- RPC para o frontend bater heartbeat sem precisar liberar UPDATE em
-- profiles fora do user_id. Atualiza apenas last_seen_at do próprio user.
CREATE OR REPLACE FUNCTION update_my_last_seen()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.profiles
  SET last_seen_at = now()
  WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION update_my_last_seen() TO authenticated;

-- 2) Tabela direct_messages: chat 1-a-1 entre usuários.
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_id <> receiver_id),
  CHECK (length(content) BETWEEN 1 AND 1000)
);

-- Conversas costumam ser consultadas como par (a,b) ordenado por created_at.
-- Indice composto cobre ambos os papéis (sender e receiver).
CREATE INDEX IF NOT EXISTS idx_direct_messages_pair
  ON public.direct_messages(sender_id, receiver_id, created_at);
CREATE INDEX IF NOT EXISTS idx_direct_messages_recv
  ON public.direct_messages(receiver_id, created_at);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT: pode ler mensagens onde é sender OU receiver
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'direct_messages'
      AND policyname = 'Users read messages they participate in'
  ) THEN
    CREATE POLICY "Users read messages they participate in"
      ON public.direct_messages
      FOR SELECT
      USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
  END IF;

  -- INSERT: só pode mandar como você mesmo, e só para alguém com quem
  -- já tem amizade ACEITA (evita spam).
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'direct_messages'
      AND policyname = 'Users send messages to friends only'
  ) THEN
    CREATE POLICY "Users send messages to friends only"
      ON public.direct_messages
      FOR INSERT
      WITH CHECK (
        auth.uid() = sender_id
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
  END IF;

  -- UPDATE: só receiver pode marcar como lido (set read_at)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'direct_messages'
      AND policyname = 'Receivers mark as read'
  ) THEN
    CREATE POLICY "Receivers mark as read"
      ON public.direct_messages
      FOR UPDATE
      USING (auth.uid() = receiver_id)
      WITH CHECK (auth.uid() = receiver_id);
  END IF;

  -- DELETE: cada lado pode apagar suas próprias mensagens (sender)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'direct_messages'
      AND policyname = 'Senders delete own messages'
  ) THEN
    CREATE POLICY "Senders delete own messages"
      ON public.direct_messages
      FOR DELETE
      USING (auth.uid() = sender_id);
  END IF;
END $$;

-- 3) Habilita Realtime para que clientes recebam INSERTs ao vivo.
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;

-- 4) RPC: contagem de não-lidas agregada por sender (para badges)
CREATE OR REPLACE FUNCTION get_unread_counts_by_sender()
RETURNS TABLE (sender_id uuid, unread bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT sender_id, COUNT(*) AS unread
  FROM public.direct_messages
  WHERE receiver_id = auth.uid()
    AND read_at IS NULL
  GROUP BY sender_id;
$$;

GRANT EXECUTE ON FUNCTION get_unread_counts_by_sender() TO authenticated;

NOTIFY pgrst, 'reload schema';
