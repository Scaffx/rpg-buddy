-- ================================================================
-- Sistema de Crafting: receitas + itens fabricáveis
-- ================================================================

-- Tabela de receitas
CREATE TABLE IF NOT EXISTS public.crafting_recipes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT,
  class_required   TEXT NOT NULL,
  item_output_id   UUID NOT NULL REFERENCES public.game_items(id) ON DELETE CASCADE,
  materials_cost   INTEGER NOT NULL DEFAULT 5,
  gold_cost        INTEGER NOT NULL DEFAULT 0,
  crafting_icon    TEXT DEFAULT '⚙️',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crafting_recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view crafting recipes"
  ON public.crafting_recipes FOR SELECT TO public USING (true);

-- ── Itens fabricáveis: Alquimista ────────────────────────────────
INSERT INTO public.game_items (
  name, description, icon, category, rarity,
  stat_label, atk_bonus, def_bonus, matk_bonus, agi_bonus,
  hp_bonus, mp_bonus, crit_bonus, shop_price, level_required,
  stackable, is_consumable, effect, is_starter, boss_drop_level
) VALUES
  (
    'Poção de Cura Menor',
    'Uma poção vermelha borbulhante feita pelo Alquimista. Restaura HP instantaneamente.',
    '🧪', 'consumable', 'comum',
    '+30 HP', 0, 0, 0, 0, 30, 0, 0, 0, 5,
    true, true, 'heal_hp_30', false, NULL
  ),
  (
    'Elixir de Concentração',
    'Elixir azulado que aguça a mente. Restaura energia mágica quando mais precisar.',
    '💧', 'consumable', 'incomum',
    '+20 MP', 0, 0, 0, 0, 0, 20, 0, 0, 8,
    true, true, 'restore_mp_20', false, NULL
  ),
  (
    'Elixir de Batalha',
    'Poção explosiva de cor dourada. Aumenta temporariamente a força de ataque em combate.',
    '⚗️', 'consumable', 'rara',
    '+8 ATK', 8, 0, 0, 0, 0, 0, 0, 0, 12,
    true, true, 'buff_atk_8', false, NULL
  );

-- ── Itens fabricáveis: Mecânico ──────────────────────────────────
INSERT INTO public.game_items (
  name, description, icon, category, rarity,
  stat_label, atk_bonus, def_bonus, matk_bonus, agi_bonus,
  hp_bonus, mp_bonus, crit_bonus, shop_price, level_required,
  stackable, is_consumable, effect, is_starter, boss_drop_level
) VALUES
  (
    'Adaga Artesanal',
    'Lâmina forjada à mão pelo Mecânico com materiais coletados em batalha. Leve e afiada.',
    '🔪', 'weapon', 'incomum',
    '+8 ATK +3% CRIT', 8, 0, 0, 0, 0, 0, 3, 0, 8,
    false, false, NULL, false, NULL
  ),
  (
    'Broquel Improvisado',
    'Escudo rústico construído com sucata e metal fundido. Surpreendentemente resistente.',
    '🛡️', 'armor', 'incomum',
    '+7 DEF +10 HP', 0, 7, 0, 0, 10, 0, 0, 0, 8,
    false, false, NULL, false, NULL
  ),
  (
    'Manopla de Engenheiro',
    'Luvas reforçadas com engrenagens e placas de metal. Combinam força e agilidade.',
    '🥊', 'accessory', 'rara',
    '+4 ATK +2 AGI', 4, 0, 0, 2, 0, 0, 0, 0, 15,
    false, false, NULL, false, NULL
  );

-- ── Receitas: Alquimista ─────────────────────────────────────────
INSERT INTO public.crafting_recipes (name, description, class_required, item_output_id, materials_cost, gold_cost, crafting_icon)
SELECT
  'Preparar Poção de Cura',
  'Misture ervas coletadas em batalha com água purificada. O resultado é uma poção que restaura 30 HP.',
  'Alquimista',
  gi.id,
  3,
  0,
  '🧪'
FROM public.game_items gi WHERE gi.name = 'Poção de Cura Menor' LIMIT 1;

INSERT INTO public.crafting_recipes (name, description, class_required, item_output_id, materials_cost, gold_cost, crafting_icon)
SELECT
  'Destilar Elixir de Concentração',
  'Um processo lento e preciso. Destile materiais arcanos para criar um elixir que restaura 20 MP.',
  'Alquimista',
  gi.id,
  5,
  10,
  '💧'
FROM public.game_items gi WHERE gi.name = 'Elixir de Concentração' LIMIT 1;

INSERT INTO public.crafting_recipes (name, description, class_required, item_output_id, materials_cost, gold_cost, crafting_icon)
SELECT
  'Forjar Elixir de Batalha',
  'Receita avançada de alquimia. Combina catalisadores raros para criar um buff temporário de +8 ATK.',
  'Alquimista',
  gi.id,
  8,
  20,
  '⚗️'
FROM public.game_items gi WHERE gi.name = 'Elixir de Batalha' LIMIT 1;

-- ── Receitas: Mecânico ────────────────────────────────────────────
INSERT INTO public.crafting_recipes (name, description, class_required, item_output_id, materials_cost, gold_cost, crafting_icon)
SELECT
  'Forjar Adaga Artesanal',
  'Afile os materiais coletados em batalha em uma bigorna improvisada. Rápida e letal.',
  'Mecânico',
  gi.id,
  5,
  0,
  '🔪'
FROM public.game_items gi WHERE gi.name = 'Adaga Artesanal' LIMIT 1;

INSERT INTO public.crafting_recipes (name, description, class_required, item_output_id, materials_cost, gold_cost, crafting_icon)
SELECT
  'Montar Broquel Improvisado',
  'Junte placas de metal e prenda-as com rebites. Não é bonito, mas funciona em combate.',
  'Mecânico',
  gi.id,
  7,
  15,
  '🛡️'
FROM public.game_items gi WHERE gi.name = 'Broquel Improvisado' LIMIT 1;

INSERT INTO public.crafting_recipes (name, description, class_required, item_output_id, materials_cost, gold_cost, crafting_icon)
SELECT
  'Construir Manopla de Engenheiro',
  'Engenharia aplicada ao combate. Combina engrenagens e metal reforçado para um acessório único.',
  'Mecânico',
  gi.id,
  10,
  30,
  '🥊'
FROM public.game_items gi WHERE gi.name = 'Manopla de Engenheiro' LIMIT 1;
