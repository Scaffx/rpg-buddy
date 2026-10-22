-- Local performance sensitivity only: run on catchup_review_cache64.
-- Do not apply this variant to the migration or any shared database.
DO $review$
DECLARE
  original_definition text;
  variant_definition text;
  search_text constant text := 'FOR batch IN 1..256 LOOP';
BEGIN
  IF current_database()<>'catchup_review_cache64' THEN
    RAISE EXCEPTION 'local review clone required';
  END IF;
  SELECT pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure)
    INTO original_definition;
  IF position('v_prior := v_battle;' IN original_definition)=0
     OR position(search_text IN original_definition)=0
     OR length(original_definition)-length(replace(original_definition,search_text,''))<>length(search_text) THEN
    RAISE EXCEPTION 'optimized source drift';
  END IF;
  variant_definition:=replace(original_definition,search_text,'FOR batch IN 1..64 LOOP');
  EXECUTE variant_definition;
END
$review$;
