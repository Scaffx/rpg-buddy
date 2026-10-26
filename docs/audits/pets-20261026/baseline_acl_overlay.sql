-- The older composed replay omits these two live service_role grants.
-- Restore the exact captured public-wrapper ACL before auditing the migration.
GRANT EXECUTE ON FUNCTION public.sync_auto_adventure() TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_auto_adventure(uuid) TO service_role;
