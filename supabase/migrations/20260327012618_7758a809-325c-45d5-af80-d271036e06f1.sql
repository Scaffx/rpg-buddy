
-- Add classes table
CREATE TABLE public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  column_index integer NOT NULL DEFAULT 1,
  column_label text NOT NULL DEFAULT 'Início',
  level_min integer NOT NULL DEFAULT 1,
  level_max integer NOT NULL DEFAULT 5,
  description text,
  icon text NOT NULL DEFAULT '⚔️',
  parent_class_id uuid REFERENCES public.classes(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view classes" ON public.classes
  FOR SELECT TO public USING (true);

-- Add checklist_items table
CREATE TABLE public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid REFERENCES public.missions(id) ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  xp_bonus integer NOT NULL DEFAULT 2,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own checklist items" ON public.checklist_items
  FOR ALL TO public
  USING (
    EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_id AND m.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.missions m WHERE m.id = mission_id AND m.user_id = auth.uid())
  );

-- Add new columns to missions
ALTER TABLE public.missions ADD COLUMN days_of_week jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.missions ADD COLUMN horario_provavel text DEFAULT 'flex';

-- Add current_class_id to profiles
ALTER TABLE public.profiles ADD COLUMN current_class_id uuid REFERENCES public.classes(id);

-- Seed classes data
INSERT INTO public.classes (name, column_index, column_label, level_min, level_max, description, icon) VALUES
-- Column 1: Início
('Aprendiz', 1, 'Início', 1, 4, 'Todo herói começa aqui. Aprenda os fundamentos.', '📖'),
('Mercador', 1, 'Início', 1, 4, 'Conhecimento em negócios e trocas.', '💰'),
-- Column 2: Classe 1
('Espadachim', 2, 'Classe 1', 1, 4, 'Mestre da espada e combate corpo a corpo.', '⚔️'),
('Mago', 2, 'Classe 1', 1, 4, 'Estudioso das artes arcanas.', '🔮'),
('Gatuno', 2, 'Classe 1', 1, 4, 'Ágil e furtivo, mestre das sombras.', '🗡️'),
('Noviço', 2, 'Classe 1', 1, 4, 'Aprendiz das artes sagradas.', '✝️'),
('Arqueiro', 2, 'Classe 1', 1, 4, 'Precisão letal à distância.', '🏹'),
-- Column 3: Classe 2
('Cavaleiro', 3, 'Classe 2', 5, 14, 'Guerreiro honrado com armadura pesada.', '🛡️'),
('Templário', 3, 'Classe 2', 5, 14, 'Guerreiro sagrado com poderes divinos.', '⚜️'),
('Bruxo', 3, 'Classe 2', 5, 14, 'Mago sombrio com poderes proibidos.', '🌑'),
('Sábio', 3, 'Classe 2', 5, 14, 'Mestre do conhecimento e sabedoria.', '📜'),
('Assassino', 3, 'Classe 2', 5, 14, 'Mestre das artes letais silenciosas.', '🥷'),
('Monge', 3, 'Classe 2', 5, 14, 'Guerreiro espiritual com poderes internos.', '🧘'),
('Ranger', 3, 'Classe 2', 5, 14, 'Guardião das florestas e terras selvagens.', '🌿'),
-- Column 4: Transclasse
('Lorde', 4, 'Transclasse', 15, 24, 'Nobre guerreiro com poder de comando.', '👑'),
('Paladino', 4, 'Transclasse', 15, 24, 'Campeão da justiça e da luz.', '🌟'),
('Arquimago', 4, 'Transclasse', 15, 24, 'Mestre supremo das artes arcanas.', '🧙'),
('Necromante', 4, 'Transclasse', 15, 24, 'Senhor dos mortos e da escuridão.', '💀'),
('Mestre das Sombras', 4, 'Transclasse', 15, 24, 'Assassino lendário invisível.', '🌫️'),
('Alto Sacerdote', 4, 'Transclasse', 15, 24, 'Líder espiritual com poderes divinos.', '🙏'),
('Sentinela', 4, 'Transclasse', 15, 24, 'Guardião supremo das fronteiras.', '🦅'),
-- Column 5: Classe 3
('Cavaleiro Rúnico', 5, 'Classe 3', 25, 34, 'Guerreiro com runas de poder ancestral.', '🔷'),
('Guardião Real', 5, 'Classe 3', 25, 34, 'Protetor do reino com armadura lendária.', '🏰'),
('Arquimago Elemental', 5, 'Classe 3', 25, 34, 'Mestre dos quatro elementos.', '🌪️'),
('Senhor da Morte', 5, 'Classe 3', 25, 34, 'Dominador absoluto da necromancia.', '☠️'),
('Fantasma', 5, 'Classe 3', 25, 34, 'Existência entre os mundos, intocável.', '👻'),
('Oráculo', 5, 'Classe 3', 25, 34, 'Vidente do futuro com poderes cósmicos.', '🔮'),
('Mestre Caçador', 5, 'Classe 3', 25, 34, 'Caçador supremo de criaturas lendárias.', '🎯'),
-- Column 6: Classe 4
('Dragon Knight', 6, 'Classe 4', 35, 50, 'Cavaleiro dragão com poder devastador.', '🐉'),
('Imperial Guard', 6, 'Classe 4', 35, 50, 'Elite imperial, o melhor dos melhores.', '⚔️'),
('Archmage Supreme', 6, 'Classe 4', 35, 50, 'Poder arcano sem limites conhecidos.', '✨'),
('Death Lord', 6, 'Classe 4', 35, 50, 'Senhor absoluto da morte e renascimento.', '💎'),
('Void Walker', 6, 'Classe 4', 35, 50, 'Viajante do vazio, além da realidade.', '🌀'),
('Divino', 6, 'Classe 4', 35, 50, 'Ascendeu além da mortalidade.', '👼'),
('Lenda Viva', 6, 'Classe 4', 35, 50, 'O herói definitivo, cantado em lendas.', '🏆');
