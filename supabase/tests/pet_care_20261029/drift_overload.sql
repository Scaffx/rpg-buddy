\set ON_ERROR_STOP on
CREATE FUNCTION public.buy_pet_food(p_quantity integer)
RETURNS integer LANGUAGE sql AS 'SELECT 1';
