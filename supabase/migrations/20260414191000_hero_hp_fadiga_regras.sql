-- Regras de HP do heroi e fadiga vinculadas ao progresso de nivel.

CREATE OR REPLACE FUNCTION public.sync_health_on_profile_level_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_max_hp INTEGER;
  current_fatigue INTEGER;
BEGIN
  IF NEW.level IS NULL THEN
    RETURN NEW;
  END IF;

  target_max_hp := 120 + (GREATEST(NEW.level, 1) * 8);

  IF TG_OP = 'UPDATE' AND NEW.level > COALESCE(OLD.level, 1) THEN
    INSERT INTO public.user_health_stats (user_id, max_hp, current_hp, fatigue, last_reset_date)
    VALUES (NEW.user_id, target_max_hp, target_max_hp, 0, CURRENT_DATE)
    ON CONFLICT (user_id)
    DO UPDATE
      SET max_hp = EXCLUDED.max_hp,
          current_hp = EXCLUDED.current_hp,
          last_reset_date = EXCLUDED.last_reset_date,
          updated_at = now();

    RETURN NEW;
  END IF;

  SELECT fatigue
    INTO current_fatigue
  FROM public.user_health_stats
  WHERE user_id = NEW.user_id;

  INSERT INTO public.user_health_stats (user_id, max_hp, current_hp, fatigue, last_reset_date)
  VALUES (NEW.user_id, target_max_hp, target_max_hp, COALESCE(current_fatigue, 0), CURRENT_DATE)
  ON CONFLICT (user_id)
  DO UPDATE
    SET max_hp = EXCLUDED.max_hp,
        current_hp = LEAST(public.user_health_stats.current_hp, EXCLUDED.max_hp),
        updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_health_on_profile_level_change_trigger ON public.profiles;
CREATE TRIGGER sync_health_on_profile_level_change_trigger
AFTER INSERT OR UPDATE OF level
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_health_on_profile_level_change();
