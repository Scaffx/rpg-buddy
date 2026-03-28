
-- Shop items table
CREATE TABLE public.shop_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  cost_percent INTEGER NOT NULL DEFAULT 10,
  duration TEXT DEFAULT 'Instantâneo',
  icon TEXT NOT NULL DEFAULT '🎁',
  icon_color TEXT DEFAULT 'cyan',
  effect TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User balance table
CREATE TABLE public.user_balance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  balance_percent INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- User buffs table
CREATE TABLE public.user_buffs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  item_id UUID NOT NULL REFERENCES public.shop_items(id) ON DELETE CASCADE,
  purchased_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  active BOOLEAN NOT NULL DEFAULT true
);

-- RLS
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_buffs ENABLE ROW LEVEL SECURITY;

-- Anyone can view shop items
CREATE POLICY "Anyone can view shop items" ON public.shop_items FOR SELECT USING (true);

-- User balance policies
CREATE POLICY "Users can view own balance" ON public.user_balance FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own balance" ON public.user_balance FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own balance" ON public.user_balance FOR UPDATE USING (auth.uid() = user_id);

-- User buffs policies
CREATE POLICY "Users can view own buffs" ON public.user_buffs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own buffs" ON public.user_buffs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Seed shop items
INSERT INTO public.shop_items (name, description, cost_percent, duration, icon, icon_color, effect) VALUES
  ('Escudo 24h', 'Protege contra punições por 24h', 50, '24h', 'Shield', 'cyan', 'shield_24h'),
  ('Sessão TV', '1 episódio série/filme', 15, '50m', 'Tv', 'green', 'tv_session'),
  ('Descanso Total', 'Dia inteiro regenerativo', 40, '24h', 'BedDouble', 'purple', 'full_rest'),
  ('Refeição Livre', 'Coma o que quiser', 25, '1h30m', 'Utensils', 'orange', 'free_meal'),
  ('Jogar Videogame', '1h gameplay sem culpa', 20, '1h', 'Gamepad2', 'pink', 'gaming'),
  ('Saída Social', 'Tempo com amigos', 30, '3h', 'UsersRound', 'cyan', 'social'),
  ('Poção de XP', 'Dobra XP de missões por 12h', 35, '12h', 'FlaskConical', 'green', 'xp_boost'),
  ('Boost Atributo', '+50% em 1 atributo por 24h', 45, '24h', 'Sparkles', 'purple', 'attr_boost'),
  ('Auto-Complete', 'Completa 1 missão automática', 60, 'Instantâneo', 'Zap', 'orange', 'auto_complete'),
  ('Revive Missão', 'Ressuscita missão falhada', 25, 'Instantâneo', 'HeartPulse', 'pink', 'revive'),
  ('Tempo Extra', '+2h livres sem penalidade', 18, '2h', 'Clock', 'cyan', 'extra_time'),
  ('Buff Boss', '-20% dificuldade próximo boss', 55, 'Próximo boss', 'Skull', 'green', 'boss_debuff');
