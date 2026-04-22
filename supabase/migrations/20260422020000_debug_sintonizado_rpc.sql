-- Função RPC para testar se sintonizado existe e é acessível no banco
CREATE OR REPLACE FUNCTION public.debug_sintonizado()
RETURNS TABLE(col_exists boolean, sample_value boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT 
      true as col_exists,
      sintonizado as sample_value
    FROM public.user_inventory
    LIMIT 1;
EXCEPTION WHEN undefined_column THEN
  RETURN QUERY SELECT false, null::boolean;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_sintonizado() TO anon, authenticated;
