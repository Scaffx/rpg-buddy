-- Expand arsenal and talents for broader lifestyle archetypes

-- Ensure magic attack exists in environments where this migration runs first.
ALTER TABLE public.game_items
ADD COLUMN IF NOT EXISTS matk_bonus integer NOT NULL DEFAULT 0;

-- Equipment seed: lifestyle-focused items
INSERT INTO public.game_items (
  name,
  description,
  icon,
  category,
  rarity,
  stat_label,
  atk_bonus,
  def_bonus,
  matk_bonus,
  agi_bonus,
  hp_bonus,
  mp_bonus,
  crit_bonus,
  shop_price,
  level_required,
  stackable,
  is_consumable,
  effect,
  is_starter,
  starter_class,
  boss_drop_level
)
SELECT
  v.name,
  v.description,
  v.icon,
  v.category,
  v.rarity,
  v.stat_label,
  v.atk_bonus,
  v.def_bonus,
  v.matk_bonus,
  v.agi_bonus,
  v.hp_bonus,
  v.mp_bonus,
  v.crit_bonus,
  v.shop_price,
  v.level_required,
  false,
  false,
  NULL,
  false,
  NULL,
  NULL
FROM (
  VALUES
    -- Comum
    ('Espada de Madeira', 'Arma de treino para iniciar a jornada com consistencia.', '🪵', 'weapon', 'comum', '+2 ATK', 2, 0, 0, 0, 0, 0, 0, 20, 1),
    ('Camiseta Confortavel', 'Conforto para manter a rotina sem abrir mao da defesa.', '👕', 'armor', 'comum', '+2 DEF', 0, 2, 0, 0, 0, 0, 0, 18, 1),
    ('Cajado do Andarilho', 'Canaliza energia arcana durante longas jornadas.', '🪄', 'weapon', 'comum', '+3 ATK, +3 MATK', 3, 0, 3, 0, 0, 0, 0, 28, 1),

    -- Incomum
    ('Oculos Anti-Luz Azul', 'Protege os olhos e prolonga foco mental.', '👓', 'accessory', 'incomum', '+3 DEF, +10 MP', 0, 3, 0, 0, 0, 10, 0, 55, 4),
    ('Esfregao da Purificacao', 'Limpeza intensa que fortalece o corpo no processo.', '🧹', 'weapon', 'incomum', '+4 ATK', 4, 0, 0, 0, 0, 0, 0, 60, 4),
    ('Boina da Inspiracao', 'Um toque de estilo que acalma a mente criativa.', '🧢', 'armor', 'incomum', '+2 DEF, +15 MP', 0, 2, 0, 0, 0, 15, 0, 58, 4),
    ('Colar da Empatia', 'Aumenta presenca e estabilidade emocional em equipe.', '📿', 'accessory', 'incomum', '+2 DEF, +12 MP', 0, 2, 0, 0, 0, 12, 0, 62, 5),
    ('Squeeze do Oasis', 'Hidratacao constante para manter performance.', '🥤', 'accessory', 'incomum', '+10 HP, +8 MP', 0, 0, 0, 0, 10, 8, 0, 60, 5),

    -- Raro
    ('Teclado Mecanico do Foco', 'Ritmo preciso para executar tarefas sem hesitar.', '⌨️', 'weapon', 'raro', '+5 ATK, +3 AGI', 5, 0, 0, 3, 0, 0, 0, 140, 10),
    ('Manto da Resiliencia', 'Protecao para aguentar longas batalhas.', '🧥', 'armor', 'raro', '+5 DEF', 0, 5, 0, 0, 0, 0, 0, 135, 10),
    ('Smartwatch da Disciplina', 'Marcacoes precisas para manter constancia.', '⌚', 'accessory', 'raro', '+5 AGI', 0, 0, 0, 5, 0, 0, 0, 145, 10),
    ('Halteres do Tita', 'Treino bruto que aumenta potencia fisica.', '🏋️', 'weapon', 'raro', '+8 ATK', 8, 0, 0, 0, 0, 0, 0, 160, 11),
    ('Avental Impenetravel', 'Camada protetora para ambientes extremos.', '🦺', 'armor', 'raro', '+8 DEF, +20 HP', 0, 8, 0, 0, 20, 0, 0, 170, 11),
    ('Pincel da Realidade', 'Arte que transforma intuicao em poder magico.', '🖌️', 'weapon', 'raro', '+7 MATK, +3 AGI', 0, 0, 7, 3, 0, 0, 0, 165, 11),
    ('Jaqueta do Carisma Magnetico', 'Presenca imponente em qualquer encontro.', '🧥', 'armor', 'raro', '+5 DEF', 0, 5, 0, 0, 0, 0, 0, 150, 10),
    ('Corta-Vento do Aventureiro', 'Mobilidade e resistencia para clima imprevisivel.', '🧢', 'armor', 'raro', '+6 DEF, +20 HP', 0, 6, 0, 0, 20, 0, 0, 155, 10),

    -- Epico
    ('Grimorio do Codigo Limpo', 'Encadeia logica impecavel e magia refinada.', '📘', 'weapon', 'epico', '+8 MATK, +2 MP', 0, 0, 8, 0, 0, 2, 0, 320, 16),
    ('Cadeira Ergonomica de Mithril', 'Suporte lendario para manter postura em combate.', '🪑', 'armor', 'epico', '+10 DEF, +50 HP', 0, 10, 0, 0, 50, 0, 0, 340, 16),
    ('Garrafa Termica Infinita', 'Nunca deixa faltar energia durante a jornada.', '🧴', 'accessory', 'epico', '+30 HP, +30 MP', 0, 0, 0, 0, 30, 30, 0, 330, 16),
    ('Tenis de Corrida Alado', 'Passos leves para velocidade constante.', '👟', 'accessory', 'epico', '+4 DEF, +8 AGI', 0, 4, 0, 8, 0, 0, 0, 335, 16),
    ('Timer de Cozinha Encantado', 'Precisao temporal para rotinas impecaveis.', '⏱️', 'accessory', 'epico', '+4 DEF, +20 MP', 0, 4, 0, 0, 0, 20, 0, 325, 16),
    ('Microfone da Persuasao', 'Voz amplificada para inspirar e liderar.', '🎤', 'weapon', 'epico', '+5 MATK', 0, 0, 5, 0, 0, 0, 0, 315, 16),
    ('Bussola do Destino', 'Direciona escolhas para caminhos mais seguros.', '🧭', 'accessory', 'epico', '+3 DEF, +4 AGI, +12 MP', 0, 3, 0, 4, 0, 12, 0, 328, 16),

    -- Lendario
    ('Caneta Tinteiro Perfurante', 'Traços precisos que atravessam qualquer defesa.', '🖋️', 'weapon', 'lendario', '+10 ATK, +5% CRIT', 10, 0, 0, 0, 0, 0, 5, 520, 22),
    ('Anel do Acumulador', 'Armazena energia e converte em resistencia.', '💍', 'accessory', 'lendario', '+40 HP, +40 MP', 0, 0, 0, 0, 40, 40, 0, 500, 22),
    ('Caderno de Esbocos Infinito', 'Fonte interminavel de ideias e poder arcano.', '📒', 'accessory', 'lendario', '+10 MATK, +30 MP', 0, 0, 10, 0, 0, 30, 0, 510, 22)
) AS v(
  name,
  description,
  icon,
  category,
  rarity,
  stat_label,
  atk_bonus,
  def_bonus,
  matk_bonus,
  agi_bonus,
  hp_bonus,
  mp_bonus,
  crit_bonus,
  shop_price,
  level_required
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.game_items gi
  WHERE gi.name = v.name
);

-- Talent seed expansion
INSERT INTO public.talentos_disponiveis (nome, descricao, efeito)
VALUES
  ('Rato de Biblioteca', 'Bonus de XP em tarefas de estudo e leitura.', 'rato_biblioteca'),
  ('Corpo de Ferro', 'Aumenta resistencia para rotinas fisicas intensas.', 'corpo_de_ferro'),
  ('Sorte de Principiante', 'Pequena chance de recompensa extra em missoes.', 'sorte_de_principiante'),
  ('Cacador de Titas', 'Melhora desempenho contra desafios de alto nivel.', 'cacador_de_titas'),
  ('Pele de Pedra', 'Aumenta defesa base em situacoes de risco.', 'pele_de_pedra'),
  ('Sifao de Mana', 'Recupera uma porcao de MP ao concluir tarefas.', 'sifao_de_mana'),
  ('Investidor Anjo', 'Aumenta ganho de ouro em conclusoes consistentes.', 'investidor_anjo'),
  ('Alquimista Amador', 'Melhora efeitos de consumiveis e buffs.', 'alquimista_amador'),
  ('Pulmoes de Aco', 'Eleva desempenho em atividades de resistencia.', 'pulmoes_de_aco'),
  ('Ordem no Caos', 'Bonus quando ha varias tarefas em paralelo.', 'ordem_no_caos'),
  ('Estado de Fluxo', 'Aumenta eficiencia em sequencias de foco.', 'estado_de_fluxo'),
  ('Presenca Inspiradora', 'Fortalece bonus de suporte e motivacao.', 'presenca_inspiradora'),
  ('Fotossintese', 'Recuperacao leve passiva de energia ao longo do dia.', 'fotossintese')
ON CONFLICT (efeito) DO UPDATE
SET nome = EXCLUDED.nome,
    descricao = EXCLUDED.descricao;
