-- Add sleep_time and wake_time to user_health_stats so the hero recovers
-- HP/MP/fatigue at the wake time and only feels hunger/thirst penalties after waking up.
ALTER TABLE public.user_health_stats
  ADD COLUMN IF NOT EXISTS sleep_time time without time zone DEFAULT '23:00'::time,
  ADD COLUMN IF NOT EXISTS wake_time  time without time zone DEFAULT '07:00'::time,
  ADD COLUMN IF NOT EXISTS last_wake_recovery_date date;