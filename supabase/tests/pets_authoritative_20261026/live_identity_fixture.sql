DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')
  THEN CREATE ROLE service_role NOLOGIN; END IF; END $$;
ALTER TABLE public.companions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.companions ADD COLUMN IF NOT EXISTS affinity integer NOT NULL DEFAULT 0;
ALTER TABLE public.companions ADD COLUMN IF NOT EXISTS last_forage_at date;
ALTER TABLE public.companions ADD COLUMN IF NOT EXISTS last_affinity_date date;
CREATE OR REPLACE FUNCTION public._guard_inventory_forage_pet()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated','anon') AND
     (NEW.id, NEW.user_id, NEW.companion_type, NEW.origin, NEW.affinity,
      NEW.last_forage_at, NEW.last_affinity_date)
     IS DISTINCT FROM
     (OLD.id, OLD.user_id, OLD.companion_type, OLD.origin, OLD.affinity,
      OLD.last_forage_at, OLD.last_affinity_date) THEN
    RAISE EXCEPTION 'COMPANION_REWARD_FIELDS_PROTECTED';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public._record_inventory_forage_pet()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF current_user IN ('postgres','service_role') AND
     ((NEW.companion_type = 'cat' AND NEW.origin = 'lvl3_choice') OR
      (NEW.companion_type = 'mini_demonio_fome' AND NEW.origin = 'shop')) THEN
    INSERT INTO public.inventory_forage_eligible(companion_id,user_id,companion_type,origin)
    VALUES(NEW.id,NEW.user_id,NEW.companion_type,NEW.origin) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.choose_level3_companion(p_type text, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_user uuid := auth.uid(); v_level integer; v_pet public.companions%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_type NOT IN ('dog','cat','calopsita') OR length(trim(COALESCE(p_name,''))) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'INVALID_COMPANION';
  END IF;
  SELECT level INTO v_level FROM public.profiles WHERE user_id = v_user FOR UPDATE;
  IF COALESCE(v_level,0) < 3 THEN RAISE EXCEPTION 'COMPANION_LEVEL_REQUIRED'; END IF;
  INSERT INTO public.companions(user_id,companion_type,origin,name)
  VALUES(v_user,p_type,'lvl3_choice',trim(p_name)) RETURNING * INTO v_pet;
  RETURN to_jsonb(v_pet);
END;
$function$;
DROP TRIGGER IF EXISTS record_inventory_forage_pet ON public.companions;
CREATE TRIGGER record_inventory_forage_pet AFTER INSERT ON public.companions FOR EACH ROW EXECUTE FUNCTION public._record_inventory_forage_pet();
DROP TRIGGER IF EXISTS guard_inventory_forage_pet ON public.companions;
CREATE TRIGGER guard_inventory_forage_pet BEFORE UPDATE ON public.companions FOR EACH ROW EXECUTE FUNCTION public._guard_inventory_forage_pet();
GRANT EXECUTE ON FUNCTION public._guard_inventory_forage_pet(),public._record_inventory_forage_pet() TO anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.choose_level3_companion(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.choose_level3_companion(text,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.buy_pet(text) TO service_role;
