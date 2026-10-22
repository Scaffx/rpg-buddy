\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE app_private.adventure_battles DISABLE TRIGGER adventure_boss_recipe_victory;
\ir ../migrations/20261022022726_adventure_chests_offline.sql
