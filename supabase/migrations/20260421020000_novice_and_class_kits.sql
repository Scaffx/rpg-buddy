-- ═══════════════════════════════════════════════════════════════════════════════
-- Kit de Novato (lv1-4) e Kit de Classe (lv5)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Coluna para rastrear se o kit de classe (lv5) já foi concedido
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS class_kit_claimed boolean NOT NULL DEFAULT false;

-- ── Substituir itens de novato antigos pelos 4 novos ─────────────────────────
-- (safe: CASCADE cuida do user_inventory, e os itens antigos eram placeholder)
DELETE FROM public.game_items
  WHERE is_starter = true AND starter_class = 'novato';

-- Inserir os 4 itens de novato (lv1-4, stats mínimos)
INSERT INTO public.game_items (
  name, description, icon, category, rarity,
  stat_label, atk_bonus, def_bonus, matk_bonus, agi_bonus,
  hp_bonus, mp_bonus, crit_bonus,
  is_starter, starter_class, stackable, is_consumable, level_required
) VALUES
  (
    'Faca Pequena',
    'Uma faquinha enferrujada encontrada no chão. Serve para algo.',
    '🔪', 'weapon', 'comum',
    '+1 ATK', 1, 0, 0, 0, 0, 0, 0,
    true, 'novato', false, false, 1
  ),
  (
    'Roupa Rasgada',
    'Tecido surrado, cheio de buracos. Protege quase nada, mas é o que tem.',
    '🧣', 'armor', 'comum',
    '+1 DEF', 0, 1, 0, 0, 0, 0, 0,
    true, 'novato', false, false, 1
  ),
  (
    'Chapéu de Ovo',
    'Uma casca de ovo usada como chapéu. Decorativo, mas te faz sentir especial.',
    '🥚', 'accessory', 'comum',
    '+5 HP', 0, 0, 0, 0, 5, 0, 0,
    true, 'novato', false, false, 1
  ),
  (
    'Anel Barato',
    'Um anel de plástico colorido que você achou no chão.',
    '💍', 'accessory', 'comum',
    '+5 MP', 0, 0, 0, 0, 0, 5, 0,
    true, 'novato', false, false, 1
  );
