CREATE OR REPLACE FUNCTION public.sync_auto_adventure()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ SELECT app_private.sync_auto_adventure() $function$
