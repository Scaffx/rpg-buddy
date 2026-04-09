CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

DROP POLICY IF EXISTS "Users can update own feedback" ON public.system_feedback;

CREATE OR REPLACE FUNCTION public.perform_class_respec(target_class TEXT, respec_cost INTEGER DEFAULT 120)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_gold INTEGER;
  starter_item TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  CASE lower(target_class)
    WHEN 'guerreiro' THEN starter_item := 'Espada Curta';
    WHEN 'mago' THEN starter_item := 'Grimorio Basico';
    WHEN 'gatuno' THEN starter_item := 'Adaga de Sombra';
    WHEN 'ferreiro' THEN starter_item := 'Martelo de Aco';
    WHEN 'clerico' THEN starter_item := 'Cajado de Luz';
    WHEN 'arqueiro' THEN starter_item := 'Arco Curto';
    ELSE RAISE EXCEPTION 'Classe inválida';
  END CASE;

  SELECT gold INTO current_gold
  FROM public.user_balance
  WHERE user_id = auth.uid()
  FOR UPDATE;

  IF current_gold IS NULL THEN
    RAISE EXCEPTION 'Saldo não encontrado';
  END IF;

  IF current_gold < respec_cost THEN
    RAISE EXCEPTION 'Ouro insuficiente para respec';
  END IF;

  UPDATE public.user_balance
  SET gold = current_gold - respec_cost,
      updated_at = now()
  WHERE user_id = auth.uid();

  INSERT INTO public.gold_history (user_id, type, amount, reason)
  VALUES (auth.uid(), 'respec_classe', -respec_cost, 'Respec para ' || target_class);

  INSERT INTO public.activity_log (user_id, action, description, xp_gained)
  VALUES (auth.uid(), 'class_respec', 'Mudou para a classe ' || target_class, 0);

  RETURN jsonb_build_object(
    'starter_item', starter_item,
    'remaining_gold', current_gold - respec_cost
  );
END;
$$;

REVOKE ALL ON FUNCTION public.perform_class_respec(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perform_class_respec(TEXT, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_system_feedback_admin()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  title TEXT,
  message TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT sf.id, sf.user_id, sf.title, sf.message, sf.status, sf.created_at, sf.updated_at
  FROM public.system_feedback sf
  ORDER BY sf.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_system_feedback_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_system_feedback_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_system_feedback_status(feedback_id UUID, next_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.system_feedback
  SET status = next_status,
      updated_at = now()
  WHERE id = feedback_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_system_feedback_status(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_system_feedback_status(UUID, TEXT) TO authenticated;