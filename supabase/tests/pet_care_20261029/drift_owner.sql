\set ON_ERROR_STOP on
ALTER FUNCTION public.consume_inventory_item(uuid) OWNER TO service_role;
