CREATE OR REPLACE FUNCTION public.perform_class_respec(target_class text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_gold INTEGER;
  starter_item TEXT;
  has_used_respec BOOLEAN;
  -- Custo fixo definido no servidor — não pode ser manipulado pelo cliente
  v_respec_cost CONSTANT INTEGER := 120;
  v_effective_cost INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  CASE lower(target_class)
    WHEN 'guerreiro'  THEN starter_item := 'Espada Curta';
    WHEN 'mago'       THEN starter_item := 'Grimorio Basico';
    WHEN 'gatuno'     THEN starter_item := 'Adaga de Sombra';
    WHEN 'ferreiro'   THEN starter_item := 'Martelo de Aco';
    WHEN 'clerico'    THEN starter_item := 'Cajado de Luz';
    WHEN 'arqueiro'   THEN starter_item := 'Arco Curto';
    ELSE RAISE EXCEPTION 'Classe inválida: %', target_class;
  END CASE;

  -- Verifica no servidor se o usuário já usou o respec gratuito
  SELECT EXISTS(
    SELECT 1 FROM public.activity_log
    WHERE user_id = auth.uid()
      AND action = 'class_respec'
  ) INTO has_used_respec;

  v_effective_cost := CASE WHEN has_used_respec THEN v_respec_cost ELSE 0 END;

  SELECT gold INTO current_gold
  FROM public.user_balance
  WHERE user_id = auth.uid()
  FOR UPDATE;

  IF current_gold IS NULL THEN
    RAISE EXCEPTION 'Saldo não encontrado';
  END IF;

  IF current_gold < v_effective_cost THEN
    RAISE EXCEPTION 'Ouro insuficiente para respec';
  END IF;

  IF v_effective_cost > 0 THEN
    UPDATE public.user_balance
    SET gold = current_gold - v_effective_cost,
        updated_at = now()
    WHERE user_id = auth.uid();

    INSERT INTO public.gold_history (user_id, type, amount, reason)
    VALUES (auth.uid(), 'respec_classe', -v_effective_cost, 'Respec para ' || target_class);
  END IF;

  INSERT INTO public.activity_log (user_id, action, description, xp_gained)
  VALUES (auth.uid(), 'class_respec', 'Mudou para a classe ' || target_class, 0);

  RETURN jsonb_build_object(
    'starter_item', starter_item,
    'remaining_gold', current_gold - v_effective_cost,
    'was_free', NOT has_used_respec
  );
END;
$function$
