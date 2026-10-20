-- Run on a fresh fixture database before the cooperative portal migration.
CREATE OR REPLACE FUNCTION public._guard_profiles_economy()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
SELECT 'guard_changed=' || (md5(pg_get_functiondef('public._guard_profiles_economy()'::regprocedure)) <> md5('')) AS setup;
