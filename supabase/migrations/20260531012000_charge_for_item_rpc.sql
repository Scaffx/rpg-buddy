-- charge_for_item: cobra o preço de um item de loja lendo do banco (anti
-- preço-zero) e deduz o ouro de forma guardada. Insert no inventário no client.
CREATE OR REPLACE FUNCTION public.charge_for_item(p_item_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_price int;
  v_gold int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT GREATEST(0, COALESCE(shop_price, 0)) INTO v_price FROM public.game_items WHERE id = p_item_id;
  IF v_price IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id = v_uid FOR UPDATE;
  IF COALESCE(v_gold, 0) < v_price THEN RAISE EXCEPTION 'Ouro insuficiente!'; END IF;
  UPDATE public.user_balance SET gold = v_gold - v_price, updated_at = now() WHERE user_id = v_uid;
  RETURN v_price;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.charge_for_item(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.charge_for_item(uuid) TO authenticated;
