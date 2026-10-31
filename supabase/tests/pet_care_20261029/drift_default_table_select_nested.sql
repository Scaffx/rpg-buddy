\set ON_ERROR_STOP on
CREATE ROLE pet_care_select_parent NOLOGIN;
CREATE ROLE pet_care_select_child NOLOGIN;
GRANT pet_care_select_parent TO pet_care_select_child;
GRANT pet_care_select_child TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private
  GRANT SELECT ON TABLES TO pet_care_select_parent;
