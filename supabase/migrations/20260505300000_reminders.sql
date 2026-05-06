-- ================================================================
-- Lembretes (Reminders)
-- Sistema simples de avisos pessoais — NÃO são missões, NÃO dão XP.
-- Servem para o usuário marcar coisas que precisa lembrar de fazer
-- em um horário específico.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.reminders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  remind_at   TIMESTAMPTZ NOT NULL,
  notified_at TIMESTAMPTZ,           -- preenchido quando o frontend exibiu o toast
  dismissed_at TIMESTAMPTZ,          -- preenchido quando usuário marcou como visto
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_user_remind
  ON public.reminders(user_id, remind_at);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reminders'
      AND policyname = 'Users manage own reminders'
  ) THEN
    CREATE POLICY "Users manage own reminders"
      ON public.reminders
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
