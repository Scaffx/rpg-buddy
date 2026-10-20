-- EXPECTED FAILURE (psql -1 -v ON_ERROR_STOP=1): a modified live helper must
-- abort A12 before any receipt table or RPC replacement is committed.
CREATE OR REPLACE FUNCTION public._grant_flow_xp_buff(p_uid uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $drift$ BEGIN NULL; END; $drift$;
\ir ../migrations/20261019220257_undo_mission_derived_effect_receipts.sql
