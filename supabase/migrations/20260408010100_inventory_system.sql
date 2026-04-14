-- ═══════════════════════════════════════════════════════════════════════════════
-- SISTEMA DE INVENTÁRIO COMPLETO
-- Tabela de inventário, itens de equipamento, itens iniciais por classe,
-- loja de equipamentos e limpeza de inventário placeholder
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Tabela de itens do jogo (catálogo geral) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.game_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('weapon', 'armor', 'consumable', 'accessory')),
  rarity TEXT NOT NULL DEFAULT 'comum' CHECK (rarity IN ('comum', 'incomum', 'raro', 'epico', 'lendario')),
  icon TEXT NOT NULL DEFAULT '📦',
  stat_label TEXT,          -- ex: "+5 ATK", "+8 DEF"
  effect TEXT,              -- efeito ao usar (consumíveis)
  is_starter BOOLEAN NOT NULL DEFAULT false,
  starter_class TEXT,       -- classe associada (se for item inicial)
  shop_price INTEGER,       -- preço na loja (null = não vendável)
  stackable BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Tabela de inventário do usuário ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  item_id UUID NOT NULL REFERENCES public.game_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  equipped BOOLEAN NOT NULL DEFAULT false,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, item_id)
);

-- RLS
ALTER TABLE public.game_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view game items" ON public.game_items FOR SELECT USING (true);

CREATE POLICY "Users view own inventory" ON public.user_inventory FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own inventory" ON public.user_inventory FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own inventory" ON public.user_inventory FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own inventory" ON public.user_inventory FOR DELETE USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED: ITENS INICIAIS POR CLASSE
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Armas iniciais (1 por classe) ────────────────────────────────────────────
INSERT INTO public.game_items (name, description, category, rarity, icon, stat_label, is_starter, starter_class) VALUES
  ('Espada Curta',       'Lâmina confiável de um guerreiro iniciante.',       'weapon', 'comum', '⚔️', '+4 ATK',  true, 'guerreiro'),
  ('Grimorio Basico',   'Um tomo de feitiços elementares.',                   'weapon', 'comum', '📖', '+4 MATK', true, 'mago'),
  ('Adaga de Sombra',   'Lâmina silenciosa que corta a escuridão.',           'weapon', 'comum', '🗡️', '+3 ATK, +2 AGI', true, 'gatuno'),
  ('Martelo de Aco',    'Martelo sólido forjado para trabalho pesado.',       'weapon', 'comum', '🔨', '+5 ATK',  true, 'ferreiro'),
  ('Cajado de Luz',     'Cajado imbuído de energia divina.',                  'weapon', 'comum', '✨', '+3 MATK, +2 DEF', true, 'clerico'),
  ('Arco Curto',        'Arco leve e preciso para ataques rápidos.',          'weapon', 'comum', '🏹', '+3 ATK, +2 AGI', true, 'arqueiro'),
  ('Adaga de Treino',   'Uma adaga simples para novatos.',                    'weapon', 'comum', '🔪', '+2 ATK',  true, 'novato');

-- ── Armaduras iniciais (1 por classe) ────────────────────────────────────────
INSERT INTO public.game_items (name, description, category, rarity, icon, stat_label, is_starter, starter_class) VALUES
  ('Armadura Pesada de Ferro', 'Placas de ferro que cobrem o corpo inteiro. Pesada mas resistente.',  'armor', 'comum', '🛡️', '+8 DEF, -2 AGI',  true, 'guerreiro'),
  ('Túnica Arcana',            'Tecido encantado que amplifica a afinidade mágica.',                  'armor', 'comum', '🧥', '+3 DEF, +3 MATK', true, 'mago'),
  ('Roupas Leves de Sombra',   'Vestes escuras e flexíveis feitas para se mover sem ser visto.',      'armor', 'comum', '🥷', '+3 DEF, +3 AGI',  true, 'gatuno'),
  ('Gibão de Couro Reforçado', 'Couro curtido com reforços metálicos. Resistente e funcional.',       'armor', 'comum', '🦺', '+5 DEF, +1 ATK',  true, 'ferreiro'),
  ('Hábito Sagrado',           'Vestimenta clerical inspirada nos sacerdotes de Prontera.',           'armor', 'comum', '⛪', '+4 DEF, +2 MATK', true, 'clerico'),
  ('Capa do Vento',            'Capa leve com armadura interior. Ideal para mobilidade e proteção.', 'armor', 'comum', '🧣', '+3 DEF, +3 AGI',  true, 'arqueiro'),
  ('Roupas de Aprendiz',       'Vestimenta simples de quem está começando.',                          'armor', 'comum', '👕', '+2 DEF',           true, 'novato');

-- ── Consumíveis iniciais (todos recebem) ─────────────────────────────────────
INSERT INTO public.game_items (name, description, category, rarity, icon, stat_label, effect, is_starter, stackable) VALUES
  ('Poção de Vida Básica',  'Restaura uma pequena quantidade de HP.',  'consumable', 'comum', '🧪', '+30 HP',  'heal_30',  true, true),
  ('Poção de Mana Básica',  'Restaura uma pequena quantidade de MP.',  'consumable', 'comum', '🔵', '+20 MP',  'mana_20',  true, true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED: ITENS DA LOJA DE EQUIPAMENTOS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Armas (loja) ─────────────────────────────────────────────────────────────
INSERT INTO public.game_items (name, description, category, rarity, icon, stat_label, shop_price) VALUES
  ('Espada Longa',         'Lâmina equilibrada entre força e velocidade.',      'weapon', 'incomum', '⚔️', '+7 ATK',          80),
  ('Cajado de Cristal',    'Cristal azul que canaliza poder arcano.',           'weapon', 'incomum', '🔮', '+7 MATK',         85),
  ('Arco Composto',        'Arco com tensão superior para tiros potentes.',    'weapon', 'incomum', '🏹', '+5 ATK, +3 AGI',  90),
  ('Adaga Envenenada',     'Lâmina banhada em veneno de aranha gigante.',      'weapon', 'raro',    '🗡️', '+6 ATK, +4 AGI',  150),
  ('Martelo de Guerra',    'Martelo massivo que causa dano devastador.',        'weapon', 'raro',    '🔨', '+10 ATK, -1 AGI', 160),
  ('Báculo do Crepúsculo', 'Canaliza magia das sombras e da luz.',            'weapon', 'raro',    '✨', '+10 MATK',         170),
  ('Lâmina do Trovão',     'Espada imbuída com energia elétrica.',             'weapon', 'epico',   '⚡', '+14 ATK, +3 AGI', 350),
  ('Arco dos Ventos',      'Flechas ganham velocidade sobre-humana.',          'weapon', 'epico',   '🌪️', '+10 ATK, +7 AGI', 360);

-- ── Armaduras (loja) ─────────────────────────────────────────────────────────
INSERT INTO public.game_items (name, description, category, rarity, icon, stat_label, shop_price) VALUES
  ('Cota de Malha',        'Malha de aço que oferece proteção sólida.',         'armor', 'incomum', '🛡️', '+6 DEF',          70),
  ('Manto do Sábio',       'Tecido encantado que fortalece a mente.',          'armor', 'incomum', '🧥', '+4 DEF, +4 MATK', 75),
  ('Colete de Caçador',    'Couro leve com bolsos para suprimentos.',          'armor', 'incomum', '🦺', '+4 DEF, +3 AGI',  70),
  ('Armadura de Placas',   'Placas de aço temperado. Proteção superior.',      'armor', 'raro',    '🛡️', '+12 DEF, -3 AGI', 180),
  ('Túnica do Arcano',     'Amplifica drasticamente o poder mágico.',          'armor', 'raro',    '🧥', '+6 DEF, +7 MATK', 190),
  ('Manto da Sombra',      'Torna o portador quase invisível.',               'armor', 'raro',    '🥷', '+5 DEF, +7 AGI',  175),
  ('Peitoral do Dragão',   'Forjado com escamas de dragão vermelho.',          'armor', 'epico',   '🐉', '+18 DEF, +3 ATK', 400),
  ('Vestes Celestiais',    'Roupas tecidas com fios de luz divina.',           'armor', 'epico',   '👼', '+10 DEF, +10 MATK', 420);

-- ── Acessórios (loja) ───────────────────────────────────────────────────────
INSERT INTO public.game_items (name, description, category, rarity, icon, stat_label, shop_price) VALUES
  ('Anel de Vitalidade',   'Aumenta a regeneração de vida.',                   'accessory', 'incomum', '💍', '+15 HP max',     60),
  ('Amuleto de Foco',      'Melhora a concentração e precisão.',               'accessory', 'incomum', '📿', '+3 ATK, +2 MATK', 65),
  ('Bota de Velocidade',   'Sola encantada que aumenta a agilidade.',          'accessory', 'raro',    '👢', '+8 AGI',         140),
  ('Colar do Sábio',       'Amplifica sabedoria e poder mágico.',              'accessory', 'raro',    '📿', '+6 MATK, +3 DEF', 145),
  ('Anel do Berserker',    'Aumenta ataque mas reduz defesa.',                 'accessory', 'raro',    '💍', '+10 ATK, -3 DEF', 130),
  ('Amuleto do Guardião',  'Proteção divina contra ataques críticos.',         'accessory', 'epico',   '🛡️', '+8 DEF, +5 HP max', 300);

-- ── Consumíveis (loja) ──────────────────────────────────────────────────────
INSERT INTO public.game_items (name, description, category, rarity, icon, stat_label, effect, shop_price, stackable) VALUES
  ('Poção de Vida',          'Restaura HP moderado.',                 'consumable', 'comum',   '🧪', '+60 HP',  'heal_60',     15, true),
  ('Poção de Vida Grande',   'Restaura grande quantidade de HP.',     'consumable', 'incomum', '🧪', '+120 HP', 'heal_120',    35, true),
  ('Poção de Mana',          'Restaura MP moderado.',                 'consumable', 'comum',   '🔵', '+40 MP',  'mana_40',     15, true),
  ('Poção de Mana Grande',   'Restaura grande quantidade de MP.',     'consumable', 'incomum', '🔵', '+80 MP',  'mana_80',     35, true),
  ('Elixir de Força',        'Aumenta ATK temporariamente.',          'consumable', 'raro',    '💪', '+5 ATK (1 batalha)', 'buff_atk_5',  50, true),
  ('Elixir de Proteção',     'Aumenta DEF temporariamente.',          'consumable', 'raro',    '🛡️', '+5 DEF (1 batalha)', 'buff_def_5',  50, true),
  ('Fruta Dourada',          'Concede XP bônus.',                     'consumable', 'raro',    '🍎', '+150 XP', 'xp_150',      60, true),
  ('Antídoto',               'Remove efeitos negativos.',             'consumable', 'comum',   '💊', 'Cura status', 'cure_status', 10, true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNÇÃO: dar itens iniciais ao completar onboarding
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.grant_starter_items(p_user_id UUID, p_class TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
BEGIN
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

-- Permissões
REVOKE ALL ON FUNCTION public.grant_starter_items(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_starter_items(UUID, TEXT) TO authenticated;
