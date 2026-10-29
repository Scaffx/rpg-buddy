\set ON_ERROR_STOP on
CREATE ROLE pet_care_table_parent NOLOGIN;
CREATE ROLE pet_care_table_child NOLOGIN;
GRANT pet_care_table_parent TO pet_care_table_child;
GRANT pet_care_table_child TO authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private
  GRANT TRUNCATE ON TABLES TO pet_care_table_parent;
