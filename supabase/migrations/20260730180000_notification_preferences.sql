-- Notificações: preferências por categoria e histórico de envios.
--
-- O histórico existe para dois motivos práticos: sustentar o teto diário mesmo
-- se a pessoa trocar de aparelho, e permitir olhar depois quais categorias de
-- fato trazem alguém de volta — sem isso a calibragem vira chute.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_muted_kinds text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.profiles.notifications_enabled IS
  'Chave geral. Desligado aqui, nenhuma notificação é agendada.';
COMMENT ON COLUMN public.profiles.notification_muted_kinds IS
  'Categorias silenciadas individualmente (missions_pending, fatigue_high, hp_low, water, meal, journal_empty).';

CREATE TABLE IF NOT EXISTS public.notification_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  -- Preenchido quando a pessoa abre o app a partir da notificação: é o número
  -- que diz se a categoria funciona ou só incomoda.
  opened_at  timestamptz
);

CREATE INDEX IF NOT EXISTS notification_log_user_sent_idx
  ON public.notification_log (user_id, sent_at DESC);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notification log"
  ON public.notification_log FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users insert own notification log"
  ON public.notification_log FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users update own notification log"
  ON public.notification_log FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.notification_log FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_log TO authenticated;
