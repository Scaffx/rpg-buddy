-- Apply after the v3 motor and before the five-realm migration.
-- Freeze battles that started under each old biome, including legacy ruins.
INSERT INTO auth.users(id)
SELECT ('00000000-0000-0000-0000-'||lpad(s::text,12,'0'))::uuid
FROM (VALUES (11),(21),(31)) AS stages(s);
INSERT INTO public.profiles(user_id,level,starter_class)
SELECT ('00000000-0000-0000-0000-'||lpad(s::text,12,'0'))::uuid,50,'guerreiro'
FROM (VALUES (11),(21),(31)) AS stages(s);
INSERT INTO public.attributes(user_id,name,level)
SELECT ('00000000-0000-0000-0000-'||lpad(s::text,12,'0'))::uuid,'forca',5
FROM (VALUES (11),(21),(31)) AS stages(s);
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at)
SELECT ('00000000-0000-0000-0000-'||lpad(s::text,12,'0'))::uuid,s,0,clock_timestamp()
FROM (VALUES (11),(21),(31)) AS stages(s);
SET ROLE authenticated;
DO $$
DECLARE s integer;
BEGIN
  FOR s IN SELECT unnest(ARRAY[11,21,31]) LOOP
    PERFORM set_config('request.jwt.claim.sub',
      ('00000000-0000-0000-0000-'||lpad(s::text,12,'0'))::text,true);
    PERFORM public.sync_auto_adventure();
  END LOOP;
END $$;
RESET ROLE;
CREATE TABLE public.five_realm_inflight_probe AS
SELECT id,stage,biome,md5(to_jsonb(b)::text) AS row_hash
FROM app_private.adventure_battles b
WHERE stage IN (11,21,31) AND user_id IN (
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000031');
