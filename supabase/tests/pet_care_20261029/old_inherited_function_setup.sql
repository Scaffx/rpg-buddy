\set ON_ERROR_STOP on
CREATE ROLE pet_care_old_function_parent NOLOGIN;
GRANT pet_care_old_function_parent TO authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private
  GRANT EXECUTE ON FUNCTIONS TO pet_care_old_function_parent;
