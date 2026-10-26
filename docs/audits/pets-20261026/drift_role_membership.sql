-- Cluster-local role membership changes effective ACL without changing proacl.
-- The runner revokes it in finally, even if the migration fails a test.
GRANT authenticated TO anon;
