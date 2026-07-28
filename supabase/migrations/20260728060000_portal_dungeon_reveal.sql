-- F7 — Lupas de Revelação.
--
-- Desde que cair fecha o portal de vez (F6), entrar às cegas virou aposta cara.
-- A lupa transforma esse risco em decisão informada, e o ouro gasto é mais um
-- ralo saudável: a torneira segue sendo só a rotina.

ALTER TABLE public.player_portal_fragments
  ADD COLUMN IF NOT EXISTS dungeon_reveal_level smallint NOT NULL DEFAULT 0
    CHECK (dungeon_reveal_level BETWEEN 0 AND 3);

COMMENT ON COLUMN public.player_portal_fragments.dungeon_reveal_level IS
  '0 = nada revelado; 1 = andares; 2 = + inimigos; 3 = + boss final e fraqueza. Zera quando uma nova masmorra pendente é sorteada.';

CREATE OR REPLACE FUNCTION public.buy_dungeon_reveal(p_level smallint, p_price integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_current smallint;
  v_pending text;
  v_gold    integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NOT_AUTHENTICATED';
  END IF;

  IF p_level IS NULL OR p_level < 1 OR p_level > 3 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_REVEAL_LEVEL';
  END IF;

  -- O preço vem do cliente por conveniência de exibição, mas é sanitizado aqui:
  -- nunca negativo e com teto, para que ninguém compre de graça nem por engano
  -- drene a bolsa.
  IF p_price IS NULL OR p_price < 0 OR p_price > 100000 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_PRICE';
  END IF;

  SELECT dungeon_reveal_level, pending_dungeon
    INTO v_current, v_pending
  FROM public.player_portal_fragments
  WHERE user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND OR v_pending IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_PENDING_DUNGEON';
  END IF;

  -- Revelação só anda para frente: comprar uma lupa igual ou menor não cobra.
  IF p_level <= COALESCE(v_current, 0) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ALREADY_REVEALED';
  END IF;

  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id = v_uid FOR UPDATE;
  IF COALESCE(v_gold, 0) < p_price THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INSUFFICIENT_GOLD';
  END IF;

  UPDATE public.user_balance
  SET gold = gold - p_price, updated_at = now()
  WHERE user_id = v_uid;

  UPDATE public.player_portal_fragments
  SET dungeon_reveal_level = p_level, updated_at = now()
  WHERE user_id = v_uid;

  RETURN jsonb_build_object('reveal_level', p_level, 'gold_spent', p_price);
END;
$$;

REVOKE ALL ON FUNCTION public.buy_dungeon_reveal(smallint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buy_dungeon_reveal(smallint, integer) TO authenticated;

-- A revelação vale para UMA masmorra. Quando outra é sorteada (ou a pendente é
-- consumida/perdida), o que foi revelado não vale mais.
--
-- Trigger em vez de alterar complete_portal_run: pega todos os caminhos que
-- mexem em pending_dungeon (sorteio, claim, expiração, derrota da F6) sem tocar
-- numa função longa que já está em produção.
CREATE OR REPLACE FUNCTION public.reset_dungeon_reveal_on_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.pending_dungeon IS DISTINCT FROM OLD.pending_dungeon THEN
    NEW.dungeon_reveal_level := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_dungeon_reveal ON public.player_portal_fragments;
CREATE TRIGGER trg_reset_dungeon_reveal
  BEFORE UPDATE ON public.player_portal_fragments
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_dungeon_reveal_on_change();

-- Estado da masmorra pendente e do quanto dela já foi revelado.
-- Função nova em vez de alterar get_my_fragments: ela está em produção e mudar
-- assinatura de função viva é risco desnecessário para um dado aditivo.
CREATE OR REPLACE FUNCTION public.get_dungeon_reveal()
RETURNS TABLE (
  pending_dungeon    text,
  reveal_level       smallint,
  dungeon_expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT f.pending_dungeon,
         COALESCE(f.dungeon_reveal_level, 0)::smallint,
         f.dungeon_expires_at
  FROM public.player_portal_fragments f
  WHERE f.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_dungeon_reveal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dungeon_reveal() TO authenticated;
