-- The selected weekly target is also the hard cap. Once a 4x mission reaches
-- 4/4 it leaves Today; a fifth visit must come from editing the target to 5 or
-- from a separate one-shot mission.

UPDATE public.missions
SET max_count = target_count
WHERE frequency_type = 'weekly'
  AND max_count IS DISTINCT FROM target_count;

CREATE OR REPLACE FUNCTION public._sync_weekly_mission_target_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.frequency_type = 'weekly' THEN
    NEW.max_count := NEW.target_count;
  ELSE
    NEW.max_count := NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._sync_weekly_mission_target_cap()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sync_weekly_mission_target_cap
  ON public.missions;

CREATE TRIGGER sync_weekly_mission_target_cap
BEFORE INSERT OR UPDATE OF frequency_type, target_count, max_count
ON public.missions
FOR EACH ROW
EXECUTE FUNCTION public._sync_weekly_mission_target_cap();

COMMENT ON COLUMN public.missions.max_count IS
  'Server-synced hard cap for weekly missions; always equal to target_count.';
