-- F8 — Pets se conquistam antes de se comprar.
--
-- Comprar um Mini Leviatã só com ouro tirava a graça: o pet não tinha história.
-- Agora é preciso derrotar a criatura grande equivalente antes — o mini vira
-- troféu ("eu ganhei esse"), e o combate ganha mais uma razão de existir sem
-- deixar de ser ralo: quem paga a conta continua sendo o ouro.

ALTER TABLE public.pet_catalog
  ADD COLUMN IF NOT EXISTS unlock_boss_id uuid REFERENCES public.bosses(id);

COMMENT ON COLUMN public.pet_catalog.unlock_boss_id IS
  'Boss que precisa ter sido derrotado para liberar a compra deste pet. NULL = sem exigência.';

-- Cada mini corresponde a um boss existente do bestiário.
UPDATE public.pet_catalog p
SET unlock_boss_id = b.id
FROM public.bosses b
WHERE p.unlock_boss_id IS NULL
  AND b.name = CASE p.pet_type
    WHEN 'mini_relampago'      THEN 'Wyvern Relâmpago'
    WHEN 'mini_leviata'        THEN 'Leviatã Primitivo'
    WHEN 'mini_kraken'         THEN 'Kraken Abissal'
    WHEN 'mini_necromante'     THEN 'Necromante Eterno'
    WHEN 'mini_dragao_sombrio' THEN 'Dragão Sombrio'
    WHEN 'mini_wyrm_gelo'      THEN 'Wyrm de Gelo Eterno'
    WHEN 'mini_demonio_fome'   THEN 'Demônio da Fome'
    ELSE NULL
  END;

-- Catálogo com o estado de desbloqueio de quem está olhando: a loja mostra
-- silhueta e o nome do que precisa ser derrotado, e revela a ficha só depois.
CREATE OR REPLACE FUNCTION public.get_pet_catalog()
RETURNS TABLE (
  pet_type      text,
  name          text,
  price         integer,
  role          text,
  emoji         text,
  sort          integer,
  unlock_boss   text,
  unlocked      boolean,
  owned         boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    p.pet_type,
    p.name,
    p.price,
    p.role,
    p.emoji,
    p.sort,
    b.name AS unlock_boss,
    (
      p.unlock_boss_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.boss_battles bb
        WHERE bb.user_id = auth.uid()
          AND bb.boss_id = p.unlock_boss_id
          AND bb.won = true
      )
    ) AS unlocked,
    EXISTS (
      SELECT 1 FROM public.companions c
      WHERE c.user_id = auth.uid() AND c.companion_type = p.pet_type
    ) AS owned
  FROM public.pet_catalog p
  LEFT JOIN public.bosses b ON b.id = p.unlock_boss_id
  ORDER BY p.sort;
$$;

REVOKE ALL ON FUNCTION public.get_pet_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pet_catalog() TO authenticated;

-- A trava real fica no servidor: a UI só reflete o que a RPC já garante.
CREATE OR REPLACE FUNCTION public.buy_pet(p_pet_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pet public.pet_catalog%ROWTYPE;
  v_gold int;
  v_boss_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_pet FROM public.pet_catalog WHERE pet_type = p_pet_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pet inválido.'; END IF;

  IF EXISTS (SELECT 1 FROM public.companions WHERE user_id = v_uid AND companion_type = p_pet_type) THEN
    RAISE EXCEPTION 'Você já possui este pet.';
  END IF;

  -- Conquistar antes de comprar.
  IF v_pet.unlock_boss_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.boss_battles bb
      WHERE bb.user_id = v_uid AND bb.boss_id = v_pet.unlock_boss_id AND bb.won = true
    ) THEN
      SELECT name INTO v_boss_name FROM public.bosses WHERE id = v_pet.unlock_boss_id;
      RAISE EXCEPTION 'Derrote % antes de chamar este companheiro.', COALESCE(v_boss_name, 'a criatura correspondente');
    END IF;
  END IF;

  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id = v_uid FOR UPDATE;
  IF COALESCE(v_gold, 0) < v_pet.price THEN
    RAISE EXCEPTION 'Ouro insuficiente — custa % de ouro.', v_pet.price;
  END IF;

  UPDATE public.user_balance SET gold = gold - v_pet.price, updated_at = now() WHERE user_id = v_uid;

  INSERT INTO public.gold_history (user_id, type, amount, reason)
  VALUES (v_uid, 'compra_pet', -v_pet.price, 'Compra de pet: ' || v_pet.name);

  INSERT INTO public.companions
    (user_id, companion_type, companion_role, origin, name, atk, def, max_hp, current_hp, max_mp, current_mp)
  VALUES
    (v_uid, p_pet_type, v_pet.role, 'shop', v_pet.name, v_pet.atk, v_pet.def, v_pet.hp, v_pet.hp, v_pet.mp, v_pet.mp);

  RETURN jsonb_build_object('ok', true, 'pet', v_pet.name, 'gold_spent', v_pet.price);
END;
$function$;
