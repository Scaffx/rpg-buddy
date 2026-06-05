-- D (parte 1): pets da loja — minis de boss, fortes e caros, comprados em ouro.
-- Catálogo data-driven (preço/stats ajustáveis sem código).
CREATE TABLE IF NOT EXISTS public.pet_catalog (
  pet_type text PRIMARY KEY,
  name     text NOT NULL,
  emoji    text NOT NULL,
  role     text NOT NULL,          -- physical | magic | support
  atk      int  NOT NULL,
  def      int  NOT NULL,
  hp       int  NOT NULL,
  mp       int  NOT NULL,
  price    int  NOT NULL,          -- em ouro
  sort     int  NOT NULL DEFAULT 0
);

ALTER TABLE public.pet_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pet_catalog readable" ON public.pet_catalog;
CREATE POLICY "pet_catalog readable" ON public.pet_catalog FOR SELECT USING (true);

INSERT INTO public.pet_catalog (pet_type, name, emoji, role, atk, def, hp, mp, price, sort) VALUES
  ('mini_relampago',     'Mini Wyvern Relâmpago', '⚡', 'physical', 55, 18, 180, 40, 2800, 1),
  ('mini_leviata',       'Mini Leviatã Cósmico',  '🐉', 'magic',    42, 22, 200, 90, 3500, 2),
  ('mini_kraken',        'Mini Kraken Abissal',   '🦑', 'support',  30, 32, 260,100, 4200, 3),
  ('mini_dragao_sombrio','Mini Dragão Sombrio',   '🐲', 'physical', 62, 26, 220, 55, 5000, 4),
  ('mini_demonio_fome',  'Mini Demônio da Fome',  '👹', 'physical', 70, 24, 200, 60, 6000, 5)
ON CONFLICT (pet_type) DO NOTHING;

-- buy_pet: compra server-authoritative (deduz ouro, cria companheiro com stats do catálogo).
CREATE OR REPLACE FUNCTION public.buy_pet(p_pet_type text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pet public.pet_catalog%ROWTYPE;
  v_gold int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_pet FROM public.pet_catalog WHERE pet_type = p_pet_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pet inválido.'; END IF;

  IF EXISTS (SELECT 1 FROM public.companions WHERE user_id = v_uid AND companion_type = p_pet_type) THEN
    RAISE EXCEPTION 'Você já possui este pet.';
  END IF;

  SELECT gold INTO v_gold FROM public.user_balance WHERE user_id = v_uid;
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

REVOKE EXECUTE ON FUNCTION public.buy_pet(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.buy_pet(text) TO authenticated;
