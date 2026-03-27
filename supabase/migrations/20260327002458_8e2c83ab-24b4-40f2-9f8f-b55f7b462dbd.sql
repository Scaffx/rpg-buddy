
-- Timestamp update function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT DEFAULT 'Aventureiro',
  avatar_url TEXT,
  level INTEGER NOT NULL DEFAULT 1,
  total_xp INTEGER NOT NULL DEFAULT 0,
  xp_today INTEGER NOT NULL DEFAULT 0,
  missions_completed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Attributes table
CREATE TABLE public.attributes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '⭐',
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.attributes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own attributes" ON public.attributes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own attributes" ON public.attributes FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER update_attributes_updated_at BEFORE UPDATE ON public.attributes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', 'Aventureiro'));
  
  INSERT INTO public.attributes (user_id, name, icon, xp, level) VALUES
    (NEW.id, 'Força', '💪', 0, 1),
    (NEW.id, 'Inteligência', '🧠', 0, 1),
    (NEW.id, 'Sabedoria', '📚', 0, 1),
    (NEW.id, 'Carisma', '🗣️', 0, 1),
    (NEW.id, 'Vitalidade', '❤️', 0, 1),
    (NEW.id, 'Agilidade', '⚡', 0, 1),
    (NEW.id, 'Disciplina', '🎯', 0, 1),
    (NEW.id, 'Criatividade', '🎨', 0, 1),
    (NEW.id, 'Resiliência', '🛡️', 0, 1);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Missions table
CREATE TABLE public.missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  attribute_id UUID NOT NULL REFERENCES public.attributes(id) ON DELETE CASCADE,
  xp_reward INTEGER NOT NULL DEFAULT 25,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own missions" ON public.missions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own missions" ON public.missions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own missions" ON public.missions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own missions" ON public.missions FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_missions_updated_at BEFORE UPDATE ON public.missions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Bosses table
CREATE TABLE public.bosses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  hp INTEGER NOT NULL DEFAULT 100,
  level INTEGER NOT NULL DEFAULT 1,
  xp_reward INTEGER NOT NULL DEFAULT 100,
  icon TEXT NOT NULL DEFAULT '🐉',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.bosses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view bosses" ON public.bosses FOR SELECT USING (true);

-- Boss battles table
CREATE TABLE public.boss_battles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  boss_id UUID NOT NULL REFERENCES public.bosses(id) ON DELETE CASCADE,
  damage_dealt INTEGER NOT NULL DEFAULT 0,
  won BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.boss_battles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own battles" ON public.boss_battles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own battles" ON public.boss_battles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Activity log
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  description TEXT,
  xp_gained INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own activity" ON public.activity_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own activity" ON public.activity_log FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Insert default bosses
INSERT INTO public.bosses (name, description, hp, level, xp_reward, icon) VALUES
  ('Slime da Procrastinação', 'Um monstro gelatinoso que te faz adiar tudo', 50, 1, 50, '🟢'),
  ('Goblin da Distração', 'Rouba sua atenção com redes sociais', 80, 2, 75, '👺'),
  ('Dragão da Preguiça', 'O temível guardião do sofá', 120, 3, 100, '🐉'),
  ('Fênix do Caos', 'Renasce das cinzas da desorganização', 200, 5, 150, '🔥'),
  ('Titan da Dúvida', 'Questiona cada decisão que você toma', 300, 7, 200, '🗿');

-- Function to get rank based on level
CREATE OR REPLACE FUNCTION public.get_rank(user_level INTEGER)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE
    WHEN user_level >= 50 THEN 'Lendário'
    WHEN user_level >= 30 THEN 'Mestre'
    WHEN user_level >= 20 THEN 'Veterano'
    WHEN user_level >= 10 THEN 'Guerreiro'
    WHEN user_level >= 5 THEN 'Aprendiz'
    ELSE 'Novato'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
