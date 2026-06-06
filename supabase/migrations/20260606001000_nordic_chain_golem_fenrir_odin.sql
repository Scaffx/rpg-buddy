-- Roadmap #5: cadeia nórdica (Golem Adamantina -> Picareta -> Resgate do Ferreiro
-- -> Fenrir aliado -> Odin 3v1 em fases com Thor + Loki).

-- 1) Flags de progresso da cadeia em hero_story_choices.
ALTER TABLE public.hero_story_choices
  ADD COLUMN IF NOT EXISTS picareta_adamantina boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ferreiro_rescued    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fenrir_allied       boolean NOT NULL DEFAULT false;

-- 2) Item de quest: Picareta de Adamantina (drop do Golem lv34; liberta o Ferreiro).
INSERT INTO public.game_items (name, description, icon, category, rarity, effect, level_required)
SELECT 'Picareta de Adamantina',
       'Forjada do núcleo do Golem. Capaz de quebrar correntes e rochas que prendem o Ferreiro.',
       '⛏️', 'quest', 'lendario', 'quest_picareta_adamantina', 1
WHERE NOT EXISTS (SELECT 1 FROM public.game_items WHERE effect = 'quest_picareta_adamantina');

-- 3) Odin em modo 3v1 (encontro em fases): HP maior + golpes de Thor e Loki no pool.
--    HP tunável; o combate continua na engine 1v1, com narrativa do trio.
UPDATE public.bosses
SET hp = 2400,
    hp_max = 2400,
    description = 'O Pai de Todos não luta sozinho: convoca Thor e Loki para a batalha final de Asgard.',
    skills = '[
      {"name":"Gungnir","desc":"Lança que nunca erra e causa dano sagrado crítico."},
      {"name":"Runas Antigas","desc":"Ativa runas que concedem diferentes poderes."},
      {"name":"Corvos de Odin","desc":"Huginn e Muninn revelam posições e fraquezas."},
      {"name":"Mjölnir de Thor","desc":"Thor entra na luta: martelada de trovão com dano pesado."},
      {"name":"Trapaça de Loki","desc":"Loki lança ilusões e maldições das sombras que enfraquecem seu próximo golpe."}
    ]'::jsonb
WHERE name ILIKE '%Odin%';
