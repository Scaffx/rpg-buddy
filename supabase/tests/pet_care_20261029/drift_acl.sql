\set ON_ERROR_STOP on
REVOKE EXECUTE ON FUNCTION public.consume_inventory_item(uuid) FROM authenticated;
