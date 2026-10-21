-- Run after the reduced class fixture and before the class migration.
-- Preserve owner, signature and SECURITY DEFINER while changing the live body.
CREATE OR REPLACE FUNCTION public.allocate_skill_node(p_node_id text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT '{"forged_body":true}'::jsonb
$$;
DO $$ BEGIN
  IF NOT (SELECT prosecdef AND pg_get_userbyid(proowner)='postgres'
    FROM pg_proc WHERE oid='public.allocate_skill_node(text)'::regprocedure) THEN
    RAISE EXCEPTION 'bad negative fixture';
  END IF;
END $$;
