-- Read-only live class helper snapshot, captured 2026-10-22; PG17 fixture only.
CREATE OR REPLACE FUNCTION app_private.hero_class_key(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app_private'
AS $function$
DECLARE v_identity app_private.hero_class_identity%ROWTYPE;
        v_profile public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_identity FROM app_private.hero_class_identity WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    IF v_profile.current_class_id = '00000001-0000-0000-0000-000000000001'::uuid
       AND v_profile.level >= 1 THEN RETURN 'aprendiz'; END IF;
    RETURN NULL;
  END IF;
  IF (v_profile.starter_class,v_profile.current_class_id,v_profile.starter_item)
     IS DISTINCT FROM
     (v_identity.starter_class,v_identity.current_class_id,v_identity.starter_item)
  THEN RETURN NULL; END IF;
  IF v_identity.current_class_id IS NOT NULL THEN
    IF v_identity.current_class_id = '00000001-0000-0000-0000-000000000001'::uuid
       AND v_profile.level >= 1 THEN RETURN 'aprendiz'; END IF;
    IF NOT app_private.class_path_matches(
      v_identity.current_class_id,v_identity.starter_class,v_profile.level
    ) THEN RETURN NULL; END IF;
  END IF;
  RETURN CASE WHEN v_identity.starter_class = 'clerico' THEN 'novato'
              ELSE v_identity.starter_class END;
END;
$function$
;
REVOKE ALL ON FUNCTION app_private.hero_class_key(uuid) FROM PUBLIC,anon,authenticated;
