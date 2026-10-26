CREATE OR REPLACE FUNCTION public._guard_inventory_forage_pet()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog','public' AS $$
BEGIN
  RETURN NEW;
END;
$$;
