-- ============================================================
-- Sincronização completa da lista de bosses
-- 61 bosses — do Goblin Feroz (lv1) à Entidade do Vazio Absoluto (lv60)
-- Estratégia: ON CONFLICT (name) → atualiza apenas hp, level, xp_reward,
-- gold_reward e icon. Preserva ataque_base, defesa_base, element, skills,
-- description e keys_cost que possam ter sido configurados manualmente.
-- ============================================================

-- 1. Garantir índice único no nome (idempotente)
CREATE UNIQUE INDEX IF NOT EXISTS bosses_name_unique
  ON public.bosses (name);

-- 2. Remover bosses do MVP original apenas se não houver batalhas associadas
DELETE FROM public.bosses
  WHERE name IN (
    'Slime da Procrastinação',
    'Goblin da Distração',
    'Dragão da Preguiça',
    'Fênix do Caos',
    'Titan da Dúvida'
  )
  AND id NOT IN (SELECT DISTINCT boss_id FROM public.boss_battles);

-- 3. Upsert dos 61 bosses oficiais
--    keys_cost = CEIL(level / 2) aplicado apenas em INSERTs novos
INSERT INTO public.bosses
  (name, level, hp, xp_reward, gold_reward, icon, keys_cost)
VALUES
  -- ── Tier 1 (lv 1-5) ──
  ('Goblin Feroz',                    1,   93,    100,   25, '👺',     1),
  ('Lobo Cinzento',                   2,  111,    180,   40, '🐺',     1),
  ('Orc Selvagem',                    3,  129,    260,   55, '💪',     2),
  ('Aranha Gigante',                  4,  147,    340,   70, '🕷️',    2),
  ('Dragão Jovem',                    5,  165,    420,   85, '🐉',     3),
  -- ── Tier 2 (lv 6-10) ──
  ('Esqueleto Campeão',               6,  208,    500,  100, '💀',     3),
  ('Feiticeira das Sombras',          7,  226,    580,  115, '🧙‍♀️',  4),
  ('Centauro Ferido',                 8,  244,    660,  130, '🐎',     4),
  ('Golem de Pedra',                  9,  262,    740,  145, '🗿',     5),
  ('Fênix Renascente',               10,  280,    820,  160, '🔥',     5),
  -- ── Tier 3 (lv 11-15) ──
  ('Salamandra das Chamas',          11,  323,    900,  175, '🦎',     6),
  ('Sereia da Geleira',              12,  341,    980,  190, '🧊',     6),
  ('Fênix + Esfinge do Deserto',     12,  900,    980,  190, '🔥🦁',  6),
  ('Minotauro do Labirinto',         13,  359,   1060,  205, '🐂',     7),
  ('Sphinx do Deserto',              14,  377,   1140,  220, '🦁',     7),
  ('Titã da Antiga Floresta',        15,  395,   1220,  235, '🌳',     8),
  -- ── Tier 4 (lv 16-20) — inclui especiais ──
  ('Guerreiro Imortal',              16,  438,   1200,  300, '⚔️',    8),
  ('Rancor Sombrio',                 17,  456,   1380,  265, '👁️',    9),
  ('Manticora Venenosa',             18,  474,   1460,  280, '🦂',     9),
  ('Lorde Daemon',                   19,  492,   1540,  295, '😈',    10),
  ('Leviatã Primitivo',              20,  510,   1620,  310, '🐙',    10),
  -- ── Tier 5 (lv 21-30) ──
  ('Hidra das Profundezas',          21,  578,   1700,  325, '🐍',    11),
  ('Cavaleiro do Vazio',             22,  596,   1780,  340, '🗡️',   11),
  ('Wyvern Relâmpago',               23,  614,   1860,  355, '⚡',    12),
  ('Necromante Eterno',              24,  632,   1940,  370, '☠️',    12),
  ('Quimera Ancestral',              25,  650,   2020,  385, '🦅',    13),
  ('Elemental Primordial',           26,  718,   2100,  400, '🌀',    13),
  ('Dragão Sombrio',                 27,  736,   2180,  415, '🐲',    14),
  ('Guardião Celestial',             28,  754,   2260,  430, '👼',    14),
  ('Kraken Abissal',                 29,  772,   2340,  445, '🦑',    15),
  ('Imperador Draconiano',           30,  790,   2420,  460, '👑',    15),
  -- ── Tier 6 (lv 31-40) ──
  ('Lich Supremo',                   31,  858,   2500,  475, '💀',    16),
  ('Wyrm de Gelo Eterno',            32,  876,   2580,  490, '❄️',    16),
  ('Demônio da Fome',                33,  894,   2660,  505, '👹',    17),
  ('Golem de Adamantina',            34,  912,   2740,  520, '⛏️',   17),
  ('Árvore Maldita',                 35,  930,   2820,  535, '🌲',    18),
  ('Crononauta',                     36,  998,   2900,  550, '⏳',    18),
  ('Basilisco Imperial',             37, 1016,   2980,  565, '🦎',    19),
  ('Fenrir, Lobo do Ragnarok',       38, 1034,   3060,  580, '🐺',    19),
  ('Djinn do Deserto Infinito',      39, 1052,   3140,  595, '🧞',    20),
  ('Titã de Obsidiana',              40, 1070,   3220,  610, '🌋',    20),
  -- ── Tier 7 (lv 41-50) ──
  ('Esfinge Guardiã',                41, 1138,   3300,  625, '🏛️',   21),
  ('Dragão Espectral',               42, 1156,   3380,  640, '👻',    21),
  ('Behemoth de Cristal',            43, 1174,   3460,  655, '💎',    22),
  ('Serpente do Caos',               44, 1192,   3540,  670, '🐉',    22),
  ('Fênix Sombria',                  45, 1210,   3620,  685, '🔮',    23),
  ('Tiamat, Mãe dos Dragões',        46, 1278,   3700,  700, '🐲',    23),
  ('Odin, o Pai de Todos',           47, 1296,   3780,  715, '🦅',    24),
  ('Anúbis, Guardião dos Mortos',    48, 1314,   3860,  730, '⚱️',   24),
  ('Poseidon, Senhor dos Mares',     49, 1332,   3940,  745, '🔱',    25),
  ('Bahamut, Rei dos Dragões',       50, 1350,   4020,  760, '🌟',    25),
  -- ── Tier 8 (lv 51-60) — endgame ──
  ('Shinigami',                      51, 1418,   4100,  775, '💀',    26),
  ('Ifrit, Senhor do Fogo',          52, 1436,   4180,  790, '🔥',    26),
  ('Valquíria Suprema',              53, 1454,   4260,  805, '⚔️',   27),
  ('Leviathan Cósmico',              54, 1472,   4340,  820, '🌊',    27),
  ('Archlich Eterno',                55, 1490,   4420,  835, '🧙',    28),
  ('Lúcifer, Anjo Caído',            56, 1558,   4500,  850, '😈',    28),
  ('Chronos, Deus do Tempo',         57, 1576,   4580,  865, '⏰',    29),
  ('Ragnarök, Destruidor de Mundos', 58, 1594,   4660,  880, '🌑',    29),
  ('Gaia Corrompida',                59, 1612,   4740,  895, '🌍',    30),
  ('Entidade do Vazio Absoluto',     60, 1630,   4820,  910, '🕳️',   30)
ON CONFLICT (name) DO UPDATE SET
  level       = EXCLUDED.level,
  hp          = EXCLUDED.hp,
  xp_reward   = EXCLUDED.xp_reward,
  gold_reward = EXCLUDED.gold_reward,
  icon        = EXCLUDED.icon;
  -- keys_cost, ataque_base, defesa_base, element, skills, description
  -- são PRESERVADOS para não sobrescrever valores customizados

NOTIFY pgrst, 'reload schema';
