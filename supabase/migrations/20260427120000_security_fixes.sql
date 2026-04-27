-- ═══════════════════════════════════════════════════════════════════════════════
-- SECURITY FIXES — Lovable audit 2026-04-27
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. grant_starter_items: aceitar apenas o próprio user_id autenticado
--    (previne wipe de inventário de terceiros)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.grant_starter_items(p_user_id UUID, p_class TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- Garante que somente o próprio usuário autenticado pode receber itens
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Acesso negado: você só pode receber itens para seu próprio personagem';
  END IF;

  -- Limpa inventário anterior (caso o onboarding seja refeito)
  DELETE FROM user_inventory WHERE user_id = p_user_id;

  -- Arma e armadura da classe
  FOR v_item IN
    SELECT id FROM game_items
    WHERE is_starter = true
      AND starter_class = p_class
      AND category IN ('weapon', 'armor')
  LOOP
    INSERT INTO user_inventory (user_id, item_id, quantity, equipped)
    VALUES (p_user_id, v_item.id, 1, true)
    ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = 1, equipped = true;
  END LOOP;

  -- Consumíveis iniciais (2 de cada poção básica)
  FOR v_item IN
    SELECT id FROM game_items
    WHERE is_starter = true
      AND category = 'consumable'
  LOOP
    INSERT INTO user_inventory (user_id, item_id, quantity, equipped)
    VALUES (p_user_id, v_item.id, 2, false)
    ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = 2;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_starter_items(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_starter_items(UUID, TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. perform_class_respec: remover parâmetro de custo controlado pelo cliente
--    Custo fixo server-side (120 ouro). Primeiro respec verificado no servidor
--    via activity_log — não pode ser manipulado pelo cliente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.perform_class_respec(target_class TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Remover a versão antiga que aceitava respec_cost como parâmetro
DROP FUNCTION IF EXISTS public.perform_class_respec(TEXT, INTEGER);

REVOKE ALL ON FUNCTION public.perform_class_respec(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perform_class_respec(TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. has_active_subscription: validar que só consulta o próprio usuário
--    (SECURITY DEFINER + uuid param = qualquer auth pode checar outro usuário)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_active_subscription(
  user_uuid uuid,
  check_env text DEFAULT 'live'
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  -- auth.uid() IS NULL = chamada server-side (service_role/webhook) — permitido
  -- auth.uid() = user_uuid = usuário verificando a própria assinatura — permitido
  -- qualquer outra combinação = negado
  SELECT
    CASE
      WHEN auth.uid() IS NOT NULL AND auth.uid() <> user_uuid THEN false
      ELSE EXISTS (
        SELECT 1 FROM public.subscriptions
        WHERE user_id = user_uuid
          AND environment = check_env
          AND (
            (status IN ('active', 'trialing') AND (current_period_end IS NULL OR current_period_end > now()))
            OR (status = 'canceled' AND current_period_end > now())
          )
      )
    END;
$$;

REVOKE ALL ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. debug_sintonizado: função de debug exposta ao público — remover acesso
--    (exposição de dados internos do inventário a usuários anônimos)
-- ─────────────────────────────────────────────────────────────────────────────
-- Recriar com search_path fixo
CREATE OR REPLACE FUNCTION public.debug_sintonizado()
RETURNS TABLE(col_exists boolean, sample_value boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Restringe ao próprio usuário
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  RETURN QUERY
    SELECT
      true AS col_exists,
      sintonizado AS sample_value
    FROM public.user_inventory
    WHERE user_id = auth.uid()
    LIMIT 1;
EXCEPTION WHEN undefined_column THEN
  RETURN QUERY SELECT false, null::boolean;
END;
$$;

REVOKE ALL ON FUNCTION public.debug_sintonizado() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.debug_sintonizado() FROM anon;
GRANT EXECUTE ON FUNCTION public.debug_sintonizado() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. is_system_admin: adicionar SET search_path (search path mutável = risco)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

REVOKE ALL ON FUNCTION public.is_system_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_system_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_system_admin() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Subscriptions RLS: garantir que RLS está ativo e sem gap de service_role
--    (auth.role() = 'service_role' nunca é verdadeiro em políticas RLS,
--     pois service_role bypassa RLS diretamente — a política é inócua mas
--     confusa; substituímos por política explícita de INSERT/UPDATE via função)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Remove a política de service_role ineficaz (service_role já bypassa RLS)
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON public.subscriptions;

-- Garante que usuário só vê a própria linha
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Usuários autenticados não podem inserir/atualizar — somente via webhook (service_role)
-- O service_role bypassa RLS automaticamente, então não precisa de política explícita.
