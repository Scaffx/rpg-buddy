-- Atribui shop_price para todos os equipamentos sem preço.
-- Fórmula simples: preço base por raridade × multiplicador por nível requerido,
-- ajustado pela soma de bônus do item (atk + matk + def*0.8 + hp*0.2 + mp*0.4).
UPDATE public.game_items
SET shop_price = GREATEST(
  20,
  ROUND(
    (
      CASE rarity
        WHEN 'lendario' THEN 400
        WHEN 'lendaria' THEN 400
        WHEN 'epico'   THEN 220
        WHEN 'epica'   THEN 220
        WHEN 'raro'    THEN 110
        WHEN 'rara'    THEN 110
        WHEN 'incomum' THEN 55
        ELSE 30
      END
      + (level_required * 8)
      + (atk_bonus * 6)
      + (matk_bonus * 6)
      + (def_bonus * 5)
      + (hp_bonus * 1.5)
      + (mp_bonus * 3)
    )::int
  )
)
WHERE shop_price IS NULL
  AND category IN ('weapon', 'armor', 'accessory')
  AND is_starter = false;

-- Garante alguns equipamentos básicos baratos por categoria caso a tabela esteja vazia
-- nessas categorias (no-op se já existem).
INSERT INTO public.game_items (name, category, rarity, icon, description, shop_price, level_required, atk_bonus, matk_bonus, def_bonus, hp_bonus, mp_bonus, stat_label)
SELECT * FROM (VALUES
  ('Adaga Iniciante',    'weapon',    'comum',   '🗡️', 'Lâmina simples, leve e confiável para os primeiros combates.',     35, 1, 4, 0, 0, 0, 0, 'ATK +4'),
  ('Cajado de Madeira',  'weapon',    'comum',   '🪄', 'Canaliza um pouco de mana — boa escolha para magos novatos.',      40, 1, 0, 4, 0, 0, 4, 'MATK +4 / MP +4'),
  ('Couraça de Couro',   'armor',     'comum',   '🛡️', 'Armadura leve de couro curtido. Defesa modesta com mobilidade.',    45, 1, 0, 0, 5, 8, 0, 'DEF +5 / HP +8'),
  ('Capuz do Caminhante','armor',     'comum',   '🧢', 'Protege a cabeça e ajuda a manter o foco em longas jornadas.',      40, 1, 0, 0, 3, 5, 3, 'DEF +3 / HP +5'),
  ('Anel de Cobre',      'accessory', 'comum',   '💍', 'Um anel simples, mas sua liga reflete um pouco da energia mágica.', 30, 1, 1, 1, 1, 0, 3, 'ATK/MATK +1 / MP +3'),
  ('Colar de Pétalas',   'accessory', 'comum',   '📿', 'Pétalas secas de flores raras concedem leve regeneração de mana.',  35, 1, 0, 2, 0, 0, 6, 'MATK +2 / MP +6')
) AS t(name, category, rarity, icon, description, shop_price, level_required, atk_bonus, matk_bonus, def_bonus, hp_bonus, mp_bonus, stat_label)
WHERE NOT EXISTS (
  SELECT 1 FROM public.game_items gi WHERE gi.name = t.name
);