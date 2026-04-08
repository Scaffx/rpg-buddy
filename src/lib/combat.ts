type GenericRecord = Record<string, any>;

export type StarterClassId = 'guerreiro' | 'mago' | 'gatuno' | 'ferreiro' | 'clerico' | 'arqueiro' | 'novato';

export type AttrLevels = {
  Forca: number;
  Inteligencia: number;
  Agilidade: number;
  Disciplina: number;
  Sabedoria: number;
  Resiliencia: number;
  Carisma: number;
  Vitalidade: number;
  Criatividade: number;
  Autoaperfeicoamento: number;
  Relacionamento: number;
};

export type PlayerCombatStats = {
  atk: number;
  matk: number;
  def: number;
  agi: number;
  crit: number;
  hp: number;
  focus: string;
};

export type BossCombatStats = {
  atk: number;
  matk: number;
  def: number;
  agi: number;
  hp: number;
  threat: number;
  weakness: string;
};

export type SkillNode = {
  id: string;
  name: string;
  archetype: string;
  fantasy: string;
  description: string;
  basedOn: string[];
  unlockLevel: number;
  cooldown: number;
  power: number;
  unlocked: boolean;
  tier: 'novato' | 'classe';
  category: 'fisica' | 'magica' | 'hibrida';
  requiredItem?: string;
};

type SkillBlueprint = {
  id: string;
  name: string;
  archetype: string;
  fantasy: string;
  description: string;
  basedOn: [keyof AttrLevels, keyof AttrLevels];
  unlockLevel: number;
  cooldown: number;
  factor: number;
  tier: 'novato' | 'classe';
  category: 'fisica' | 'magica' | 'hibrida';
  requiredItem?: string;
};

export type SkillLoadout = {
  noviceSkills: SkillNode[];
  classSkills: SkillNode[];
};

const ATTR_NAME_MAP: Record<string, keyof AttrLevels> = {
  Forca: 'Forca',
  Forca_: 'Forca',
  Forca__accent: 'Forca',
  Forca___: 'Forca',
  Forca____: 'Forca',
  Inteligencia: 'Inteligencia',
  Agilidade: 'Agilidade',
  Disciplina: 'Disciplina',
  Sabedoria: 'Sabedoria',
  Resiliencia: 'Resiliencia',
  Carisma: 'Carisma',
  Vitalidade: 'Vitalidade',
  Criatividade: 'Criatividade',
  Autoaperfeicoamento: 'Autoaperfeicoamento',
  Relacionamento: 'Relacionamento',
};

function normalizeName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '');
}

export function getAttributeLevels(attributes?: GenericRecord[]): AttrLevels {
  const base: AttrLevels = {
    Forca: 1,
    Inteligencia: 1,
    Agilidade: 1,
    Disciplina: 1,
    Sabedoria: 1,
    Resiliencia: 1,
    Carisma: 1,
    Vitalidade: 1,
    Criatividade: 1,
    Autoaperfeicoamento: 1,
    Relacionamento: 1,
  };

  (attributes || []).forEach((attr) => {
    const normalized = normalizeName(String(attr.name || ''));
    const key = ATTR_NAME_MAP[normalized];
    if (!key) return;
    base[key] = Math.max(1, Number(attr.level || 1));
  });

  return base;
}

function getFocusAttributeName(levels: AttrLevels): string {
  const map: Array<[string, number]> = [
    ['Forca', levels.Forca],
    ['Inteligencia', levels.Inteligencia],
    ['Agilidade', levels.Agilidade],
    ['Disciplina', levels.Disciplina],
    ['Sabedoria', levels.Sabedoria],
    ['Resiliencia', levels.Resiliencia],
    ['Carisma', levels.Carisma],
    ['Vitalidade', levels.Vitalidade],
  ];

  map.sort((a, b) => b[1] - a[1]);
  return map[0][0];
}

export function getPlayerCombatStats(profileLevel: number, levels: AttrLevels): PlayerCombatStats {
  const atk = profileLevel * 4 + levels.Forca * 6 + levels.Disciplina * 2;
  // Magia propositalmente mais fraca para incentivar criatividade em build hibrida.
  const matk = profileLevel * 3 + levels.Inteligencia * 4 + levels.Sabedoria * 2;
  const def = profileLevel * 3 + levels.Resiliencia * 5 + levels.Vitalidade * 3;
  const agi = profileLevel * 2 + levels.Agilidade * 6 + levels.Criatividade * 2;
  const crit = Math.min(65, 5 + Math.floor((levels.Agilidade + levels.Criatividade + levels.Carisma) * 0.9));
  const hp = 120 + profileLevel * 18 + levels.Vitalidade * 14;
  return {
    atk,
    matk,
    def,
    agi,
    crit,
    hp,
    focus: getFocusAttributeName(levels),
  };
}

function getWeaknessByIndex(index: number): string {
  const weaknesses = ['Forca', 'Inteligencia', 'Agilidade', 'Disciplina', 'Sabedoria', 'Resiliencia'];
  return weaknesses[index % weaknesses.length];
}

export function getBossCombatStats(boss: GenericRecord): BossCombatStats {
  const level = Number(boss?.level || 1);
  const hp = Number(boss?.hp || 100);
  const base = level * 7 + Math.floor(hp / 10);

  return {
    atk: base + 10 + level * 2,
    matk: base + 8 + (level % 2 === 0 ? level * 2 : level),
    def: base + 6 + Math.floor(level * 1.8),
    agi: base + 4 + Math.floor(level * 1.5),
    hp,
    threat: Math.round((base * 1.6 + hp * 0.35) / 10),
    weakness: getWeaknessByIndex(level + hp),
  };
}


const STARTER_ITEM_BY_CLASS: Record<StarterClassId, string> = {
  novato: 'Adaga de Treino',
  guerreiro: 'Espada Curta',
  mago: 'Grimorio Basico',
  gatuno: 'Adaga de Sombra',
  ferreiro: 'Martelo de Aco',
  clerico: 'Cajado de Luz',
  arqueiro: 'Arco Curto',
};

const NOVICE_SKILLS_BY_ITEM: Record<string, SkillBlueprint[]> = {
  'Espada Curta': [
    {
      id: 'novato-golpe-ascendente',
      name: 'Golpe Ascendente',
      archetype: 'Novato',
      fantasy: 'Treino com espada de inicio',
      description: 'Corte simples para abrir combate.',
      basedOn: ['Forca', 'Disciplina'],
      unlockLevel: 1,
      cooldown: 1,
      factor: 1.05,
      tier: 'novato',
      category: 'fisica',
      requiredItem: 'Espada Curta',
    },
    {
      id: 'novato-postura-firme',
      name: 'Postura Firme',
      archetype: 'Novato',
      fantasy: 'Defesa basica de campo',
      description: 'Aumenta a defesa por pouco tempo.',
      basedOn: ['Resiliencia', 'Vitalidade'],
      unlockLevel: 2,
      cooldown: 2,
      factor: 1.0,
      tier: 'novato',
      category: 'hibrida',
      requiredItem: 'Espada Curta',
    },
    {
      id: 'novato-passo-lateral',
      name: 'Passo Lateral',
      archetype: 'Novato',
      fantasy: 'Movimento para reposicionar',
      description: 'Melhora evasao para proximo turno.',
      basedOn: ['Agilidade', 'Disciplina'],
      unlockLevel: 3,
      cooldown: 2,
      factor: 1.1,
      tier: 'novato',
      category: 'fisica',
      requiredItem: 'Espada Curta',
    },
    {
      id: 'novato-lamina-precisa',
      name: 'Lamina Precisa',
      archetype: 'Novato',
      fantasy: 'Finalizacao de treino',
      description: 'Ataque com maior chance de acerto critico.',
      basedOn: ['Forca', 'Agilidade'],
      unlockLevel: 4,
      cooldown: 3,
      factor: 1.15,
      tier: 'novato',
      category: 'fisica',
      requiredItem: 'Espada Curta',
    },
  ],
  'Arco Curto': [
    {
      id: 'novato-disparo-rapido',
      name: 'Disparo Rapido',
      archetype: 'Novato',
      fantasy: 'Primeiro disparo de campo',
      description: 'Disparo de baixa recarga para manter ritmo.',
      basedOn: ['Agilidade', 'Disciplina'],
      unlockLevel: 1,
      cooldown: 1,
      factor: 1.0,
      tier: 'novato',
      category: 'fisica',
      requiredItem: 'Arco Curto',
    },
    {
      id: 'novato-mira-fria',
      name: 'Mira Fria',
      archetype: 'Novato',
      fantasy: 'Calibragem de mira',
      description: 'Aumenta precisao no proximo ataque.',
      basedOn: ['Disciplina', 'Inteligencia'],
      unlockLevel: 2,
      cooldown: 2,
      factor: 1.05,
      tier: 'novato',
      category: 'hibrida',
      requiredItem: 'Arco Curto',
    },
    {
      id: 'novato-retirada-tatica',
      name: 'Retirada Tatica',
      archetype: 'Novato',
      fantasy: 'Mobilidade de arqueiro',
      description: 'Recuo curto com bonus de agilidade.',
      basedOn: ['Agilidade', 'Criatividade'],
      unlockLevel: 3,
      cooldown: 3,
      factor: 1.1,
      tier: 'novato',
      category: 'fisica',
      requiredItem: 'Arco Curto',
    },
    {
      id: 'novato-flecha-rompante',
      name: 'Flecha Rompante',
      archetype: 'Novato',
      fantasy: 'Tiro forte de abertura',
      description: 'Flecha com dano alto e recarga maior.',
      basedOn: ['Agilidade', 'Forca'],
      unlockLevel: 4,
      cooldown: 3,
      factor: 1.2,
      tier: 'novato',
      category: 'fisica',
      requiredItem: 'Arco Curto',
    },
  ],
  'Grimorio Basico': [
    {
      id: 'novato-faixa-runica',
      name: 'Faixa Runica',
      archetype: 'Novato',
      fantasy: 'Canalizacao inicial de mana',
      description: 'Pulso magico curto e estavel.',
      basedOn: ['Inteligencia', 'Sabedoria'],
      unlockLevel: 1,
      cooldown: 1,
      factor: 0.95,
      tier: 'novato',
      category: 'magica',
      requiredItem: 'Grimorio Basico',
    },
    {
      id: 'novato-escudo-etereo',
      name: 'Escudo Etereo',
      archetype: 'Novato',
      fantasy: 'Protecao arcana simples',
      description: 'Escudo leve para mitigar dano.',
      basedOn: ['Sabedoria', 'Resiliencia'],
      unlockLevel: 2,
      cooldown: 2,
      factor: 1.0,
      tier: 'novato',
      category: 'hibrida',
      requiredItem: 'Grimorio Basico',
    },
    {
      id: 'novato-estouro-arcano',
      name: 'Estouro Arcano',
      archetype: 'Novato',
      fantasy: 'Concentracao em area pequena',
      description: 'Explosao magica de curta distancia.',
      basedOn: ['Inteligencia', 'Criatividade'],
      unlockLevel: 3,
      cooldown: 3,
      factor: 1.05,
      tier: 'novato',
      category: 'magica',
      requiredItem: 'Grimorio Basico',
    },
    {
      id: 'novato-selo-mental',
      name: 'Selo Mental',
      archetype: 'Novato',
      fantasy: 'Controle tatico de mana',
      description: 'Debuff de foco no alvo com dano moderado.',
      basedOn: ['Inteligencia', 'Disciplina'],
      unlockLevel: 4,
      cooldown: 3,
      factor: 1.1,
      tier: 'novato',
      category: 'magica',
      requiredItem: 'Grimorio Basico',
    },
  ],
  'Adaga de Sombra': [
    {
      id: 'novato-corte-silencioso',
      name: 'Corte Silencioso',
      archetype: 'Novato',
      fantasy: 'Iniciacao furtiva',
      description: 'Golpe rapido com chance de critico.',
      basedOn: ['Agilidade', 'Criatividade'],
      unlockLevel: 1,
      cooldown: 1,
      factor: 1.05,
      tier: 'novato',
      category: 'fisica',
      requiredItem: 'Adaga de Sombra',
    },
    {
      id: 'novato-finta-curta',
      name: 'Finta Curta',
      archetype: 'Novato',
      fantasy: 'Movimento de engano',
      description: 'Engana o alvo e melhora a evasao.',
      basedOn: ['Agilidade', 'Carisma'],
      unlockLevel: 2,
      cooldown: 2,
      factor: 1.0,
      tier: 'novato',
      category: 'hibrida',
      requiredItem: 'Adaga de Sombra',
    },
    {
      id: 'novato-passo-fantasma',
      name: 'Passo Fantasma',
      archetype: 'Novato',
      fantasy: 'Deslocamento de sombra',
      description: 'Reposiciona com bonus de iniciativa.',
      basedOn: ['Agilidade', 'Disciplina'],
      unlockLevel: 3,
      cooldown: 3,
      factor: 1.1,
      tier: 'novato',
      category: 'fisica',
      requiredItem: 'Adaga de Sombra',
    },
    {
      id: 'novato-salto-lateral',
      name: 'Salto Lateral',
      archetype: 'Novato',
      fantasy: 'Escape ofensivo',
      description: 'Ataque e recuo num unico movimento.',
      basedOn: ['Agilidade', 'Forca'],
      unlockLevel: 4,
      cooldown: 3,
      factor: 1.2,
      tier: 'novato',
      category: 'fisica',
      requiredItem: 'Adaga de Sombra',
    },
  ],
  'Martelo de Aco': [
    {
      id: 'novato-impacto-frontal',
      name: 'Impacto Frontal',
      archetype: 'Novato',
      fantasy: 'Golpe bruto de ferramenta',
      description: 'Ataque pesado focado em quebrar defesa.',
      basedOn: ['Forca', 'Resiliencia'],
      unlockLevel: 1,
      cooldown: 1,
      factor: 1.1,
      tier: 'novato',
      category: 'fisica',
      requiredItem: 'Martelo de Aco',
    },
    {
      id: 'novato-reforco-estrutural',
      name: 'Reforco Estrutural',
      archetype: 'Novato',
      fantasy: 'Protecao de oficio',
      description: 'Aumenta defesa com postura firme.',
      basedOn: ['Resiliencia', 'Disciplina'],
      unlockLevel: 2,
      cooldown: 2,
      factor: 1.0,
      tier: 'novato',
      category: 'hibrida',
      requiredItem: 'Martelo de Aco',
    },
    {
      id: 'novato-pulso-de-forja',
      name: 'Pulso de Forja',
      archetype: 'Novato',
      fantasy: 'Cadencia de trabalho pesado',
      description: 'Golpe em area curta e estavel.',
      basedOn: ['Forca', 'Vitalidade'],
      unlockLevel: 3,
      cooldown: 3,
      factor: 1.15,
      tier: 'novato',
      category: 'fisica',
      requiredItem: 'Martelo de Aco',
    },
    {
      id: 'novato-runa-de-acabamento',
      name: 'Runa de Acabamento',
      archetype: 'Novato',
      fantasy: 'Tecnica de finalizacao',
      description: 'Aplica dano crescente em alvo ferido.',
      basedOn: ['Disciplina', 'Inteligencia'],
      unlockLevel: 4,
      cooldown: 3,
      factor: 1.2,
      tier: 'novato',
      category: 'hibrida',
      requiredItem: 'Martelo de Aco',
    },
  ],
  'Cajado de Luz': [
    {
      id: 'novato-luz-serena',
      name: 'Luz Serena',
      archetype: 'Novato',
      fantasy: 'Canalizacao de suporte',
      description: 'Feixe de luz com utilidade tatica.',
      basedOn: ['Sabedoria', 'Relacionamento'],
      unlockLevel: 1,
      cooldown: 1,
      factor: 0.95,
      tier: 'novato',
      category: 'magica',
      requiredItem: 'Cajado de Luz',
    },
    {
      id: 'novato-oracao-breve',
      name: 'Oracao Breve',
      archetype: 'Novato',
      fantasy: 'Bencao de suporte rapido',
      description: 'Aumenta defesa e estabilidade mental.',
      basedOn: ['Sabedoria', 'Resiliencia'],
      unlockLevel: 2,
      cooldown: 2,
      factor: 1.0,
      tier: 'novato',
      category: 'hibrida',
      requiredItem: 'Cajado de Luz',
    },
    {
      id: 'novato-circulo-de-amparo',
      name: 'Circulo de Amparo',
      archetype: 'Novato',
      fantasy: 'Aura curta de protecao',
      description: 'Zona de seguranca para reduzir dano recebido.',
      basedOn: ['Sabedoria', 'Vitalidade'],
      unlockLevel: 3,
      cooldown: 3,
      factor: 1.05,
      tier: 'novato',
      category: 'magica',
      requiredItem: 'Cajado de Luz',
    },
    {
      id: 'novato-radiante-preciso',
      name: 'Radiante Preciso',
      archetype: 'Novato',
      fantasy: 'Descarga de luz focada',
      description: 'Dano moderado com alto controle.',
      basedOn: ['Sabedoria', 'Inteligencia'],
      unlockLevel: 4,
      cooldown: 3,
      factor: 1.1,
      tier: 'novato',
      category: 'magica',
      requiredItem: 'Cajado de Luz',
    },
  ],
  'Adaga de Treino': [
    {
      id: 'novato-base-golpe',
      name: 'Base de Golpe',
      archetype: 'Novato',
      fantasy: 'Fundamento universal',
      description: 'Ataque simples para qualquer inicio.',
      basedOn: ['Forca', 'Agilidade'],
      unlockLevel: 1,
      cooldown: 1,
      factor: 1.0,
      tier: 'novato',
      category: 'fisica',
      requiredItem: 'Adaga de Treino',
    },
    {
      id: 'novato-foco-curto',
      name: 'Foco Curto',
      archetype: 'Novato',
      fantasy: 'Leitura de combate',
      description: 'Ajusta postura para errar menos.',
      basedOn: ['Disciplina', 'Inteligencia'],
      unlockLevel: 2,
      cooldown: 2,
      factor: 1.0,
      tier: 'novato',
      category: 'hibrida',
      requiredItem: 'Adaga de Treino',
    },
    {
      id: 'novato-estabilidade',
      name: 'Estabilidade',
      archetype: 'Novato',
      fantasy: 'Defesa inicial padrao',
      description: 'Fortalece resistencia em combate.',
      basedOn: ['Resiliencia', 'Vitalidade'],
      unlockLevel: 3,
      cooldown: 2,
      factor: 1.05,
      tier: 'novato',
      category: 'hibrida',
      requiredItem: 'Adaga de Treino',
    },
    {
      id: 'novato-adaptacao',
      name: 'Adaptacao',
      archetype: 'Novato',
      fantasy: 'Versatilidade inicial',
      description: 'Escala com atributos mistos para build livre.',
      basedOn: ['Criatividade', 'Disciplina'],
      unlockLevel: 4,
      cooldown: 3,
      factor: 1.1,
      tier: 'novato',
      category: 'hibrida',
      requiredItem: 'Adaga de Treino',
    },
  ],
};

const CLASS_SKILLS: Record<StarterClassId, SkillBlueprint[]> = {
  novato: [],
  guerreiro: [
    { id: 'guerreiro-ruptura-frontal', name: 'Ruptura Frontal', archetype: 'Guerreiro', fantasy: 'Dano consistente de linha de frente', description: 'Ataque fisico de alta pressao.', basedOn: ['Forca', 'Resiliencia'], unlockLevel: 5, cooldown: 3, factor: 1.3, tier: 'classe', category: 'fisica' },
    { id: 'guerreiro-guarda-viva', name: 'Guarda Viva', archetype: 'Guerreiro', fantasy: 'Postura defensiva ativa', description: 'Amplia defesa e reduz dano explosivo.', basedOn: ['Resiliencia', 'Disciplina'], unlockLevel: 6, cooldown: 4, factor: 1.2, tier: 'classe', category: 'hibrida' },
    { id: 'guerreiro-corte-de-ritmo', name: 'Corte de Ritmo', archetype: 'Guerreiro', fantasy: 'Controle de cadencia', description: 'Dano e desaceleracao de alvo.', basedOn: ['Forca', 'Agilidade'], unlockLevel: 8, cooldown: 4, factor: 1.35, tier: 'classe', category: 'fisica' },
  ],
  mago: [
    { id: 'mago-lanca-lucida', name: 'Lanca Lucida', archetype: 'Mago', fantasy: 'Estouro arcano refinado', description: 'Magia de alvo unico com foco intelectual.', basedOn: ['Inteligencia', 'Sabedoria'], unlockLevel: 5, cooldown: 3, factor: 1.28, tier: 'classe', category: 'magica' },
    { id: 'mago-zona-vetorial', name: 'Zona Vetorial', archetype: 'Mago', fantasy: 'Controle de area', description: 'Campo que reduz ofensiva inimiga.', basedOn: ['Inteligencia', 'Disciplina'], unlockLevel: 7, cooldown: 4, factor: 1.2, tier: 'classe', category: 'magica' },
    { id: 'mago-manobra-hibrida', name: 'Manobra Hibrida', archetype: 'Mago', fantasy: 'Build criativa anti-meta', description: 'Converte parte da agilidade em bonus magico.', basedOn: ['Inteligencia', 'Agilidade'], unlockLevel: 9, cooldown: 4, factor: 1.18, tier: 'classe', category: 'hibrida' },
  ],
  gatuno: [
    { id: 'gatuno-fenda-obliqua', name: 'Fenda Obliqua', archetype: 'Gatuno', fantasy: 'Explosao de mobilidade', description: 'Golpe critico com reposicionamento.', basedOn: ['Agilidade', 'Criatividade'], unlockLevel: 5, cooldown: 3, factor: 1.3, tier: 'classe', category: 'fisica' },
    { id: 'gatuno-cortina-curta', name: 'Cortina Curta', archetype: 'Gatuno', fantasy: 'Confusao tatica', description: 'Dificulta o acerto do boss por um turno.', basedOn: ['Agilidade', 'Carisma'], unlockLevel: 6, cooldown: 3, factor: 1.18, tier: 'classe', category: 'hibrida' },
    { id: 'gatuno-assinatura-vazio', name: 'Assinatura Vazio', archetype: 'Gatuno', fantasy: 'Ataque de oportunidade', description: 'Escala com build agressiva ou controle.', basedOn: ['Agilidade', 'Disciplina'], unlockLevel: 8, cooldown: 4, factor: 1.34, tier: 'classe', category: 'fisica' },
  ],
  ferreiro: [
    { id: 'ferreiro-impacto-de-forja', name: 'Impacto de Forja', archetype: 'Ferreiro', fantasy: 'Pressao de curto alcance', description: 'Golpe pesado com bonus contra defesa alta.', basedOn: ['Forca', 'Disciplina'], unlockLevel: 5, cooldown: 3, factor: 1.32, tier: 'classe', category: 'fisica' },
    { id: 'ferreiro-liga-viva', name: 'Liga Viva', archetype: 'Ferreiro', fantasy: 'Auto reforco de combate', description: 'Aumenta defesa e poder bruto temporariamente.', basedOn: ['Resiliencia', 'Forca'], unlockLevel: 7, cooldown: 4, factor: 1.26, tier: 'classe', category: 'hibrida' },
    { id: 'ferreiro-runa-industrial', name: 'Runa Industrial', archetype: 'Ferreiro', fantasy: 'Tecnica mecanica improvisada', description: 'Habilidade livre para build alternativa.', basedOn: ['Inteligencia', 'Forca'], unlockLevel: 9, cooldown: 4, factor: 1.2, tier: 'classe', category: 'hibrida' },
  ],
  clerico: [
    { id: 'clerico-voto-de-guarda', name: 'Voto de Guarda', archetype: 'Clerico', fantasy: 'Protecao e estabilidade', description: 'Escudo robusto para reduzir dano recebido.', basedOn: ['Sabedoria', 'Resiliencia'], unlockLevel: 5, cooldown: 3, factor: 1.2, tier: 'classe', category: 'hibrida' },
    { id: 'clerico-raio-sereno', name: 'Raio Sereno', archetype: 'Clerico', fantasy: 'Canalizacao de luz controlada', description: 'Magia de dano moderado e alta consistencia.', basedOn: ['Sabedoria', 'Inteligencia'], unlockLevel: 6, cooldown: 3, factor: 1.12, tier: 'classe', category: 'magica' },
    { id: 'clerico-coroa-de-apoio', name: 'Coroa de Apoio', archetype: 'Clerico', fantasy: 'Suporte tatico', description: 'Aumenta eficiencia de build hibrida.', basedOn: ['Relacionamento', 'Sabedoria'], unlockLevel: 8, cooldown: 4, factor: 1.16, tier: 'classe', category: 'hibrida' },
  ],
  arqueiro: [
    { id: 'arqueiro-tiro-vetor', name: 'Tiro Vetor', archetype: 'Arqueiro', fantasy: 'Precisao e mobilidade', description: 'Disparo potente com boa escalabilidade.', basedOn: ['Agilidade', 'Disciplina'], unlockLevel: 5, cooldown: 2, factor: 1.28, tier: 'classe', category: 'fisica' },
    { id: 'arqueiro-janela-critica', name: 'Janela Critica', archetype: 'Arqueiro', fantasy: 'Abertura para dano alto', description: 'Aumenta taxa critica nos proximos golpes.', basedOn: ['Agilidade', 'Criatividade'], unlockLevel: 7, cooldown: 4, factor: 1.24, tier: 'classe', category: 'fisica' },
    { id: 'arqueiro-plano-transversal', name: 'Plano Transversal', archetype: 'Arqueiro', fantasy: 'Leitura de combate a distancia', description: 'Escala com inteligencia para build alternativa.', basedOn: ['Agilidade', 'Inteligencia'], unlockLevel: 9, cooldown: 4, factor: 1.2, tier: 'classe', category: 'hibrida' },
  ],
};

export function getStarterItemForClass(starterClass: StarterClassId): string {
  return STARTER_ITEM_BY_CLASS[starterClass] || STARTER_ITEM_BY_CLASS.novato;
}

function normalizeClass(input?: string): StarterClassId {
  if (!input) return 'novato';
  const key = input.toLowerCase() as StarterClassId;
  if (['guerreiro', 'mago', 'gatuno', 'ferreiro', 'clerico', 'arqueiro', 'novato'].includes(key)) {
    return key;
  }
  return 'novato';
}

function computeSkillPower(levels: AttrLevels, skill: SkillBlueprint): number {
  const statA = levels[skill.basedOn[0]] || 1;
  const statB = levels[skill.basedOn[1]] || 1;
  const mainStat = Math.max(statA, statB);
  const secondary = Math.min(statA, statB);
  const hybridBonus = Math.round((levels.Criatividade + levels.Autoaperfeicoamento) * 0.35);
  const baseline = mainStat * 19 + secondary * 9 + hybridBonus;
  const magicNerf = skill.category === 'magica' ? 0.82 : skill.category === 'hibrida' ? 0.92 : 1;
  return Math.max(12, Math.round(baseline * skill.factor * magicNerf));
}

function mapToNode(levels: AttrLevels, profileLevel: number, skill: SkillBlueprint): SkillNode {
  return {
    id: skill.id,
    name: skill.name,
    archetype: skill.archetype,
    fantasy: skill.fantasy,
    description: skill.description,
    basedOn: [...skill.basedOn],
    unlockLevel: skill.unlockLevel,
    cooldown: skill.cooldown,
    power: computeSkillPower(levels, skill),
    unlocked: profileLevel >= skill.unlockLevel,
    tier: skill.tier,
    category: skill.category,
    requiredItem: skill.requiredItem,
  };
}

export function getSkillLoadout(
  profileLevel: number,
  levels: AttrLevels,
  starterClassInput?: string,
  starterItemInput?: string,
): SkillLoadout {
  const starterClass = normalizeClass(starterClassInput);
  const starterItem = starterItemInput || getStarterItemForClass(starterClass);

  const noviceBlueprint = NOVICE_SKILLS_BY_ITEM[starterItem] || NOVICE_SKILLS_BY_ITEM['Adaga de Treino'];
  const noviceSkills = noviceBlueprint.map((skill) => mapToNode(levels, profileLevel, skill));
  const classSkills = (CLASS_SKILLS[starterClass] || []).map((skill) => mapToNode(levels, profileLevel, skill));

  return { noviceSkills, classSkills };
}

