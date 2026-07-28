-- Personal reminders are not missions and never award XP or gold.
-- `remind_at` always stores the next occurrence so the existing polling query
-- remains cheap for both one-time and recurring reminders.

CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  remind_at timestamptz NOT NULL,
  recurrence_type text NOT NULL DEFAULT 'once',
  days_of_week smallint[] NOT NULL DEFAULT '{}'::smallint[],
  starts_on date,
  ends_on date,
  remind_time time,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  notified_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS recurrence_type text NOT NULL DEFAULT 'once',
  ADD COLUMN IF NOT EXISTS days_of_week smallint[] NOT NULL DEFAULT '{}'::smallint[],
  ADD COLUMN IF NOT EXISTS starts_on date,
  ADD COLUMN IF NOT EXISTS ends_on date,
  ADD COLUMN IF NOT EXISTS remind_time time,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

ALTER TABLE public.reminders
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.reminders
  DROP CONSTRAINT IF EXISTS reminders_recurrence_type_check,
  DROP CONSTRAINT IF EXISTS reminders_weekly_schedule_check,
  DROP CONSTRAINT IF EXISTS reminders_days_of_week_check,
  DROP CONSTRAINT IF EXISTS reminders_title_length_check,
  DROP CONSTRAINT IF EXISTS reminders_description_length_check;

ALTER TABLE public.reminders
  ADD CONSTRAINT reminders_recurrence_type_check
    CHECK (recurrence_type IN ('once', 'weekly')),
  ADD CONSTRAINT reminders_title_length_check
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  ADD CONSTRAINT reminders_description_length_check
    CHECK (description IS NULL OR char_length(description) <= 200),
  ADD CONSTRAINT reminders_days_of_week_check
    CHECK (days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
  ADD CONSTRAINT reminders_weekly_schedule_check
    CHECK (
      (
        recurrence_type = 'once'
        AND cardinality(days_of_week) = 0
        AND starts_on IS NULL
        AND ends_on IS NULL
        AND remind_time IS NULL
      )
      OR (
        recurrence_type = 'weekly'
        AND
        cardinality(days_of_week) BETWEEN 1 AND 7
        AND starts_on IS NOT NULL
        AND ends_on IS NOT NULL
        AND ends_on >= starts_on
        AND remind_time IS NOT NULL
      )
    );

DROP INDEX IF EXISTS public.idx_reminders_user_remind;

CREATE INDEX idx_reminders_user_remind
  ON public.reminders (user_id, remind_at)
  WHERE dismissed_at IS NULL;

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own reminders"
  ON public.reminders;

CREATE POLICY "Users manage own reminders"
  ON public.reminders
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.reminders FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reminders TO authenticated;

COMMENT ON TABLE public.reminders IS
  'Personal one-time or weekly recurring reminders; never part of the XP economy.';
COMMENT ON COLUMN public.reminders.remind_at IS
  'Next occurrence in UTC. Recurring reminders advance this value after notification.';
COMMENT ON COLUMN public.reminders.days_of_week IS
  'JavaScript weekday numbers: Sunday=0 through Saturday=6.';

NOTIFY pgrst, 'reload schema';
