\set ON_ERROR_STOP on
BEGIN;
-- A name/signature-only preflight must reject a no-op credit helper.
CREATE OR REPLACE FUNCTION app_private.credit_adventure_material(
  p_user_id uuid,p_material text,p_amount integer,p_source text,p_source_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT '{}'::jsonb
$$;
\ir ../migrations/20261022022726_adventure_chests_offline.sql
