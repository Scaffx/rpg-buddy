-- Roadmap #6: banco de perguntas do Quiz da Esfinge/Djinn.
-- Conteúdo em PT (a arena é PT). RLS: leitura pública (jogadores autenticados).
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question    text NOT NULL,
  options     jsonb NOT NULL,                 -- array de 4 strings
  correct_index int NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  difficulty  text NOT NULL DEFAULT 'easy' CHECK (difficulty IN ('easy','hard')),
  category    text NOT NULL DEFAULT 'geral',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quiz_questions_read ON public.quiz_questions;
CREATE POLICY quiz_questions_read ON public.quiz_questions
  FOR SELECT TO authenticated USING (true);

-- Seed (idempotente): perguntas fáceis e difíceis de conhecimento geral.
INSERT INTO public.quiz_questions (question, options, correct_index, difficulty, category)
SELECT q, o::jsonb, ci, d, 'geral'
FROM (VALUES
  -- ── Fáceis ──
  ('Qual é o maior planeta do Sistema Solar?', '["Terra","Júpiter","Marte","Saturno"]', 1, 'easy'),
  ('Quantos lados tem um triângulo?', '["2","3","4","5"]', 1, 'easy'),
  ('Qual é a capital do Brasil?', '["Rio de Janeiro","São Paulo","Brasília","Salvador"]', 2, 'easy'),
  ('Qual animal é conhecido como o "rei da selva"?', '["Tigre","Leão","Elefante","Urso"]', 1, 'easy'),
  ('Quantas cores tem o arco-íris?', '["5","6","7","8"]', 2, 'easy'),
  ('Qual é o resultado de 6 x 7?', '["36","42","48","49"]', 1, 'easy'),
  ('Em que continente fica o Egito?', '["Ásia","Europa","África","Oceania"]', 2, 'easy'),
  ('Qual gás as plantas absorvem na fotossíntese?', '["Oxigênio","Gás carbônico","Nitrogênio","Hidrogênio"]', 1, 'easy'),
  ('Quantos minutos há em uma hora?', '["30","45","60","90"]', 2, 'easy'),
  ('Qual é o oceano que banha a costa leste do Brasil?', '["Pacífico","Índico","Atlântico","Ártico"]', 2, 'easy'),
  ('Qual é a cor que se obtém misturando azul e amarelo?', '["Verde","Roxo","Laranja","Marrom"]', 0, 'easy'),
  ('Quem pintou a Mona Lisa?', '["Picasso","Da Vinci","Van Gogh","Michelangelo"]', 1, 'easy'),
  -- ── Difíceis ──
  ('Qual elemento químico tem o símbolo "Au"?', '["Prata","Ouro","Alumínio","Argônio"]', 1, 'hard'),
  ('Em que ano o homem pisou na Lua pela primeira vez?', '["1965","1969","1972","1959"]', 1, 'hard'),
  ('Qual é a montanha mais alta do mundo?', '["K2","Makalu","Everest","Kangchenjunga"]', 2, 'hard'),
  ('Quem escreveu "Dom Casmurro"?', '["José de Alencar","Machado de Assis","Eça de Queirós","Graciliano Ramos"]', 1, 'hard'),
  ('Qual é a velocidade aproximada da luz no vácuo?', '["300 mil km/s","150 mil km/s","30 mil km/s","1 milhão km/s"]', 0, 'hard'),
  ('Qual país tem a maior população do mundo (2023)?', '["China","Estados Unidos","Índia","Indonésia"]', 2, 'hard'),
  ('Qual é o osso mais longo do corpo humano?', '["Tíbia","Fêmur","Úmero","Rádio"]', 1, 'hard'),
  ('Quem desenvolveu a teoria da relatividade?', '["Newton","Einstein","Galileu","Bohr"]', 1, 'hard'),
  ('Qual é a moeda oficial do Japão?', '["Won","Yuan","Iene","Baht"]', 2, 'hard'),
  ('Quantos corações tem um polvo?', '["1","2","3","4"]', 2, 'hard'),
  ('Qual é o menor número primo?', '["0","1","2","3"]', 2, 'hard'),
  ('Em que país nasceu o filósofo Sócrates?', '["Itália","Egito","Grécia","Pérsia"]', 2, 'hard')
) AS seed(q, o, ci, d)
WHERE NOT EXISTS (SELECT 1 FROM public.quiz_questions LIMIT 1);
