-- Read-only authority function snapshots for the reduced PG17 fixture.
CREATE FUNCTION app_private.class_path_matches(p_current uuid, p_starter text, p_level integer)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = pg_catalog AS $$
  WITH RECURSIVE path AS (
    SELECT c.id, c.parent_class_id, c.column_index, c.level_min,
           true AS adjacent,
           ARRAY[c.id] AS visited, 1 AS hops
    FROM public.classes c WHERE c.id = p_current
    UNION ALL
    SELECT c.id, c.parent_class_id, c.column_index, c.level_min,
           path.adjacent AND ((path.column_index = c.column_index + 1) IS TRUE),
           path.visited || c.id, path.hops + 1
    FROM path JOIN public.classes c ON c.id = path.parent_class_id
    WHERE path.hops < 16 AND NOT c.id = ANY(path.visited)
  )
  SELECT EXISTS (
    SELECT 1 FROM path
    HAVING bool_and(level_min <= p_level)
       AND bool_and(adjacent)
       AND count(*) FILTER (WHERE id = app_private.base_class_id(p_starter)
                           AND column_index = 2) = 1
       AND count(*) FILTER (WHERE id = '00000001-0000-0000-0000-000000000001'::uuid
                           AND column_index = 1 AND parent_class_id IS NULL) = 1
       AND count(*) FILTER (WHERE parent_class_id IS NULL) = 1
  );
$$;
REVOKE ALL ON FUNCTION app_private.class_path_matches(uuid,text,integer) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.set_inventory_equipped(p_inventory_id uuid, p_equipped boolean, p_replace_weapon boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid(); v_item public.game_items%ROWTYPE;
  v_item_id uuid; v_quantity integer; v_count integer; v_limit integer; v_attuned boolean;
  v_requires_attunement boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_equipped IS NULL THEN RAISE EXCEPTION 'INVALID_EQUIP_STATE'; END IF;
  PERFORM 1 FROM public.profiles WHERE user_id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  SELECT ui.item_id, ui.quantity, ui.sintonizado INTO v_item_id, v_quantity, v_attuned
  FROM public.user_inventory ui
  WHERE ui.id = p_inventory_id AND ui.user_id = v_user FOR UPDATE;
  IF NOT FOUND OR v_quantity <= 0 THEN RAISE EXCEPTION 'ITEM_NOT_OWNED'; END IF;
  SELECT * INTO v_item FROM public.game_items WHERE id = v_item_id;
  IF NOT p_equipped THEN
    UPDATE public.user_inventory SET equipped = false WHERE id = p_inventory_id;
    RETURN;
  END IF;
  v_limit := CASE v_item.category WHEN 'weapon' THEN 2 WHEN 'armor' THEN 1
             WHEN 'accessory' THEN 3 ELSE NULL END;
  IF v_limit IS NULL OR v_item.is_consumable THEN RAISE EXCEPTION 'ITEM_NOT_EQUIPPABLE'; END IF;
  IF COALESCE(v_item.level_required, 1) >
     COALESCE((SELECT level FROM public.profiles WHERE user_id = v_user), 1) THEN
    RAISE EXCEPTION 'ITEM_LEVEL_REQUIRED';
  END IF;
  IF p_replace_weapon AND v_item.category <> 'weapon' THEN RAISE EXCEPTION 'INVALID_WEAPON_SWAP'; END IF;
  IF p_replace_weapon THEN
    UPDATE public.user_inventory ui SET equipped = false
    FROM public.game_items gi WHERE gi.id = ui.item_id AND gi.category = 'weapon'
      AND ui.user_id = v_user AND ui.id <> p_inventory_id;
  END IF;
  SELECT count(*) INTO v_count FROM public.user_inventory ui
  JOIN public.game_items gi ON gi.id = ui.item_id
  WHERE ui.user_id = v_user AND ui.id <> p_inventory_id
    AND ui.equipped AND gi.category = v_item.category;
  IF v_count >= v_limit THEN RAISE EXCEPTION 'EQUIPMENT_SLOT_LIMIT'; END IF;
  v_requires_attunement := v_item.requer_sintonizacao OR v_item.rarity IN ('epico', 'lendario');
  IF v_requires_attunement AND NOT v_attuned THEN
    SELECT count(*) INTO v_count FROM public.user_inventory
    WHERE user_id = v_user AND sintonizado AND id <> p_inventory_id;
    IF v_count >= 3 THEN RAISE EXCEPTION 'ATTUNEMENT_LIMIT'; END IF;
    UPDATE public.user_inventory SET sintonizado = true WHERE id = p_inventory_id;
  END IF;
  UPDATE public.user_inventory SET equipped = true WHERE id = p_inventory_id;
END;
$function$
;
