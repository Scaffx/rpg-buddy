CREATE OR REPLACE FUNCTION public.consume_inventory_item(p_inventory_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_user uuid := auth.uid(); v_row public.user_inventory%ROWTYPE;
        v_item public.game_items%ROWTYPE; v_preserved boolean := false;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_row FROM public.user_inventory
  WHERE id = p_inventory_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND OR v_row.quantity <= 0 THEN RAISE EXCEPTION 'ITEM_NOT_OWNED'; END IF;
  SELECT * INTO v_item FROM public.game_items WHERE id = v_row.item_id;
  IF NOT v_item.is_consumable AND v_item.effect IS NULL THEN RAISE EXCEPTION 'ITEM_NOT_CONSUMABLE'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.talentos_jogador tj
    JOIN public.talentos_disponiveis td ON td.id = tj.talento_id
    WHERE tj.personagem_id = v_user AND td.efeito = 'alquimista_amador'
  ) AND (COALESCE(v_item.effect, '') LIKE 'heal_%' OR COALESCE(v_item.effect, '') LIKE 'mana_%'
         OR v_item.effect = 'full_rest' OR lower(v_item.name) LIKE '%pocao%')
    AND random() < 0.1 INTO v_preserved;
  IF NOT v_preserved THEN
    IF v_row.quantity = 1 THEN DELETE FROM public.user_inventory WHERE id = v_row.id;
    ELSE UPDATE public.user_inventory SET quantity = quantity - 1 WHERE id = v_row.id; END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'item_id', v_item.id,
                            'effect', v_item.effect, 'preserved', v_preserved);
END;
$function$
