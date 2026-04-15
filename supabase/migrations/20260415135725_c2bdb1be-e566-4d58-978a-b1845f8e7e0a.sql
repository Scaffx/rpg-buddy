
-- =============================================
-- 1. GAME ITEMS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.game_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon text NOT NULL DEFAULT '🗡️',
  category text NOT NULL DEFAULT 'weapon', -- weapon, armor, accessory, consumable
  rarity text NOT NULL DEFAULT 'comum', -- comum, incomum, raro, epico, lendario
  stat_label text, -- e.g. "+5 ATK, +3 DEF"
  atk_bonus integer NOT NULL DEFAULT 0,
  def_bonus integer NOT NULL DEFAULT 0,
  hp_bonus integer NOT NULL DEFAULT 0,
  mp_bonus integer NOT NULL DEFAULT 0,
  agi_bonus integer NOT NULL DEFAULT 0,
  crit_bonus integer NOT NULL DEFAULT 0,
  shop_price integer, -- null = not in shop
  stackable boolean NOT NULL DEFAULT false,
  is_consumable boolean NOT NULL DEFAULT false,
  effect text, -- e.g. heal_30, mana_20, full_rest
  level_required integer NOT NULL DEFAULT 1,
  is_starter boolean NOT NULL DEFAULT false,
  starter_class text, -- guerreiro, mago, etc.
  boss_drop_level integer, -- which boss level drops this
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view game items"
  ON public.game_items FOR SELECT
  USING (true);

-- =============================================
-- 2. USER INVENTORY TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS public.user_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.game_items(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  equipped boolean NOT NULL DEFAULT false,
  obtained_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, item_id)
);

ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own inventory"
  ON public.user_inventory FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own inventory"
  ON public.user_inventory FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own inventory"
  ON public.user_inventory FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own inventory"
  ON public.user_inventory FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- =============================================
-- 3. ADD starter_kit_claimed TO profiles
-- =============================================
-- Safety repair: some remote environments have migration history but are missing public.profiles.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text DEFAULT 'Aventureiro',
  avatar_url text,
  level integer NOT NULL DEFAULT 1,
  total_xp integer NOT NULL DEFAULT 0,
  xp_today integer NOT NULL DEFAULT 0,
  missions_completed integer NOT NULL DEFAULT 0,
  current_class_id uuid,
  onboarding_completed boolean NOT NULL DEFAULT false,
  starter_class text,
  starter_item text,
  last_name_change timestamptz DEFAULT NULL,
  region text DEFAULT NULL,
  boss_keys integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can view own profile'
  ) THEN
    CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can insert own profile'
  ) THEN
    CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS starter_kit_claimed boolean NOT NULL DEFAULT false;

-- =============================================
-- 4. STARTER ITEMS BY CLASS
-- =============================================

-- Guerreiro starters
INSERT INTO public.game_items (name, description, icon, category, rarity, stat_label, atk_bonus, def_bonus, hp_bonus, level_required, is_starter, starter_class)
VALUES
  ('Espada Curta', 'Arma inicial do Guerreiro. Simples, mas confiável.', '⚔️', 'weapon', 'comum', '+8 ATK, +2 DEF', 8, 2, 0, 1, true, 'guerreiro'),
  ('Escudo de Madeira', 'Escudo básico do Guerreiro.', '🛡️', 'armor', 'comum', '+6 DEF, +10 HP', 0, 6, 10, 1, true, 'guerreiro'),
  ('Anel de Vigor', 'Acessório inicial do Guerreiro.', '💍', 'accessory', 'comum', '+5 HP, +2 DEF', 0, 2, 5, 1, true, 'guerreiro');

-- Mago starters
INSERT INTO public.game_items (name, description, icon, category, rarity, stat_label, atk_bonus, def_bonus, mp_bonus, level_required, is_starter, starter_class)
VALUES
  ('Grimório Básico', 'Arma mágica inicial do Mago.', '📖', 'weapon', 'comum', '+8 ATK, +5 MP', 8, 0, 5, 1, true, 'mago'),
  ('Manto Arcano', 'Armadura mágica do Mago.', '🧥', 'armor', 'comum', '+3 DEF, +8 MP', 0, 3, 8, 1, true, 'mago'),
  ('Amuleto de Mana', 'Acessório inicial do Mago.', '🔮', 'accessory', 'comum', '+10 MP, +1 DEF', 0, 1, 10, 1, true, 'mago');

-- Gatuno starters
INSERT INTO public.game_items (name, description, icon, category, rarity, stat_label, atk_bonus, agi_bonus, crit_bonus, level_required, is_starter, starter_class)
VALUES
  ('Adaga de Sombra', 'Arma furtiva do Gatuno.', '🗡️', 'weapon', 'comum', '+6 ATK, +4 AGI, +3% CRIT', 6, 4, 3, 1, true, 'gatuno'),
  ('Capa Noturna', 'Armadura leve do Gatuno.', '🧣', 'armor', 'comum', '+3 DEF, +5 AGI', 0, 5, 0, 1, true, 'gatuno'),
  ('Anel da Sorte', 'Acessório do Gatuno.', '🍀', 'accessory', 'comum', '+2 AGI, +5% CRIT', 0, 2, 5, 1, true, 'gatuno');

-- Ferreiro starters
INSERT INTO public.game_items (name, description, icon, category, rarity, stat_label, atk_bonus, def_bonus, hp_bonus, level_required, is_starter, starter_class)
VALUES
  ('Martelo de Aço', 'Arma pesada do Ferreiro.', '🔨', 'weapon', 'comum', '+10 ATK, +3 DEF', 10, 3, 0, 1, true, 'ferreiro'),
  ('Avental Reforçado', 'Armadura robusta do Ferreiro.', '🦺', 'armor', 'comum', '+8 DEF, +15 HP', 0, 8, 15, 1, true, 'ferreiro'),
  ('Bracelete de Forja', 'Acessório do Ferreiro.', '⚙️', 'accessory', 'comum', '+4 DEF, +5 HP', 0, 4, 5, 1, true, 'ferreiro');

-- Clérigo starters
INSERT INTO public.game_items (name, description, icon, category, rarity, stat_label, atk_bonus, def_bonus, hp_bonus, mp_bonus, level_required, is_starter, starter_class)
VALUES
  ('Cajado de Luz', 'Arma sagrada do Clérigo.', '✨', 'weapon', 'comum', '+5 ATK, +8 MP', 5, 0, 0, 8, 1, true, 'clerico'),
  ('Manto Sagrado', 'Armadura do Clérigo.', '👘', 'armor', 'comum', '+5 DEF, +10 HP, +5 MP', 0, 5, 10, 5, 1, true, 'clerico'),
  ('Rosário Divino', 'Acessório do Clérigo.', '📿', 'accessory', 'comum', '+3 DEF, +8 MP', 0, 3, 0, 8, 1, true, 'clerico');

-- Arqueiro starters
INSERT INTO public.game_items (name, description, icon, category, rarity, stat_label, atk_bonus, agi_bonus, crit_bonus, level_required, is_starter, starter_class)
VALUES
  ('Arco Curto', 'Arma ágil do Arqueiro.', '🏹', 'weapon', 'comum', '+7 ATK, +3 AGI, +2% CRIT', 7, 3, 2, 1, true, 'arqueiro'),
  ('Couraça Leve', 'Armadura do Arqueiro.', '🎽', 'armor', 'comum', '+4 DEF, +4 AGI', 0, 4, 0, 1, true, 'arqueiro'),
  ('Pulseira do Vento', 'Acessório do Arqueiro.', '💨', 'accessory', 'comum', '+3 AGI, +3% CRIT', 0, 3, 3, 1, true, 'arqueiro');

-- Novato starters
INSERT INTO public.game_items (name, description, icon, category, rarity, stat_label, atk_bonus, def_bonus, hp_bonus, level_required, is_starter, starter_class)
VALUES
  ('Adaga de Treino', 'Arma básica do Novato.', '🔪', 'weapon', 'comum', '+5 ATK', 5, 0, 0, 1, true, 'novato'),
  ('Túnica Simples', 'Armadura do Novato.', '👕', 'armor', 'comum', '+3 DEF, +5 HP', 0, 3, 5, 1, true, 'novato'),
  ('Cordão Velho', 'Acessório do Novato.', '📿', 'accessory', 'comum', '+2 DEF', 0, 2, 0, 1, true, 'novato');

-- =============================================
-- 5. CONSUMABLES
-- =============================================
INSERT INTO public.game_items (name, description, icon, category, rarity, stat_label, stackable, is_consumable, effect, shop_price, level_required)
VALUES
  ('Poção de HP Menor', 'Restaura 30 HP.', '🧪', 'consumable', 'comum', 'Restaura 30 HP', true, true, 'heal_30', 15, 1),
  ('Poção de HP Média', 'Restaura 80 HP.', '🧪', 'consumable', 'incomum', 'Restaura 80 HP', true, true, 'heal_80', 40, 5),
  ('Poção de HP Grande', 'Restaura 200 HP.', '🧪', 'consumable', 'raro', 'Restaura 200 HP', true, true, 'heal_200', 100, 15),
  ('Poção de MP Menor', 'Restaura 20 MP.', '💧', 'consumable', 'comum', 'Restaura 20 MP', true, true, 'mana_20', 15, 1),
  ('Poção de MP Média', 'Restaura 60 MP.', '💧', 'consumable', 'incomum', 'Restaura 60 MP', true, true, 'mana_60', 40, 5),
  ('Elixir de Descanso', 'Restaura HP, MP e remove fadiga.', '⭐', 'consumable', 'epico', 'Restauração total', true, true, 'full_rest', 250, 10);

-- =============================================
-- 6. BOSS DROP ITEMS (Levels 1-60)
-- =============================================

-- Block 1 (Lv 1-5) - Comum/Incomum drops
INSERT INTO public.game_items (name, icon, category, rarity, stat_label, atk_bonus, def_bonus, hp_bonus, mp_bonus, agi_bonus, crit_bonus, level_required, boss_drop_level, description) VALUES
  ('Presa do Lobo', '🦷', 'accessory', 'incomum', '+3 ATK, +2 AGI', 3, 0, 0, 0, 2, 0, 1, 1, 'Presa arrancada do Lobo Alfa.'),
  ('Escama de Serpente', '🐍', 'armor', 'incomum', '+4 DEF, +5 HP', 0, 4, 5, 0, 0, 0, 2, 2, 'Escamas resistentes da Serpente do Pântano.'),
  ('Garra do Urso', '🐻', 'weapon', 'incomum', '+10 ATK, +3 DEF', 10, 3, 0, 0, 0, 0, 3, 3, 'Garra afiada do Urso da Montanha.'),
  ('Teia da Aranha', '🕷️', 'accessory', 'incomum', '+4 AGI, +3% CRIT', 0, 0, 0, 0, 4, 3, 4, 4, 'Fio resistente da Aranha Colossal.'),
  ('Chifre do Javali', '🐗', 'weapon', 'raro', '+14 ATK, +5 HP', 14, 0, 5, 0, 0, 0, 5, 5, 'Chifre imponente do Javali Couraçado.');

-- Block 2 (Lv 6-10)
INSERT INTO public.game_items (name, icon, category, rarity, stat_label, atk_bonus, def_bonus, hp_bonus, mp_bonus, agi_bonus, crit_bonus, level_required, boss_drop_level, description) VALUES
  ('Cristal de Gelo', '❄️', 'accessory', 'raro', '+6 ATK, +8 MP', 6, 0, 0, 8, 0, 0, 6, 6, 'Fragmento de poder do Golem de Gelo.'),
  ('Tocha Espiritual', '🔥', 'weapon', 'raro', '+16 ATK, +4% CRIT', 16, 0, 0, 0, 0, 4, 7, 7, 'Chama que nunca se apaga do Espírito da Floresta.'),
  ('Coroa de Espinhos', '👑', 'armor', 'raro', '+10 DEF, +15 HP', 0, 10, 15, 0, 0, 0, 8, 8, 'Coroa do Rei dos Espinhos.'),
  ('Asa Sombria', '🦇', 'accessory', 'raro', '+8 AGI, +5% CRIT', 0, 0, 0, 0, 8, 5, 9, 9, 'Asa da Quimera Sombria.'),
  ('Elmo do Dragão', '🐲', 'armor', 'epico', '+14 DEF, +20 HP, +5 ATK', 5, 14, 20, 0, 0, 0, 10, 10, 'Elmo forjado das escamas do Dragão Jovem.');

-- Block 3 (Lv 11-15)
INSERT INTO public.game_items (name, icon, category, rarity, stat_label, atk_bonus, def_bonus, hp_bonus, mp_bonus, agi_bonus, crit_bonus, level_required, boss_drop_level, description) VALUES
  ('Lâmina Envenenada', '🗡️', 'weapon', 'raro', '+18 ATK, +5 AGI', 18, 0, 0, 0, 5, 0, 11, 11, 'Lâmina que goteja veneno do Escorpião Gigante.'),
  ('Escudo Morto-Vivo', '💀', 'armor', 'raro', '+12 DEF, +10 HP', 0, 12, 10, 0, 0, 0, 12, 12, 'Escudo negro do Cavaleiro Morto-Vivo.'),
  ('Orbe de Trevas', '🔮', 'accessory', 'epico', '+10 ATK, +15 MP', 10, 0, 0, 15, 0, 0, 13, 13, 'Esfera de energia sombria do Lich Menor.'),
  ('Pele do Troll', '🧟', 'armor', 'raro', '+15 DEF, +25 HP', 0, 15, 25, 0, 0, 0, 14, 14, 'Couro regenerativo do Troll das Cavernas.'),
  ('Dente do Basilisco', '🦎', 'weapon', 'epico', '+24 ATK, +6% CRIT', 24, 0, 0, 0, 0, 6, 15, 15, 'Presa petrificante do Basilisco.');

-- Block 4 (Lv 16-20)
INSERT INTO public.game_items (name, icon, category, rarity, stat_label, atk_bonus, def_bonus, hp_bonus, mp_bonus, agi_bonus, crit_bonus, level_required, boss_drop_level, description) VALUES
  ('Gema Demoníaca', '💎', 'accessory', 'epico', '+12 ATK, +10 MP, +5 AGI', 12, 0, 0, 10, 5, 0, 16, 16, 'Gema pulsante do Demônio Menor.'),
  ('Cajado Amaldiçoado', '🪄', 'weapon', 'epico', '+22 ATK, +20 MP', 22, 0, 0, 20, 0, 0, 17, 17, 'Cajado roubado da Bruxa do Pântano.'),
  ('Armadura de Ossos', '🦴', 'armor', 'epico', '+18 DEF, +30 HP', 0, 18, 30, 0, 0, 0, 18, 18, 'Armadura do Senhor dos Ossos.'),
  ('Anel da Hidra', '🐉', 'accessory', 'epico', '+8 ATK, +8 DEF, +8 AGI', 8, 8, 0, 0, 8, 0, 19, 19, 'Anel encantado da Hidra das Ruínas.'),
  ('Lâmina Abissal', '⚔️', 'weapon', 'lendario', '+35 ATK, +10 DEF, +8% CRIT', 35, 10, 0, 0, 0, 8, 20, 20, 'Arma forjada nas profundezas pelo Abominável do Abismo.');

-- Block 5-8 (Lv 21-40) - Escalating rarity
INSERT INTO public.game_items (name, icon, category, rarity, stat_label, atk_bonus, def_bonus, hp_bonus, mp_bonus, agi_bonus, crit_bonus, level_required, boss_drop_level, description) VALUES
  ('Tridente Abissal', '🔱', 'weapon', 'epico', '+28 ATK, +12 MP', 28, 0, 0, 12, 0, 0, 21, 21, 'Arma da Hidra das Profundezas.'),
  ('Manto da Areia', '🏜️', 'armor', 'epico', '+16 DEF, +10 AGI', 0, 16, 0, 0, 10, 0, 23, 23, 'Manto que dança com o vento do deserto.'),
  ('Olho do Ciclope', '👁️', 'accessory', 'epico', '+15 ATK, +7% CRIT', 15, 0, 0, 0, 0, 7, 25, 25, 'O olho que tudo vê.'),
  ('Espada Flamejante', '🔥', 'weapon', 'lendario', '+40 ATK, +15 DEF', 40, 15, 0, 0, 0, 0, 27, 27, 'Forjada em lava viva.'),
  ('Coroa do Lich', '👑', 'armor', 'lendario', '+22 DEF, +40 HP, +25 MP', 0, 22, 40, 25, 0, 0, 30, 30, 'A coroa do Lich Supremo.'),
  ('Garras do Vampiro', '🧛', 'weapon', 'epico', '+32 ATK, +10 AGI, +5% CRIT', 32, 0, 0, 0, 10, 5, 32, 32, 'Garras que drenam a vida.'),
  ('Escudo da Fênix', '🔥', 'armor', 'lendario', '+25 DEF, +50 HP', 0, 25, 50, 0, 0, 0, 35, 35, 'Escudo que renova seu portador.'),
  ('Anel do Kraken', '🐙', 'accessory', 'lendario', '+12 ATK, +12 DEF, +12 AGI, +12 MP', 12, 12, 0, 12, 12, 0, 38, 38, 'Poder do oceano concentrado.'),
  ('Machado do Titã', '⚒️', 'weapon', 'lendario', '+50 ATK, +20 DEF, +10% CRIT', 50, 20, 0, 0, 0, 10, 40, 40, 'Arma do Titã de Ferro.');

-- Block 9-12 (Lv 41-60) - Legendary tier
INSERT INTO public.game_items (name, icon, category, rarity, stat_label, atk_bonus, def_bonus, hp_bonus, mp_bonus, agi_bonus, crit_bonus, level_required, boss_drop_level, description) VALUES
  ('Lâmina Celestial', '✨', 'weapon', 'lendario', '+55 ATK, +15 AGI', 55, 0, 0, 0, 15, 0, 42, 42, 'Forjada com luz estelar.'),
  ('Armadura do Caos', '🌀', 'armor', 'lendario', '+30 DEF, +60 HP, +20 MP', 0, 30, 60, 20, 0, 0, 45, 45, 'Armadura forjada no caos primordial.'),
  ('Amuleto da Eternidade', '♾️', 'accessory', 'lendario', '+15 ATK, +15 DEF, +15 AGI, +15 MP, +10% CRIT', 15, 15, 0, 15, 15, 10, 48, 48, 'Fragmento da eternidade.'),
  ('Foice do Ceifador', '⚰️', 'weapon', 'lendario', '+65 ATK, +12% CRIT', 65, 0, 0, 0, 0, 12, 50, 50, 'A arma da própria morte.'),
  ('Manto do Vazio', '🕳️', 'armor', 'lendario', '+35 DEF, +80 HP, +30 MP, +10 AGI', 0, 35, 80, 30, 10, 0, 53, 53, 'Tecido do espaço entre mundos.'),
  ('Coroa do Deus Caído', '👑', 'accessory', 'lendario', '+20 ATK, +20 DEF, +20 AGI, +20 MP, +15% CRIT', 20, 20, 0, 20, 20, 15, 55, 55, 'A coroa de um deus esquecido.'),
  ('Espada do Fim', '🗡️', 'weapon', 'lendario', '+80 ATK, +25 DEF, +15% CRIT', 80, 25, 0, 0, 0, 15, 58, 58, 'A última arma, forjada para o combate final.'),
  ('Armadura Divina', '🛡️', 'armor', 'lendario', '+45 DEF, +100 HP, +40 MP, +15 AGI', 0, 45, 100, 40, 15, 0, 60, 60, 'A proteção definitiva contra a Entidade do Vazio.');
