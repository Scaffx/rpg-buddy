-- ============================================================
-- Rebuild class tree with correct names, levels, and hierarchy
-- Clears current_class_id from all profiles, deletes all old
-- class rows, then re-inserts the full tree with parent_class_id
-- correctly wired up.
-- ============================================================

-- 1. Detach all profiles from old class references
UPDATE public.profiles SET current_class_id = NULL;

-- 2. Remove all existing class rows (cascade will keep the FK valid)
DELETE FROM public.classes;

-- 3. Re-insert the full tree using a CTE to resolve parent names
-- We insert in order so that parent rows always exist before children.

-- ── TIER 1 ─────────────────────────────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000001-0000-0000-0000-000000000001', 'Aprendiz', 1, 'Início', 1, 4,
   'Todo herói começa aqui. Aprenda os fundamentos.', '📖', NULL);

-- ── TIER 2 — filhos de Aprendiz ────────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000002-0000-0000-0000-000000000001', 'Espadachim', 2, 'Classe 1', 5, 14,
   'Mestre da espada e combate corpo a corpo.', '⚔️',
   '00000001-0000-0000-0000-000000000001'),
  ('00000002-0000-0000-0000-000000000002', 'Mago', 2, 'Classe 1', 5, 14,
   'Estudioso das artes arcanas.', '🔮',
   '00000001-0000-0000-0000-000000000001'),
  ('00000002-0000-0000-0000-000000000003', 'Gatuno', 2, 'Classe 1', 5, 14,
   'Ágil e furtivo, mestre das sombras.', '🗡️',
   '00000001-0000-0000-0000-000000000001'),
  ('00000002-0000-0000-0000-000000000004', 'Ferreiro', 2, 'Classe 1', 5, 14,
   'Artesão de combate, mestre do trabalho duro.', '🔨',
   '00000001-0000-0000-0000-000000000001'),
  ('00000002-0000-0000-0000-000000000005', 'Noviço', 2, 'Classe 1', 5, 14,
   'Aprendiz das artes sagradas.', '✝️',
   '00000001-0000-0000-0000-000000000001'),
  ('00000002-0000-0000-0000-000000000006', 'Arqueiro', 2, 'Classe 1', 5, 14,
   'Precisão letal à distância.', '🏹',
   '00000001-0000-0000-0000-000000000001');

-- ── TIER 3 — filhos do Espadachim ──────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000003-0000-0000-0000-000000000001', 'Cavaleiro', 3, 'Classe 2', 15, 24,
   'Guerreiro honrado com armadura pesada.', '🛡️',
   '00000002-0000-0000-0000-000000000001'),
  ('00000003-0000-0000-0000-000000000002', 'Templário', 3, 'Classe 2', 15, 24,
   'Guerreiro sagrado com poderes divinos.', '⚜️',
   '00000002-0000-0000-0000-000000000001');

-- ── TIER 3 — filhos do Mago ────────────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000003-0000-0000-0000-000000000003', 'Bruxo', 3, 'Classe 2', 15, 24,
   'Mago sombrio com poderes proibidos.', '🌑',
   '00000002-0000-0000-0000-000000000002'),
  ('00000003-0000-0000-0000-000000000004', 'Sábio', 3, 'Classe 2', 15, 24,
   'Mestre do conhecimento e sabedoria.', '📜',
   '00000002-0000-0000-0000-000000000002');

-- ── TIER 3 — filhos do Gatuno ──────────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000003-0000-0000-0000-000000000005', 'Mercenário', 3, 'Classe 2', 15, 24,
   'Lutador versátil que vende sua espada ao melhor lance.', '💰',
   '00000002-0000-0000-0000-000000000003'),
  ('00000003-0000-0000-0000-000000000006', 'Arruaceiro', 3, 'Classe 2', 15, 24,
   'Combatente caótico e imprevisível das ruas.', '🎭',
   '00000002-0000-0000-0000-000000000003');

-- ── TIER 3 — filhos do Ferreiro ────────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000003-0000-0000-0000-000000000007', 'Alquimista', 3, 'Classe 2', 15, 24,
   'Transforma matéria em poder através da ciência arcana.', '⚗️',
   '00000002-0000-0000-0000-000000000004'),
  ('00000003-0000-0000-0000-000000000008', 'Mecânico', 3, 'Classe 2', 15, 24,
   'Engenheiro de batalha com engenhocas e armadilhas.', '⚙️',
   '00000002-0000-0000-0000-000000000004');

-- ── TIER 3 — filhos do Noviço ──────────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000003-0000-0000-0000-000000000009', 'Sacerdote', 3, 'Classe 2', 15, 24,
   'Curandeiro devoto com bênçãos poderosas.', '🙏',
   '00000002-0000-0000-0000-000000000005'),
  ('00000003-0000-0000-0000-000000000010', 'Monge', 3, 'Classe 2', 15, 24,
   'Guerreiro espiritual com poderes internos.', '🧘',
   '00000002-0000-0000-0000-000000000005');

-- ── TIER 3 — filhos do Arqueiro ────────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000003-0000-0000-0000-000000000011', 'Caçador', 3, 'Classe 2', 15, 24,
   'Rastreador e predador das terras selvagens.', '🌿',
   '00000002-0000-0000-0000-000000000006'),
  ('00000003-0000-0000-0000-000000000012', 'Bardo', 3, 'Classe 2', 15, 24,
   'Artista mágico que inspira aliados e confunde inimigos.', '🎵',
   '00000002-0000-0000-0000-000000000006');

-- ── TIER 4 — filhos do Cavaleiro ───────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000004-0000-0000-0000-000000000001', 'Lorde', 4, 'Classe 3', 25, 34,
   'Nobre guerreiro com poder de comando sobre exércitos.', '👑',
   '00000003-0000-0000-0000-000000000001'),
  ('00000004-0000-0000-0000-000000000002', 'Paladino', 4, 'Classe 3', 25, 34,
   'Campeão da justiça e da luz divina.', '🌟',
   '00000003-0000-0000-0000-000000000001');

-- ── TIER 4 — filhos do Bruxo ───────────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000004-0000-0000-0000-000000000003', 'Arquimago', 4, 'Classe 3', 25, 34,
   'Mestre supremo das artes arcanas sombrias.', '🧙',
   '00000003-0000-0000-0000-000000000003');

-- ── TIER 4 — filhos do Sábio ───────────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000004-0000-0000-0000-000000000004', 'Professor', 4, 'Classe 3', 25, 34,
   'Grande mestre do conhecimento que ilumina outros.', '📚',
   '00000003-0000-0000-0000-000000000004');

-- ── TIER 4 — filhos do Mercenário ──────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000004-0000-0000-0000-000000000005', 'Algoz', 4, 'Classe 3', 25, 34,
   'Executor implacável de sentenças e contratos mortais.', '💀',
   '00000003-0000-0000-0000-000000000005');

-- ── TIER 4 — filhos do Arruaceiro ──────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000004-0000-0000-0000-000000000006', 'Desordeiro', 4, 'Classe 3', 25, 34,
   'Agente do caos que transforma o campo de batalha em anarquia.', '🎲',
   '00000003-0000-0000-0000-000000000006');

-- ── TIER 4 — filhos do Alquimista ──────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000004-0000-0000-0000-000000000007', 'Mestre-Ferreiro', 4, 'Classe 3', 25, 34,
   'Forjador lendário de armas e armaduras únicas.', '🔥',
   '00000003-0000-0000-0000-000000000007');

-- ── TIER 4 — filhos do Mecânico ────────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000004-0000-0000-0000-000000000008', 'Criador', 4, 'Classe 3', 25, 34,
   'Inventor genial de autômatos e dispositivos arcanos.', '🤖',
   '00000003-0000-0000-0000-000000000008');

-- ── TIER 4 — filhos do Sacerdote ───────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000004-0000-0000-0000-000000000009', 'Sumo Sacerdote', 4, 'Classe 3', 25, 34,
   'Líder espiritual supremo com poderes divinos plenos.', '✨',
   '00000003-0000-0000-0000-000000000009');

-- ── TIER 4 — filhos do Monge ───────────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000004-0000-0000-0000-000000000010', 'Mestre Monge', 4, 'Classe 3', 25, 34,
   'Iluminado que domina corpo, mente e espírito em uníssono.', '☯️',
   '00000003-0000-0000-0000-000000000010');

-- ── TIER 4 — filhos do Caçador ─────────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000004-0000-0000-0000-000000000011', 'Atirador de Elite', 4, 'Classe 3', 25, 34,
   'Atirador lendário, um disparo — uma vida.', '🎯',
   '00000003-0000-0000-0000-000000000011');

-- ── TIER 4 — filhos do Bardo ───────────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000004-0000-0000-0000-000000000012', 'Menestrel', 4, 'Classe 3', 25, 34,
   'Narrador épico cujas músicas reescrevem a realidade.', '🎶',
   '00000003-0000-0000-0000-000000000012');

-- ── TIER 5 — filho do Arquimago ────────────────────────────
INSERT INTO public.classes (id, name, column_index, column_label, level_min, level_max, description, icon, parent_class_id)
VALUES
  ('00000005-0000-0000-0000-000000000001', 'Arquimago Supremo', 5, 'Classe 4', 35, 50,
   'Poder arcano sem limites conhecidos. A encarnação do próprio mistério.', '🌌',
   '00000004-0000-0000-0000-000000000003');

-- ── Atualizar STARTER_CLASS para quem já tem starter_class = 'ferreiro'
-- Garante que o mapeamento do ProfilePage continue funcionando
-- (não há dados corrompidos a corrigir pois current_class_id foi zerado acima)
