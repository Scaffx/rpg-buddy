CREATE OR REPLACE FUNCTION public.advance_auto_adventure(p_battle_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  SELECT app_private.advance_auto_adventure(p_battle_id)
$function$
