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

export type SkillEffectType = 'dano' | 'heal' | 'buff' | 'debuff' | 'cc' | 'utility';

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
  /** Custo fixo de MP (substitui o cálculo dinâmico por power/15). */
  mpCost?: number;
  /** Tipo de efeito da habilidade. */
  effectType?: SkillEffectType;
  /** Descrição legível do efeito. */
  effectLabel?: string;
  /** Texto de sinergia com outra classe. */
  synergy?: string;
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
  /** Se definido, power = fixedPower (sem escala por atributos). */
  fixedPower?: number;
  mpCost?: number;
  effectType?: SkillEffectType;
  effectLabel?: string;
  synergy?: string;
};

export type SkillLoadout = {
  noviceSkills: SkillNode[];
  classSkills: SkillNode[];
  /** Habilidades de especialidade (T3+). Vazias se classe ainda for T2. */
  specialtySkills: SkillNode[];
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

export function getPlayerCombatStats(profileLevel: number, levels: AttrLevels): PlayerCombatStats & { mp: number } {
  const atk = profileLevel * 4 + levels.Forca * 6 + levels.Disciplina * 2;
  // Magia propositalmente mais fraca para incentivar criatividade em build hibrida.
  const matk = profileLevel * 3 + levels.Inteligencia * 4 + levels.Sabedoria * 2;
  const def = profileLevel * 3 + levels.Resiliencia * 5 + levels.Vitalidade * 3;
  const agi = profileLevel * 2 + levels.Agilidade * 6 + levels.Criatividade * 2;
  const crit = Math.min(65, 5 + Math.floor((levels.Agilidade + levels.Criatividade + levels.Carisma) * 0.9));
  // Novo cálculo de HP: base + level * 12 + Força * 8 + Vitalidade * 14 (mais balanceado)
  const hp = 100 + profileLevel * 12 + levels.Forca * 8 + levels.Vitalidade * 14;
  // Novo cálculo de MP: base + level * 8 + Inteligência * 10 + Sabedoria * 6
  const mp = 40 + profileLevel * 8 + levels.Inteligencia * 10 + levels.Sabedoria * 6;
  return {
    atk,
    matk,
    def,
    agi,
    crit,
    hp,
    mp,
    focus: getFocusAttributeName(levels),
  };
}

export function getRoutineXpBuffBonus(effects: Set<string>): number {
  if (effects.has('xp_boost') || effects.has('foco_profundo')) {
    return 0.5;
  }
  return 0;
}

export function getBossCombatBuffModifiers(effects: Set<string>): {
  hasAdrenaline: boolean;
  attackRollMultiplierBonus: number;
  bossPowerMultiplier: number;
} {
  const hasAdrenaline = effects.has('adrenalina') || effects.has('adrenaline_boost');
  const hasBossDebuff = effects.has('boss_debuff');

  return {
    hasAdrenaline,
    attackRollMultiplierBonus: hasAdrenaline ? 2 : 0,
    bossPowerMultiplier: hasBossDebuff ? 0.8 : 1,
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

// ================================================================
// T3 CLASS SKILLS — Especialidades (Alquimista, Mecânico, Bardo…)
// ================================================================
const T3_CLASS_SKILLS: Record<string, SkillBlueprint[]> = {
  'Alquimista': [
    { id: 'alq-elixir-simples', name: 'Elixir Simples', archetype: 'Alquimista', fantasy: 'Poção curativa básica', description: '+25 HP instantâneo.', basedOn: ['Sabedoria', 'Inteligencia'], unlockLevel: 15, cooldown: 2, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 5, effectType: 'heal', effectLabel: '+25 HP para aliado', fixedPower: 25, synergy: 'Com Sacerdote: +40 HP' },
    { id: 'alq-catalisador-mental', name: 'Catalisador Mental', archetype: 'Alquimista', fantasy: 'Reduz custo mágico', description: 'Próxima habilidade custa -50% MP.', basedOn: ['Inteligencia', 'Disciplina'], unlockLevel: 17, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 10, effectType: 'buff', effectLabel: 'Próxima habilidade custa -50% MP', fixedPower: 50, synergy: 'Com Sábio: -75% MP' },
    { id: 'alq-pocao-aprimorada', name: 'Poção Aprimorada', archetype: 'Alquimista', fantasy: 'Cura purificante', description: '+40 HP + remove 1 debuff.', basedOn: ['Sabedoria', 'Vitalidade'], unlockLevel: 19, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 12, effectType: 'heal', effectLabel: '+40 HP + remove 1 debuff', fixedPower: 40, synergy: 'Com Monge: Remove 2 debuffs' },
    { id: 'alq-transmutacao', name: 'Transmutação', archetype: 'Alquimista', fantasy: 'Conversão alquímica', description: 'Converte item em consumível épico.', basedOn: ['Inteligencia', 'Criatividade'], unlockLevel: 21, cooldown: 4, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 16, effectType: 'utility', effectLabel: 'Converte item em consumível épico', fixedPower: 0, synergy: 'Com Mecânico: Cria 2 consumíveis' },
    { id: 'alq-essencia-vitalizada', name: 'Essência Vitalizada', archetype: 'Alquimista', fantasy: 'Restauração total de mana', description: 'Restaura 100% MP (1x/combate).', basedOn: ['Sabedoria', 'Relacionamento'], unlockLevel: 23, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 18, effectType: 'utility', effectLabel: 'Restaura 100% MP (1x/combate)', fixedPower: 100, synergy: 'Com Bardo: +20 HP também' },
  ],
  'Mecânico': [
    { id: 'mec-engrenagem-protecao', name: 'Engrenagem de Proteção', archetype: 'Mecânico', fantasy: 'Escudo mecânico básico', description: 'Escudo 40 DMG.', basedOn: ['Resiliencia', 'Disciplina'], unlockLevel: 15, cooldown: 2, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 6, effectType: 'buff', effectLabel: 'Escudo 40 DMG', fixedPower: 40, synergy: 'Com Cavaleiro: Escudo 60 DMG' },
    { id: 'mec-armadilha-simples', name: 'Armadilha Simples', archetype: 'Mecânico', fantasy: 'Imobilização mecânica', description: 'Imobiliza inimigo 1 turno.', basedOn: ['Inteligencia', 'Disciplina'], unlockLevel: 17, cooldown: 3, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 11, effectType: 'cc', effectLabel: 'Imobiliza inimigo 1 turno', fixedPower: 1, synergy: 'Com Arruaceiro: Imobiliza 2 turnos' },
    { id: 'mec-blindagem-reforcada', name: 'Blindagem Reforçada', archetype: 'Mecânico', fantasy: 'Defesa aprimorada', description: 'Escudo 80 DMG + -20% dano recebido.', basedOn: ['Resiliencia', 'Forca'], unlockLevel: 19, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 13, effectType: 'buff', effectLabel: 'Escudo 80 DMG + -20% dano recebido', fixedPower: 80, synergy: 'Com Templário: +50% defesa aliado' },
    { id: 'mec-mecanismo-perfeito', name: 'Mecanismo Perfeito', archetype: 'Mecânico', fantasy: 'Contraofensiva mecânica', description: 'Absorve 150 DMG + contra-ataca 50.', basedOn: ['Forca', 'Inteligencia'], unlockLevel: 21, cooldown: 4, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 15, effectType: 'buff', effectLabel: 'Absorve 150 DMG + contra-ataca 50', fixedPower: 150, synergy: 'Com Caçador: Contra-ataque crítico' },
    { id: 'mec-fortaleza-viva', name: 'Fortaleza Viva', archetype: 'Mecânico', fantasy: 'Canalizador de defesa', description: '+1 ARM/turno por 5 turnos.', basedOn: ['Resiliencia', 'Vitalidade'], unlockLevel: 23, cooldown: 4, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 17, effectType: 'buff', effectLabel: '+1 ARM/turno (máx 5 turnos)', fixedPower: 1, synergy: 'Com Cavaleiro: +2 ARM/turno' },
  ],
  'Bardo': [
    { id: 'brd-melodia-agilidade', name: 'Melodia de Agilidade', archetype: 'Bardo', fantasy: 'Melodia que aprimora reflexos', description: '+50% esquiva por 3 turnos.', basedOn: ['Agilidade', 'Carisma'], unlockLevel: 15, cooldown: 2, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 10, effectType: 'buff', effectLabel: '+50% esquiva por 3 turnos', fixedPower: 50, synergy: 'Com Caçador: +80% esquiva' },
    { id: 'brd-dissonancia-mental', name: 'Dissonância Mental', archetype: 'Bardo', fantasy: 'Som discordante que enfraquece', description: '-3 defesa inimigo por 2 turnos.', basedOn: ['Carisma', 'Inteligencia'], unlockLevel: 17, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 12, effectType: 'debuff', effectLabel: '-3 defesa inimigo por 2 turnos', fixedPower: 3, synergy: 'Com Sábio: -5 defesa + confusão' },
    { id: 'brd-cantico-restaurador', name: 'Cântico Restaurador', archetype: 'Bardo', fantasy: 'Melodia curativa suave', description: '+20 HP/turno por 2 turnos.', basedOn: ['Sabedoria', 'Carisma'], unlockLevel: 19, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 8, effectType: 'heal', effectLabel: '+20 HP/turno por 2 turnos', fixedPower: 40, synergy: 'Com Sacerdote: +35 HP/turno' },
    { id: 'brd-harmonia-perfeita', name: 'Harmonia Perfeita', archetype: 'Bardo', fantasy: 'Sincronização de ritmo', description: 'Aliados sincronizam turno.', basedOn: ['Relacionamento', 'Carisma'], unlockLevel: 21, cooldown: 4, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 14, effectType: 'buff', effectLabel: 'Aliados sincronizam turno (1 turno)', fixedPower: 30, synergy: 'Com Monge: Sincronizam 2 turnos' },
    { id: 'brd-sinfonia-de-guerra', name: 'Sinfonia de Guerra', archetype: 'Bardo', fantasy: 'Canção épica de batalha', description: '+30% dano para todos por 3 turnos.', basedOn: ['Carisma', 'Disciplina'], unlockLevel: 23, cooldown: 4, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 16, effectType: 'buff', effectLabel: '+30% dano para time por 3 turnos', fixedPower: 30, synergy: 'Com Templário: +50% dano' },
  ],
  'Caçador': [
    { id: 'cac-golpe-certeiro', name: 'Golpe Certeiro', archetype: 'Caçador', fantasy: 'Mira aprimorada', description: 'Próximo ataque crítico +80% dano.', basedOn: ['Agilidade', 'Disciplina'], unlockLevel: 15, cooldown: 2, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 11, effectType: 'buff', effectLabel: 'Próximo ataque crítico +80% dano', fixedPower: 80, synergy: 'Com Bardo: Crítico +120% dano' },
    { id: 'cac-rastreador-implacavel', name: 'Rastreador Implacável', archetype: 'Caçador', fantasy: 'Marcação de caça', description: 'Marca inimigo: +25% dano por 4 turnos.', basedOn: ['Agilidade', 'Inteligencia'], unlockLevel: 17, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 9, effectType: 'debuff', effectLabel: 'Marca inimigo: +25% dano por 4 turnos', fixedPower: 25, synergy: 'Com Mercenário: +40% dano' },
    { id: 'cac-investida-predatoria', name: 'Investida Predatória', archetype: 'Caçador', fantasy: 'Ataque com vampirismo', description: 'Ataque + cura 30% do dano causado.', basedOn: ['Agilidade', 'Forca'], unlockLevel: 19, cooldown: 3, factor: 0.45, tier: 'classe', category: 'fisica', mpCost: 13, effectType: 'dano', effectLabel: 'Ataque + cura 30% do dano', synergy: 'Com Templário: Cura 50% do dano' },
    { id: 'cac-multiplos-disparos', name: 'Múltiplos Disparos', archetype: 'Caçador', fantasy: 'Chuva de flechas', description: '3 ataques de 70 dano cada.', basedOn: ['Agilidade', 'Criatividade'], unlockLevel: 21, cooldown: 4, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 14, effectType: 'dano', effectLabel: '3 ataques aleatórios — 70 dano cada', fixedPower: 210, synergy: 'Com Arruaceiro: 5 ataques' },
    { id: 'cac-instinto-de-caca', name: 'Instinto de Caça', archetype: 'Caçador', fantasy: 'Fraqueza exposta', description: 'Inimigo marcado sofre -40% defesa.', basedOn: ['Agilidade', 'Sabedoria'], unlockLevel: 23, cooldown: 4, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 15, effectType: 'debuff', effectLabel: 'Inimigo marcado sofre -40% defesa', fixedPower: 40, synergy: 'Com Mercenário: -60% defesa' },
  ],
  'Cavaleiro': [
    { id: 'cav-escudo-da-fe', name: 'Escudo da Fé', archetype: 'Cavaleiro', fantasy: 'Barreira sagrada de aço', description: 'Absorve 120 DMG + transfere 50% dano.', basedOn: ['Resiliencia', 'Sabedoria'], unlockLevel: 15, cooldown: 2, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 9, effectType: 'buff', effectLabel: 'Absorve 120 DMG + transfere 50% dano', fixedPower: 120, synergy: 'Com Alquimista: Transfere 100% dano' },
    { id: 'cav-investida-defensiva', name: 'Investida Defensiva', archetype: 'Cavaleiro', fantasy: 'Avanço protetor', description: 'Ataque + -30% dano recebido por 2 turnos.', basedOn: ['Forca', 'Resiliencia'], unlockLevel: 17, cooldown: 3, factor: 0.35, tier: 'classe', category: 'fisica', mpCost: 10, effectType: 'dano', effectLabel: 'Ataque + -30% dano recebido por 2 turnos', synergy: 'Com Monge: -50% dano' },
    { id: 'cav-parede-de-aco', name: 'Parede de Aço', archetype: 'Cavaleiro', fantasy: 'Barreira intransponível', description: 'Provoca inimigos, +1 ARM/turno.', basedOn: ['Resiliencia', 'Disciplina'], unlockLevel: 19, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 11, effectType: 'buff', effectLabel: 'Provoca inimigos, +1 ARM/turno', fixedPower: 30, synergy: 'Com Mecânico: +2 ARM/turno' },
    { id: 'cav-contragolpe-absoluto', name: 'Contragolpe Absoluto', archetype: 'Cavaleiro', fantasy: 'Espelho de dano', description: 'Reflete 100% do dano recebido.', basedOn: ['Forca', 'Disciplina'], unlockLevel: 21, cooldown: 4, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 13, effectType: 'buff', effectLabel: 'Reflete 100% dano recebido', fixedPower: 100, synergy: 'Com Templário: Reflete + 50 dano' },
    { id: 'cav-ultimo-suspiro', name: 'Último Suspiro', archetype: 'Cavaleiro', fantasy: 'Resistência inabalável', description: 'HP<50%: -80% dano inimigo.', basedOn: ['Resiliencia', 'Vitalidade'], unlockLevel: 23, cooldown: 4, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 16, effectType: 'buff', effectLabel: 'Quando perde >50% HP: -80% dano inimigo', fixedPower: 80, synergy: 'Com Sacerdote: +40 HP automático' },
  ],
  'Templário': [
    { id: 'tmp-golpe-sagrado', name: 'Golpe Sagrado', archetype: 'Templário', fantasy: 'Lâmina abençoada', description: '70 dano + cura AOE 40 HP.', basedOn: ['Forca', 'Sabedoria'], unlockLevel: 15, cooldown: 2, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 12, effectType: 'dano', effectLabel: '70 dano + cura AOE 40 HP', fixedPower: 70, synergy: 'Com Sacerdote: Cura 60 HP' },
    { id: 'tmp-bencao-da-luta', name: 'Benção da Luta', archetype: 'Templário', fantasy: 'Vigor sagrado em batalha', description: '+20% dano + lifesteal 50%.', basedOn: ['Sabedoria', 'Forca'], unlockLevel: 17, cooldown: 3, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 10, effectType: 'buff', effectLabel: '+20% dano + lifesteal 50%', fixedPower: 20, synergy: 'Com Caçador: Lifesteal 70%' },
    { id: 'tmp-julgamento-divino', name: 'Julgamento Divino', archetype: 'Templário', fantasy: 'Sentença celestial', description: 'Remove buffs inimigo + 100 dano.', basedOn: ['Sabedoria', 'Disciplina'], unlockLevel: 19, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 14, effectType: 'dano', effectLabel: 'Remove buffs inimigo + 100 dano', fixedPower: 100, synergy: 'Com Sábio: 150 dano' },
    { id: 'tmp-purificacao-sagrada', name: 'Purificação Sagrada', archetype: 'Templário', fantasy: 'Limpeza divina', description: 'Remove debuffs + +30% defesa.', basedOn: ['Sabedoria', 'Resiliencia'], unlockLevel: 21, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 13, effectType: 'buff', effectLabel: 'Remove debuffs aliados + +30% defesa', fixedPower: 30, synergy: 'Com Monge: +50% defesa' },
    { id: 'tmp-ira-retardataria', name: 'Ira Retardatária', archetype: 'Templário', fantasy: 'Maldição de combate', description: 'Inimigo sofre +25% dano por 4 turnos.', basedOn: ['Forca', 'Sabedoria'], unlockLevel: 23, cooldown: 4, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 15, effectType: 'debuff', effectLabel: 'Inimigo sofre +25% dano por 4 turnos', fixedPower: 25, synergy: 'Com Mercenário: +40% dano' },
  ],
  'Mercenário': [
    { id: 'mer-roubo-de-essencia', name: 'Roubo de Essência', archetype: 'Mercenário', fantasy: 'Drenagem arcana', description: 'Rouba 20% MP do inimigo.', basedOn: ['Agilidade', 'Inteligencia'], unlockLevel: 15, cooldown: 2, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 11, effectType: 'utility', effectLabel: 'Rouba 20% MP máximo do inimigo', fixedPower: 20, synergy: 'Com Alquimista: Rouba 30% MP' },
    { id: 'mer-golpe-duplo', name: 'Golpe Duplo', archetype: 'Mercenário', fantasy: 'Lâminas gêmeas', description: '2 ataques rápidos, crítico 50%.', basedOn: ['Agilidade', 'Forca'], unlockLevel: 17, cooldown: 3, factor: 0.4, tier: 'classe', category: 'fisica', mpCost: 10, effectType: 'dano', effectLabel: '2 ataques rápidos — crítico 50%', synergy: 'Com Caçador: Crítico 100%' },
    { id: 'mer-ganancia', name: 'Ganância', archetype: 'Mercenário', fantasy: 'Cobiça energizante', description: 'Crítico restaura 40 MP.', basedOn: ['Agilidade', 'Carisma'], unlockLevel: 19, cooldown: 3, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 8, effectType: 'utility', effectLabel: 'Crítico restaura 40 MP', fixedPower: 40, synergy: 'Com Sábio: Crítico restaura 60 MP' },
    { id: 'mer-furto-aereo', name: 'Furto Aéreo', archetype: 'Mercenário', fantasy: 'Roubo acrobático', description: 'Rouba item + 80 dano.', basedOn: ['Agilidade', 'Criatividade'], unlockLevel: 21, cooldown: 4, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 12, effectType: 'dano', effectLabel: 'Rouba item inimigo + 80 dano', fixedPower: 80, synergy: 'Com Arruaceiro: Rouba 2 itens' },
    { id: 'mer-morte-subita', name: 'Morte Súbita', archetype: 'Mercenário', fantasy: 'Golpe que apaga esperança', description: 'Crítico = -20% HP máximo inimigo.', basedOn: ['Agilidade', 'Disciplina'], unlockLevel: 23, cooldown: 4, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 16, effectType: 'dano', effectLabel: 'Crítico = -20% HP máximo inimigo', fixedPower: 20, synergy: 'Com Bruxo: Crítico = -40% HP' },
  ],
  'Arruaceiro': [
    { id: 'arr-cortina-de-fumaca', name: 'Cortina de Fumaça', archetype: 'Arruaceiro', fantasy: 'Névoa confusora', description: '-30% acurácia AOE por 2 turnos.', basedOn: ['Agilidade', 'Criatividade'], unlockLevel: 15, cooldown: 2, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 9, effectType: 'debuff', effectLabel: '-30% acurácia AOE por 2 turnos', fixedPower: 30, synergy: 'Com Bardo: -50% acurácia' },
    { id: 'arr-sapato-de-chumbo', name: 'Sapato de Chumbo', archetype: 'Arruaceiro', fantasy: 'Golpe imobilizador', description: 'Imobiliza + 60 dano.', basedOn: ['Forca', 'Agilidade'], unlockLevel: 17, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 10, effectType: 'cc', effectLabel: 'Imobiliza + 60 dano', fixedPower: 60, synergy: 'Com Mecânico: Imobiliza 2 turnos' },
    { id: 'arr-caos-descontrolado', name: 'Caos Descontrolado', archetype: 'Arruaceiro', fantasy: 'Explosão caótica', description: 'AOE 50–100 dano aleatório.', basedOn: ['Criatividade', 'Forca'], unlockLevel: 19, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 13, effectType: 'dano', effectLabel: 'AOE 50–100 dano aleatório', fixedPower: 75, synergy: 'Com Mercenário: AOE 80–150 dano' },
    { id: 'arr-explosao-de-fumaca', name: 'Explosão de Fumaça', archetype: 'Arruaceiro', fantasy: 'Cortina de fuga', description: 'Fuga garantida + aliados escapam.', basedOn: ['Agilidade', 'Carisma'], unlockLevel: 21, cooldown: 4, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 14, effectType: 'utility', effectLabel: 'Fuga garantida + aliados escapam', fixedPower: 0, synergy: 'Com Bardo: Aliados levam bônus' },
    { id: 'arr-zona-de-desordem', name: 'Zona de Desordem', archetype: 'Arruaceiro', fantasy: 'Caos total em área', description: 'Inimigos confusos por 3 turnos.', basedOn: ['Carisma', 'Criatividade'], unlockLevel: 23, cooldown: 4, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 15, effectType: 'cc', effectLabel: 'Inimigos confusos por 3 turnos', fixedPower: 3, synergy: 'Com Sábio: Confusão + silêncio' },
  ],
  'Sacerdote': [
    { id: 'sac-graca-divina', name: 'Graça Divina', archetype: 'Sacerdote', fantasy: 'Bênção curativa divina', description: '+60 HP + remove 1 debuff.', basedOn: ['Sabedoria', 'Relacionamento'], unlockLevel: 15, cooldown: 2, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 8, effectType: 'heal', effectLabel: '+60 HP + remove 1 debuff', fixedPower: 60, synergy: 'Com Alquimista: +80 HP' },
    { id: 'sac-protecao-sagrada', name: 'Proteção Sagrada', archetype: 'Sacerdote', fantasy: 'Escudo divino temporário', description: '-50% dano próximo turno.', basedOn: ['Sabedoria', 'Resiliencia'], unlockLevel: 17, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 10, effectType: 'buff', effectLabel: '-50% dano próximo turno', fixedPower: 50, synergy: 'Com Cavaleiro: -70% dano' },
    { id: 'sac-ressurreicao-menor', name: 'Ressurreição Menor', archetype: 'Sacerdote', fantasy: 'Retorno da morte', description: 'Revive aliado com 30 HP (1x/combate).', basedOn: ['Sabedoria', 'Vitalidade'], unlockLevel: 19, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 16, effectType: 'heal', effectLabel: 'Revive aliado com 30 HP (1x/combate)', fixedPower: 30, synergy: 'Com Monge: Revive com 50 HP' },
    { id: 'sac-escudo-divino', name: 'Escudo Divino', archetype: 'Sacerdote', fantasy: 'Barreira de luz sagrada', description: 'Aliado ganha escudo 80 DMG.', basedOn: ['Sabedoria', 'Disciplina'], unlockLevel: 21, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 12, effectType: 'buff', effectLabel: 'Aliado ganha escudo 80 DMG', fixedPower: 80, synergy: 'Com Templário: Escudo 120 DMG' },
    { id: 'sac-cura-em-massa', name: 'Cura em Massa', archetype: 'Sacerdote', fantasy: 'Onda de cura divina', description: 'Cura todos aliados +50 HP.', basedOn: ['Relacionamento', 'Sabedoria'], unlockLevel: 23, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 14, effectType: 'heal', effectLabel: 'Cura todos aliados +50 HP', fixedPower: 50, synergy: 'Com Bardo: +70 HP' },
  ],
  'Monge': [
    { id: 'mnk-equilibrio-perfeito', name: 'Equilíbrio Perfeito', archetype: 'Monge', fantasy: 'Harmonia vital', description: 'Iguala HP aliados (mín 50%).', basedOn: ['Sabedoria', 'Vitalidade'], unlockLevel: 15, cooldown: 2, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 9, effectType: 'heal', effectLabel: 'Iguala HP aliados (mínimo 50%)', fixedPower: 50, synergy: 'Com Sacerdote: Iguala 70% HP' },
    { id: 'mnk-meditacao-profunda', name: 'Meditação Profunda', archetype: 'Monge', fantasy: 'Foco meditativo', description: '+50% regen MP + imunidade 1 turno.', basedOn: ['Sabedoria', 'Disciplina'], unlockLevel: 17, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 7, effectType: 'utility', effectLabel: '+50% regen MP + imunidade 1 turno', fixedPower: 50, synergy: 'Com Alquimista: +75% regen MP' },
    { id: 'mnk-punho-da-serenidade', name: 'Punho da Serenidade', archetype: 'Monge', fantasy: 'Golpe paralisante zen', description: 'Desabilita inimigo 1 turno.', basedOn: ['Forca', 'Sabedoria'], unlockLevel: 19, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 11, effectType: 'cc', effectLabel: 'Desabilita inimigo 1 turno', fixedPower: 1, synergy: 'Com Templário: Desabilita 2 turnos' },
    { id: 'mnk-fluxo-harmonico', name: 'Fluxo Harmônico', archetype: 'Monge', fantasy: 'Ritmo de batalha', description: 'Aliados ganham +30% velocidade.', basedOn: ['Agilidade', 'Sabedoria'], unlockLevel: 21, cooldown: 4, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 13, effectType: 'buff', effectLabel: 'Aliados ganham +30% velocidade', fixedPower: 30, synergy: 'Com Bardo: +50% velocidade' },
    { id: 'mnk-despertar-espiritual', name: 'Despertar Espiritual', archetype: 'Monge', fantasy: 'Iluminação de batalha', description: 'Aliados ganham +40% dano por 3 turnos.', basedOn: ['Disciplina', 'Sabedoria'], unlockLevel: 23, cooldown: 4, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 15, effectType: 'buff', effectLabel: 'Aliados ganham +40% dano por 3 turnos', fixedPower: 40, synergy: 'Com Templário: +60% dano' },
  ],
  'Sábio': [
    { id: 'sab-palavra-de-poder', name: 'Palavra de Poder', archetype: 'Sábio', fantasy: 'Verbo incapacitante', description: 'Silencia inimigo 2 turnos.', basedOn: ['Inteligencia', 'Carisma'], unlockLevel: 15, cooldown: 2, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 13, effectType: 'cc', effectLabel: 'Silencia inimigo por 2 turnos', fixedPower: 2, synergy: 'Com Cavaleiro: +50% dano ao silenciado' },
    { id: 'sab-prisao-eterea', name: 'Prisão Etérea', archetype: 'Sábio', fantasy: 'Gaiola arcana', description: 'Imobiliza + -40% defesa por 3 turnos.', basedOn: ['Inteligencia', 'Disciplina'], unlockLevel: 17, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 15, effectType: 'cc', effectLabel: 'Imobiliza + -40% defesa por 3 turnos', fixedPower: 3, synergy: 'Com Mercenário: +30% crítico ao alvo' },
    { id: 'sab-analise-critica', name: 'Análise Crítica', archetype: 'Sábio', fantasy: 'Leitura de ponto fraco', description: '+40% dano próximos 3 turnos.', basedOn: ['Inteligencia', 'Sabedoria'], unlockLevel: 19, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 10, effectType: 'buff', effectLabel: '+40% dano próximos 3 turnos', fixedPower: 40, synergy: 'Com Caçador: Crítico 100%' },
    { id: 'sab-disrupcao-arcana', name: 'Disrupção Arcana', archetype: 'Sábio', fantasy: 'Cancelamento mágico', description: 'Desativa habilidades inimigo 2 turnos.', basedOn: ['Inteligencia', 'Criatividade'], unlockLevel: 21, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 14, effectType: 'cc', effectLabel: 'Desativa habilidades inimigo por 2 turnos', fixedPower: 2, synergy: 'Com Arruaceiro: Desativa 3 turnos' },
    { id: 'sab-visao-penetrante', name: 'Visão Penetrante', archetype: 'Sábio', fantasy: 'Percepção profunda de falhas', description: 'Revela fraquezas: +60% dano.', basedOn: ['Inteligencia', 'Sabedoria'], unlockLevel: 23, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 12, effectType: 'buff', effectLabel: 'Revela fraquezas: +60% dano ao inimigo', fixedPower: 60, synergy: 'Com Bruxo: +80% dano' },
  ],
  'Bruxo': [
    { id: 'brx-maldicao-profunda', name: 'Maldição Profunda', archetype: 'Bruxo', fantasy: 'Pragas das sombras', description: '+25% dano recebido pelo inimigo por 4 turnos.', basedOn: ['Inteligencia', 'Disciplina'], unlockLevel: 15, cooldown: 2, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 14, effectType: 'debuff', effectLabel: '+25% dano recebido pelo inimigo por 4 turnos', fixedPower: 25, synergy: 'Com Mercenário: +40% dano' },
    { id: 'brx-dreno-de-vida', name: 'Dreno de Vida', archetype: 'Bruxo', fantasy: 'Absorção sombria', description: '90 dano + cura 50% do dano.', basedOn: ['Inteligencia', 'Vitalidade'], unlockLevel: 17, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 12, effectType: 'dano', effectLabel: '90 dano + cura 50% do dano', fixedPower: 90, synergy: 'Com Templário: Cura 75%' },
    { id: 'brx-noite-eterna', name: 'Noite Eterna', archetype: 'Bruxo', fantasy: 'Trevas infinitas', description: 'AOE 80 dano + nega buffs inimigo.', basedOn: ['Inteligencia', 'Criatividade'], unlockLevel: 19, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 16, effectType: 'dano', effectLabel: 'AOE 80 dano + nega buffs inimigo', fixedPower: 80, synergy: 'Com Arruaceiro: AOE 120 dano' },
    { id: 'brx-corrupcao-lenta', name: 'Corrupção Lenta', archetype: 'Bruxo', fantasy: 'Veneno de sombra', description: 'Inimigo perde 5% HP/turno por 3 turnos.', basedOn: ['Inteligencia', 'Disciplina'], unlockLevel: 21, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 13, effectType: 'debuff', effectLabel: 'Inimigo perde 5% HP/turno por 3 turnos', fixedPower: 5, synergy: 'Sem sinergia (efeito solo)' },
    { id: 'brx-sacrificio-profano', name: 'Sacrifício Profano', archetype: 'Bruxo', fantasy: 'Poder à custa de sangue', description: '150 dano + perde 30 HP.', basedOn: ['Inteligencia', 'Forca'], unlockLevel: 23, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 15, effectType: 'dano', effectLabel: '150 dano + perde 30 HP', fixedPower: 150, synergy: 'Com Monge: 200 dano, perde 20 HP' },
  ],

  // ================================================================
  // T4 CLASS SKILLS — Classe 3 (Nv.25-34)
  // ================================================================

  'Lorde': [
    { id: 'lrd-ordem-de-avanco', name: 'Ordem de Avanço', archetype: 'Lorde', fantasy: 'Comando que inspira vitória', description: '+40% dano para todos por 3 turnos.', basedOn: ['Forca', 'Relacionamento'], unlockLevel: 25, cooldown: 3, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 15, effectType: 'buff', effectLabel: '+40% dano para time por 3 turnos', fixedPower: 40, synergy: 'Com Bardo: +60% dano' },
    { id: 'lrd-escudo-vivo', name: 'Escudo Vivo', archetype: 'Lorde', fantasy: 'Barreira de aço inquebrantável', description: 'Absorve 200 DMG + transfere excesso para aliado mais forte.', basedOn: ['Resiliencia', 'Forca'], unlockLevel: 27, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 17, effectType: 'buff', effectLabel: 'Absorve 200 DMG + transfere excesso ao aliado', fixedPower: 200, synergy: 'Com Cavaleiro: Absorve 280 DMG' },
    { id: 'lrd-grito-de-guerra', name: 'Grito de Guerra', archetype: 'Lorde', fantasy: 'Brado que eleva o moral', description: '+30% velocidade + -25% dano recebido por 3 turnos.', basedOn: ['Carisma', 'Disciplina'], unlockLevel: 29, cooldown: 4, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 18, effectType: 'buff', effectLabel: '+30% velocidade + -25% dano recebido por 3t', fixedPower: 30, synergy: 'Com Monge: +50% velocidade' },
    { id: 'lrd-desafio-real', name: 'Desafio Real', archetype: 'Lorde', fantasy: 'Provocação soberana', description: 'Provoca inimigo + -50% dano inimigo por 3 turnos.', basedOn: ['Resiliencia', 'Carisma'], unlockLevel: 31, cooldown: 4, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 20, effectType: 'buff', effectLabel: 'Provoca + inimigo sofre -50% dano por 3t', fixedPower: 50, synergy: 'Com Templário: -70% dano inimigo' },
    { id: 'lrd-bastiao-inabalavel', name: 'Bastião Inabalável', archetype: 'Lorde', fantasy: 'Última resistência real', description: 'HP <30%: ressurge com 40 HP + escudo 150 DMG (1x/combate).', basedOn: ['Resiliencia', 'Vitalidade'], unlockLevel: 33, cooldown: 5, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 22, effectType: 'buff', effectLabel: 'HP<30%: ressurge 40 HP + escudo 150 (1x)', fixedPower: 150, synergy: 'Com Sacerdote: Ressurge com 80 HP' },
  ],

  'Paladino': [
    { id: 'pal-lancada-sagrada', name: 'Lançada Sagrada', archetype: 'Paladino', fantasy: 'Golpe que une força e fé', description: '120 dano + cura self 60 HP.', basedOn: ['Forca', 'Sabedoria'], unlockLevel: 25, cooldown: 2, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 14, effectType: 'dano', effectLabel: '120 dano + cura 60 HP', fixedPower: 120, synergy: 'Com Sacerdote: Cura 90 HP' },
    { id: 'pal-aura-de-recuperacao', name: 'Aura de Recuperação', archetype: 'Paladino', fantasy: 'Presença que cura ao redor', description: '+25 HP/turno para todos por 4 turnos.', basedOn: ['Sabedoria', 'Relacionamento'], unlockLevel: 27, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 16, effectType: 'heal', effectLabel: '+25 HP/turno para todos por 4 turnos', fixedPower: 100, synergy: 'Com Monge: +40 HP/turno' },
    { id: 'pal-julgamento-final', name: 'Julgamento Final', archetype: 'Paladino', fantasy: 'Sentença que encerra batalhas', description: '150 dano + remove TODOS buffs do inimigo.', basedOn: ['Sabedoria', 'Forca'], unlockLevel: 29, cooldown: 3, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 18, effectType: 'dano', effectLabel: '150 dano + remove TODOS buffs inimigo', fixedPower: 150, synergy: 'Com Sábio: 200 dano' },
    { id: 'pal-consagracao', name: 'Consagração', archetype: 'Paladino', fantasy: 'Chão sagrado que queima hereges', description: 'AOE 90 dano + -40% defesa inimigo por 3 turnos.', basedOn: ['Sabedoria', 'Disciplina'], unlockLevel: 31, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 20, effectType: 'dano', effectLabel: 'AOE 90 dano + -40% defesa inimigo por 3t', fixedPower: 90, synergy: 'Com Caçador: -60% defesa' },
    { id: 'pal-armadura-da-luz', name: 'Armadura da Luz', archetype: 'Paladino', fantasy: 'Proteção divina absoluta', description: 'Escudo 200 DMG + lifesteal 70% por 3 turnos.', basedOn: ['Resiliencia', 'Sabedoria'], unlockLevel: 33, cooldown: 4, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 22, effectType: 'buff', effectLabel: 'Escudo 200 DMG + lifesteal 70% por 3t', fixedPower: 200, synergy: 'Com Cavaleiro: Escudo 280 DMG' },
  ],

  'Arquimago': [
    { id: 'arqm-noite-absoluta', name: 'Noite Absoluta', archetype: 'Arquimago', fantasy: 'Trevas que consomem tudo', description: 'AOE 180 dano (custa 30 HP próprio).', basedOn: ['Inteligencia', 'Disciplina'], unlockLevel: 25, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 18, effectType: 'dano', effectLabel: 'AOE 180 dano (perde 30 HP)', fixedPower: 180, synergy: 'Com Bruxo: AOE 240 dano' },
    { id: 'arqm-maldicao-ancestral', name: 'Maldição Ancestral', archetype: 'Arquimago', fantasy: 'Praga de eras passadas', description: '+50% dano recebido pelo inimigo por 5 turnos.', basedOn: ['Inteligencia', 'Criatividade'], unlockLevel: 27, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 16, effectType: 'debuff', effectLabel: 'Inimigo recebe +50% dano por 5t', fixedPower: 50, synergy: 'Com Mercenário: +70% dano' },
    { id: 'arqm-dreno-catacismico', name: 'Dreno Cataclísmico', archetype: 'Arquimago', fantasy: 'Absorção total de essência vital', description: '200 dano + cura 100 HP.', basedOn: ['Inteligencia', 'Vitalidade'], unlockLevel: 29, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 20, effectType: 'dano', effectLabel: '200 dano + cura 100 HP', fixedPower: 200, synergy: 'Com Templário: Cura 150 HP' },
    { id: 'arqm-singularidade-sombria', name: 'Singularidade Sombria', archetype: 'Arquimago', fantasy: 'Concentração máxima de trevas', description: '250 dano + perde 50 HP próprio.', basedOn: ['Inteligencia', 'Forca'], unlockLevel: 31, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 22, effectType: 'dano', effectLabel: '250 dano (perde 50 HP)', fixedPower: 250, synergy: 'Com Bruxo: 320 dano' },
    { id: 'arqm-apocalipse-sombrio', name: 'Apocalipse Sombrio', archetype: 'Arquimago', fantasy: 'Fim de tudo em trevas absolutas', description: 'AOE 300 dano + inimigos perdem -30% HP máximo (1x/combate).', basedOn: ['Inteligencia', 'Sabedoria'], unlockLevel: 33, cooldown: 5, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 25, effectType: 'dano', effectLabel: 'AOE 300 dano + -30% HP máx inimigos (1x)', fixedPower: 300, synergy: 'Sem sinergia (poder solo absoluto)' },
  ],

  'Professor': [
    { id: 'prf-licao-de-fraqueza', name: 'Lição de Fraqueza', archetype: 'Professor', fantasy: 'Conhecimento que expõe o inimigo', description: 'Inimigo recebe +70% dano por 4 turnos.', basedOn: ['Inteligencia', 'Sabedoria'], unlockLevel: 25, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 14, effectType: 'debuff', effectLabel: 'Inimigo recebe +70% dano por 4t', fixedPower: 70, synergy: 'Com Caçador: +90% dano' },
    { id: 'prf-barreira-arcana', name: 'Barreira Arcana', archetype: 'Professor', fantasy: 'Escudo de conhecimento puro', description: 'Escudo 150 DMG + silencia inimigo 2 turnos.', basedOn: ['Inteligencia', 'Disciplina'], unlockLevel: 27, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 16, effectType: 'buff', effectLabel: 'Escudo 150 DMG + silencia inimigo 2t', fixedPower: 150, synergy: 'Com Cavaleiro: Escudo 200 DMG' },
    { id: 'prf-controle-total', name: 'Controle Total', archetype: 'Professor', fantasy: 'Dominação arcana completa', description: 'Imobiliza + silencia + -50% defesa inimigo por 2 turnos.', basedOn: ['Inteligencia', 'Carisma'], unlockLevel: 29, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 20, effectType: 'cc', effectLabel: 'Imobiliza + silencia + -50% defesa por 2t', fixedPower: 2, synergy: 'Com Arruaceiro: Imobiliza 3 turnos' },
    { id: 'prf-amplificador-genio', name: 'Amplificador de Gênio', archetype: 'Professor', fantasy: 'Potencializa o talento aliado', description: 'Aliados ganham +50% dano e eficiência de skill por 3 turnos.', basedOn: ['Relacionamento', 'Inteligencia'], unlockLevel: 31, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 18, effectType: 'buff', effectLabel: '+50% dano + eficiência de skills aliados por 3t', fixedPower: 50, synergy: 'Com Bardo: +70% dano' },
    { id: 'prf-teoria-do-caos', name: 'Teoria do Caos', archetype: 'Professor', fantasy: 'Cálculo que paralisa o mundo', description: 'Desativa TODAS as skills do inimigo por 3 turnos (1x/combate).', basedOn: ['Inteligencia', 'Criatividade'], unlockLevel: 33, cooldown: 5, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 22, effectType: 'cc', effectLabel: 'Desativa skills inimigo por 3t (1x)', fixedPower: 3, synergy: 'Com Sábio: Desativa 4 turnos' },
  ],

  'Algoz': [
    { id: 'alg-golpe-de-oportunidade', name: 'Golpe de Oportunidade', archetype: 'Algoz', fantasy: 'Aproveita cada brecha do inimigo', description: 'Inimigo debuffado: +100% dano neste golpe.', basedOn: ['Agilidade', 'Forca'], unlockLevel: 25, cooldown: 2, factor: 0.5, tier: 'classe', category: 'fisica', mpCost: 14, effectType: 'dano', effectLabel: '+100% dano se inimigo está debuffado', synergy: 'Com Bruxo: +130% dano debuffado' },
    { id: 'alg-lamina-envenenada', name: 'Lâmina Envenenada', archetype: 'Algoz', fantasy: 'Veneno de execução lenta', description: '80 dano + 8% HP do inimigo por turno por 4 turnos.', basedOn: ['Agilidade', 'Disciplina'], unlockLevel: 27, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 16, effectType: 'dano', effectLabel: '80 dano + 8% HP inimigo/turno por 4t', fixedPower: 80, synergy: 'Com Bruxo: 10% HP/turno' },
    { id: 'alg-execucao-brutal', name: 'Execução Brutal', archetype: 'Algoz', fantasy: 'Golpe finalizador sem piedade', description: 'HP inimigo <40%: causa 300 dano garantido.', basedOn: ['Forca', 'Agilidade'], unlockLevel: 29, cooldown: 4, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 20, effectType: 'dano', effectLabel: 'HP inimigo <40%: 300 dano garantido', fixedPower: 300, synergy: 'Com Mercenário: Limiar 50% HP' },
    { id: 'alg-sombra-assassina', name: 'Sombra Assassina', archetype: 'Algoz', fantasy: 'Desaparece para atacar com tudo', description: 'Stealth 1 turno → próximo ataque crítico garantido +150% dano.', basedOn: ['Agilidade', 'Criatividade'], unlockLevel: 31, cooldown: 4, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 18, effectType: 'buff', effectLabel: 'Stealth 1t → próximo golpe +150% crítico', fixedPower: 150, synergy: 'Com Caçador: +200% crítico' },
    { id: 'alg-sentenca-final', name: 'Sentença Final', archetype: 'Algoz', fantasy: 'A morte não tem apelação', description: 'Remove 40% do HP máximo do inimigo permanentemente (1x/combate).', basedOn: ['Forca', 'Disciplina'], unlockLevel: 33, cooldown: 5, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 22, effectType: 'dano', effectLabel: '-40% HP máximo inimigo permanente (1x)', fixedPower: 40, synergy: 'Com Mercenário: -55% HP máximo' },
  ],

  'Desordeiro': [
    { id: 'des-roleta-de-golpes', name: 'Roleta de Golpes', archetype: 'Desordeiro', fantasy: 'Nunca se sabe o que vem a seguir', description: 'Efeito aleatório: 150 dano / imobiliza 2t / -50% defesa.', basedOn: ['Criatividade', 'Agilidade'], unlockLevel: 25, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 14, effectType: 'dano', effectLabel: 'Aleatório: 150 dano / imobiliza 2t / -50% def', fixedPower: 150, synergy: 'Com Arruaceiro: 2 efeitos simultâneos' },
    { id: 'des-explosao-caotica', name: 'Explosão Caótica', archetype: 'Desordeiro', fantasy: 'Deflagração imprevisível em área', description: 'AOE 100–200 dano aleatório.', basedOn: ['Forca', 'Criatividade'], unlockLevel: 27, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 16, effectType: 'dano', effectLabel: 'AOE 100–200 dano aleatório', fixedPower: 150, synergy: 'Com Arruaceiro: AOE 150–280 dano' },
    { id: 'des-fator-desconhecido', name: 'Fator Desconhecido', archetype: 'Desordeiro', fantasy: 'Carta coringa absoluta', description: 'Aleatório: dobra próximo dano / cura 80 HP / restaura 60 MP.', basedOn: ['Criatividade', 'Carisma'], unlockLevel: 29, cooldown: 3, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 15, effectType: 'utility', effectLabel: 'Aleatório: 2x dano / +80 HP / +60 MP', fixedPower: 80, synergy: 'Com Bardo: 80% de efeito bônus' },
    { id: 'des-bomba-de-confusao', name: 'Bomba de Confusão', archetype: 'Desordeiro', fantasy: 'Caos total no campo de batalha', description: 'Todos inimigos confusos 3t + -40% acurácia 3t.', basedOn: ['Carisma', 'Criatividade'], unlockLevel: 31, cooldown: 4, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 18, effectType: 'cc', effectLabel: 'Inimigos confusos 3t + -40% acurácia 3t', fixedPower: 3, synergy: 'Com Arruaceiro: Confusão 5t' },
    { id: 'des-apocalipse-caos', name: 'Apocalipse Caótico', archetype: 'Desordeiro', fantasy: 'Entropia máxima — o caos vence tudo', description: 'Efeito massivo aleatório: 400 dano / -60% HP máx inimigos / triplo buffs aliados.', basedOn: ['Criatividade', 'Forca'], unlockLevel: 33, cooldown: 5, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 22, effectType: 'dano', effectLabel: 'Aleatório: 400 dano / -60% HP máx / 3x buffs', fixedPower: 400, synergy: 'Sem sinergia (caos é imprevisível)' },
  ],

  'Mestre-Ferreiro': [
    { id: 'mfe-forja-emergencial', name: 'Forja Emergencial', archetype: 'Mestre-Ferreiro', fantasy: 'Artesão improvisa em plena batalha', description: 'Forja poção de combate: escolhe +80 HP ou +50 MP.', basedOn: ['Inteligencia', 'Forca'], unlockLevel: 25, cooldown: 3, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 14, effectType: 'utility', effectLabel: 'Forja poção: +80 HP OU +50 MP (escolha)', fixedPower: 80, synergy: 'Com Alquimista: +120 HP ou +80 MP' },
    { id: 'mfe-runa-de-guerra', name: 'Runa de Guerra', archetype: 'Mestre-Ferreiro', fantasy: 'Inscreve poder nas armas aliadas', description: '+35% dano para todos por 4 turnos.', basedOn: ['Forca', 'Disciplina'], unlockLevel: 27, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 16, effectType: 'buff', effectLabel: '+35% dano para time por 4 turnos', fixedPower: 35, synergy: 'Com Bardo: +55% dano' },
    { id: 'mfe-olho-de-garimpeiro', name: 'Olho de Garimpeiro', archetype: 'Mestre-Ferreiro', fantasy: 'Faro apurado para o que é raro', description: '+50% chance de drop de item raro neste combate.', basedOn: ['Sabedoria', 'Criatividade'], unlockLevel: 29, cooldown: 4, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 12, effectType: 'utility', effectLabel: '+50% chance drop de item raro no combate', fixedPower: 50, synergy: 'Com Alquimista: +75% drop' },
    { id: 'mfe-arsenal-aprimorado', name: 'Arsenal Aprimorado', archetype: 'Mestre-Ferreiro', fantasy: 'Equipa arma forjada com maestria', description: '+40% dano + +20% defesa por 5 turnos.', basedOn: ['Forca', 'Resiliencia'], unlockLevel: 31, cooldown: 4, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 18, effectType: 'buff', effectLabel: '+40% dano + +20% defesa por 5 turnos', fixedPower: 40, synergy: 'Com Mecânico: +40% dano e +40% defesa' },
    { id: 'mfe-mestre-da-forja', name: 'Mestre da Forja', archetype: 'Mestre-Ferreiro', fantasy: 'Crafting lendário em campo de batalha', description: 'Fim do combate: 100% item extra + ouro extra converte em +50 HP (1x/dungeon).', basedOn: ['Inteligencia', 'Criatividade'], unlockLevel: 33, cooldown: 5, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 20, effectType: 'utility', effectLabel: '100% item extra pós-combate + ouro→+50 HP (1x/dungeon)', fixedPower: 100, synergy: 'Com Alquimista: Item épico garantido' },
  ],

  'Criador': [
    { id: 'cri-turret-basica', name: 'Turret Básica', archetype: 'Criador', fantasy: 'Máquina de guerra autônoma', description: 'Invoca turret: 40 dano/turno por 3 turnos.', basedOn: ['Inteligencia', 'Disciplina'], unlockLevel: 25, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 14, effectType: 'dano', effectLabel: 'Turret ativa: 40 dano/turno por 3t', fixedPower: 120, synergy: 'Com Mecânico: Turret 60 dano/turno' },
    { id: 'cri-campo-de-minas', name: 'Campo de Minas', archetype: 'Criador', fantasy: 'Armadilhas mecânicas invisíveis', description: 'Armadilhas: 80 dano + imobiliza ao ser ativada (dura 2t).', basedOn: ['Inteligencia', 'Criatividade'], unlockLevel: 27, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 16, effectType: 'cc', effectLabel: 'Armadilha: 80 dano + imobiliza ao atacar (2t)', fixedPower: 80, synergy: 'Com Arruaceiro: +confusão na explosão' },
    { id: 'cri-golem-protetor', name: 'Golem Protetor', archetype: 'Criador', fantasy: 'Guardião mecânico de pedra e aço', description: 'Golem absorve 200 DMG por 4 turnos.', basedOn: ['Resiliencia', 'Inteligencia'], unlockLevel: 29, cooldown: 4, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 18, effectType: 'buff', effectLabel: 'Golem: absorve 200 DMG por 4 turnos', fixedPower: 200, synergy: 'Com Cavaleiro: Golem absorve 280 DMG' },
    { id: 'cri-sistema-de-reparo', name: 'Sistema de Reparo', archetype: 'Criador', fantasy: 'Auto-manutenção em pleno combate', description: 'Auto-reparo ativo: +30 HP/turno por 4 turnos.', basedOn: ['Resiliencia', 'Vitalidade'], unlockLevel: 31, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 16, effectType: 'heal', effectLabel: '+30 HP/turno por 4 turnos', fixedPower: 120, synergy: 'Com Alquimista: +50 HP/turno' },
    { id: 'cri-exercito-mecanico', name: 'Exército Mecânico', archetype: 'Criador', fantasy: 'Legião de autômatos de guerra', description: '3 construtos: 60 dano cada por 5 turnos (1x/combate).', basedOn: ['Inteligencia', 'Forca'], unlockLevel: 33, cooldown: 5, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 22, effectType: 'dano', effectLabel: '3 construtos: 60 dano cada por 5t (1x)', fixedPower: 900, synergy: 'Com Mecânico: Construtos com escudo 50 DMG' },
  ],

  'Sumo Sacerdote': [
    { id: 'ssp-bencao-suprema', name: 'Bênção Suprema', archetype: 'Sumo Sacerdote', fantasy: 'Toque divino de cura absoluta', description: '+100 HP para todos + remove todos debuffs.', basedOn: ['Sabedoria', 'Relacionamento'], unlockLevel: 25, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 16, effectType: 'heal', effectLabel: '+100 HP AOE + remove todos debuffs', fixedPower: 100, synergy: 'Com Bardo: +130 HP' },
    { id: 'ssp-golpe-celestial', name: 'Golpe Celestial', archetype: 'Sumo Sacerdote', fantasy: 'Luz que fere o profano e cura o justo', description: '140 dano sagrado + cura self 70 HP.', basedOn: ['Sabedoria', 'Forca'], unlockLevel: 27, cooldown: 3, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 18, effectType: 'dano', effectLabel: '140 dano + cura self 70 HP', fixedPower: 140, synergy: 'Com Templário: 180 dano + 100 HP' },
    { id: 'ssp-barreira-divina', name: 'Barreira Divina', archetype: 'Sumo Sacerdote', fantasy: 'Muro de luz sagrada intransponível', description: 'Todos aliados ganham escudo 150 DMG por 3 turnos.', basedOn: ['Sabedoria', 'Resiliencia'], unlockLevel: 29, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 18, effectType: 'buff', effectLabel: 'Escudo 150 DMG para todos por 3t', fixedPower: 150, synergy: 'Com Cavaleiro: Escudo 220 DMG' },
    { id: 'ssp-ressurreicao-maior', name: 'Ressurreição Maior', archetype: 'Sumo Sacerdote', fantasy: 'Retorno glorioso das trevas', description: 'Revive aliado com 80 HP + escudo 100 DMG.', basedOn: ['Sabedoria', 'Vitalidade'], unlockLevel: 31, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 20, effectType: 'heal', effectLabel: 'Revive aliado: 80 HP + escudo 100 DMG', fixedPower: 80, synergy: 'Com Monge: Revive com 120 HP' },
    { id: 'ssp-milagre-divino', name: 'Milagre Divino', archetype: 'Sumo Sacerdote', fantasy: 'Intervenção celestial suprema', description: 'Restaura todos aliados a 100% HP (1x/combate).', basedOn: ['Relacionamento', 'Sabedoria'], unlockLevel: 33, cooldown: 6, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 25, effectType: 'heal', effectLabel: 'Todos aliados → 100% HP (1x)', fixedPower: 999, synergy: 'Sem sinergia (poder divino absoluto)' },
  ],

  'Mestre Monge': [
    { id: 'mmk-contra-perfeito', name: 'Contra-Ataque Perfeito', archetype: 'Mestre Monge', fantasy: 'Flui como água, golpeia como pedra', description: 'Próximo ataque inimigo: bloqueia + revida com 200% dano.', basedOn: ['Agilidade', 'Sabedoria'], unlockLevel: 25, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 14, effectType: 'buff', effectLabel: 'Bloqueia próximo ataque + revida 200%', fixedPower: 200, synergy: 'Com Cavaleiro: Revida 250%' },
    { id: 'mmk-foco-espiritual', name: 'Foco Espiritual', archetype: 'Mestre Monge', fantasy: 'Converte energia espiritual em vida', description: 'Converte 30% MP atual em HP.', basedOn: ['Sabedoria', 'Vitalidade'], unlockLevel: 27, cooldown: 2, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 0, effectType: 'heal', effectLabel: 'Converte 30% MP → HP', fixedPower: 30, synergy: 'Com Alquimista: Converte 45% MP' },
    { id: 'mmk-golpe-chi', name: 'Golpe Chi', archetype: 'Mestre Monge', fantasy: 'Força vital canalizada no golpe', description: '180 dano + stun 1 turno.', basedOn: ['Forca', 'Sabedoria'], unlockLevel: 29, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 16, effectType: 'dano', effectLabel: '180 dano + stun 1 turno', fixedPower: 180, synergy: 'Com Templário: 220 dano' },
    { id: 'mmk-iluminacao', name: 'Iluminação', archetype: 'Mestre Monge', fantasy: 'Estado além do combate ordinário', description: 'Imunidade a TODOS os efeitos por 2 turnos.', basedOn: ['Sabedoria', 'Disciplina'], unlockLevel: 31, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 20, effectType: 'buff', effectLabel: 'Imunidade total por 2 turnos', fixedPower: 2, synergy: 'Com Sacerdote: Imunidade + +50 HP' },
    { id: 'mmk-explosao-do-espirito', name: 'Explosão do Espírito', archetype: 'Mestre Monge', fantasy: 'Liberação total do chi interior', description: '300 dano + +60% velocidade para time por 3 turnos.', basedOn: ['Forca', 'Agilidade'], unlockLevel: 33, cooldown: 5, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 22, effectType: 'dano', effectLabel: '300 dano + +60% velocidade time por 3t', fixedPower: 300, synergy: 'Com Bardo: +80% velocidade' },
  ],

  'Atirador de Elite': [
    { id: 'ate-mira-mortal', name: 'Mira Mortal', archetype: 'Atirador de Elite', fantasy: 'Olho de falcão em modo combate', description: 'Próximo ataque: crítico garantido +200% dano.', basedOn: ['Agilidade', 'Disciplina'], unlockLevel: 25, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 14, effectType: 'buff', effectLabel: 'Próximo ataque: crítico +200% dano', fixedPower: 200, synergy: 'Com Caçador: +250% dano crítico' },
    { id: 'ate-marca-explosiva', name: 'Marca Explosiva', archetype: 'Atirador de Elite', fantasy: 'Alvo marcado para destruição total', description: 'Aplica marca: 3 marcas = explosão 250 dano.', basedOn: ['Agilidade', 'Criatividade'], unlockLevel: 27, cooldown: 2, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 12, effectType: 'dano', effectLabel: 'Marca inimigo: 3 marcas = explosão 250 dano', fixedPower: 250, synergy: 'Com Mercenário: 2 marcas = explosão' },
    { id: 'ate-tiro-carregado', name: 'Tiro Carregado', archetype: 'Atirador de Elite', fantasy: 'O silêncio antes do trovão', description: 'Pula 1 turno → dispara 400 dano no próximo.', basedOn: ['Agilidade', 'Forca'], unlockLevel: 29, cooldown: 4, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 20, effectType: 'dano', effectLabel: 'Pula 1 turno → disparo 400 dano', fixedPower: 400, synergy: 'Com Caçador: 500 dano' },
    { id: 'ate-limpar-terreno', name: 'Limpar Terreno', archetype: 'Atirador de Elite', fantasy: 'Cobertura total de fogo de supressão', description: '5 disparos aleatórios de 80 dano cada.', basedOn: ['Agilidade', 'Disciplina'], unlockLevel: 31, cooldown: 4, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 18, effectType: 'dano', effectLabel: '5 disparos aleatórios — 80 dano cada', fixedPower: 400, synergy: 'Com Arruaceiro: +confusão em cada hit' },
    { id: 'ate-sentenca-de-bala', name: 'Sentença de Bala', archetype: 'Atirador de Elite', fantasy: 'Um tiro, um inimigo a menos', description: 'HP inimigo <25%: causa morte instantânea (1x/combate).', basedOn: ['Agilidade', 'Sabedoria'], unlockLevel: 33, cooldown: 5, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 22, effectType: 'dano', effectLabel: 'HP inimigo <25%: instakill (1x)', fixedPower: 9999, synergy: 'Com Algoz: Limiar 35% HP' },
  ],

  'Menestrel': [
    { id: 'men-balada-epica', name: 'Balada Épica', archetype: 'Menestrel', fantasy: 'Narrativa que dá força aos heróis', description: '+50% dano e +30% velocidade para time por 4 turnos.', basedOn: ['Carisma', 'Relacionamento'], unlockLevel: 25, cooldown: 3, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 16, effectType: 'buff', effectLabel: '+50% dano + +30% velocidade time por 4t', fixedPower: 50, synergy: 'Com Monge: +70% velocidade' },
    { id: 'men-acorde-destruidor', name: 'Acorde Destruidor', archetype: 'Menestrel', fantasy: 'Frequência que destrói defesas sólidas', description: '130 dano sonoro + -50% defesa inimigo por 3 turnos.', basedOn: ['Carisma', 'Inteligencia'], unlockLevel: 27, cooldown: 3, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 18, effectType: 'dano', effectLabel: '130 dano + -50% defesa inimigo por 3t', fixedPower: 130, synergy: 'Com Caçador: -70% defesa' },
    { id: 'men-requiem-dos-inimigos', name: 'Réquiem dos Inimigos', archetype: 'Menestrel', fantasy: 'Canção da derrota inevitável', description: 'Inimigos perdem 25% HP/turno por 3 turnos + confusão.', basedOn: ['Carisma', 'Disciplina'], unlockLevel: 29, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 20, effectType: 'debuff', effectLabel: '-25% HP/turno inimigos por 3t + confusão', fixedPower: 25, synergy: 'Com Bruxo: Efeito dobrado' },
    { id: 'men-sinfonia-celestial', name: 'Sinfonia Celestial', archetype: 'Menestrel', fantasy: 'Harmonia total com o cosmos', description: 'Aliados ganham +60% dano + curam 50 HP.', basedOn: ['Relacionamento', 'Carisma'], unlockLevel: 31, cooldown: 4, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 18, effectType: 'buff', effectLabel: '+60% dano aliados + curam 50 HP', fixedPower: 60, synergy: 'Com Sacerdote: Curam 80 HP' },
    { id: 'men-cancao-da-eternidade', name: 'Canção da Eternidade', archetype: 'Menestrel', fantasy: 'Música além do tempo e do espaço', description: 'Time age 2x por 2 turnos (1x/combate).', basedOn: ['Carisma', 'Criatividade'], unlockLevel: 33, cooldown: 6, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 25, effectType: 'buff', effectLabel: 'Time age 2x por 2 turnos (1x)', fixedPower: 2, synergy: 'Com Bardo: +30% dano nos turnos duplos' },
  ],

  // ================================================================
  // T5 CLASS SKILLS — Classe 4 (Nv.35-50)
  // ================================================================

  'Guardião Real': [
    { id: 'grd-escudo-da-realeza', name: 'Escudo da Realeza', archetype: 'Guardião Real', fantasy: 'Proteção digna de um rei sagrado', description: 'Absorve 300 DMG + regen 40 HP/turno por 4 turnos.', basedOn: ['Resiliencia', 'Sabedoria'], unlockLevel: 35, cooldown: 3, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 18, effectType: 'buff', effectLabel: 'Absorve 300 DMG + +40 HP/turno por 4t', fixedPower: 300, synergy: 'Com Cavaleiro: Absorve 400 DMG' },
    { id: 'grd-edicto-divino', name: 'Édito Divino', archetype: 'Guardião Real', fantasy: 'Decreto que santifica o campo de batalha', description: 'Remove TODOS debuffs aliados + imunidade 2 turnos para todos.', basedOn: ['Sabedoria', 'Relacionamento'], unlockLevel: 37, cooldown: 4, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 22, effectType: 'buff', effectLabel: 'Remove debuffs AOE + imunidade 2t para todos', fixedPower: 2, synergy: 'Com Sumo Sacerdote: Imunidade 3 turnos' },
    { id: 'grd-golpe-real', name: 'Golpe Real', archetype: 'Guardião Real', fantasy: 'Poder soberano concentrado em um golpe', description: '200 dano + cura 100 HP + remove buffs inimigo.', basedOn: ['Forca', 'Sabedoria'], unlockLevel: 39, cooldown: 3, factor: 1.0, tier: 'classe', category: 'hibrida', mpCost: 20, effectType: 'dano', effectLabel: '200 dano + cura 100 HP + remove buffs', fixedPower: 200, synergy: 'Com Paladino: 260 dano + 140 HP' },
    { id: 'grd-dominio-sagrado', name: 'Domínio Sagrado', archetype: 'Guardião Real', fantasy: 'Soberania total do campo de batalha', description: 'Provoca + inimigo perde -70% dano + +50% defesa aliados por 4t.', basedOn: ['Resiliencia', 'Carisma'], unlockLevel: 42, cooldown: 4, factor: 1.0, tier: 'classe', category: 'fisica', mpCost: 24, effectType: 'buff', effectLabel: 'Provoca + -70% dano inimigo + +50% def aliados 4t', fixedPower: 70, synergy: 'Com Lorde: -90% dano inimigo' },
    { id: 'grd-protetor-eterno', name: 'Protetor Eterno', archetype: 'Guardião Real', fantasy: 'Ninguém morre enquanto o Guardião vive', description: 'Passivo: aliado que morrer ressuscita com 60% HP automaticamente (3x/combate).', basedOn: ['Sabedoria', 'Vitalidade'], unlockLevel: 45, cooldown: 5, factor: 1.0, tier: 'classe', category: 'magica', mpCost: 30, effectType: 'buff', effectLabel: 'Auto-ressurreição aliados com 60% HP (3x)', fixedPower: 60, synergy: 'Com Sumo Sacerdote: Ressurreição com 80% HP' },
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
  const computedPower = skill.fixedPower !== undefined
    ? skill.fixedPower
    : computeSkillPower(levels, skill);
  return {
    id: skill.id,
    name: skill.name,
    archetype: skill.archetype,
    fantasy: skill.fantasy,
    description: skill.description,
    basedOn: [...skill.basedOn],
    unlockLevel: skill.unlockLevel,
    cooldown: skill.cooldown,
    power: computedPower,
    unlocked: profileLevel >= skill.unlockLevel,
    tier: skill.tier,
    category: skill.category,
    requiredItem: skill.requiredItem,
    mpCost: skill.mpCost,
    effectType: skill.effectType,
    effectLabel: skill.effectLabel,
    synergy: skill.synergy,
  };
}

export function getSkillLoadout(
  profileLevel: number,
  levels: AttrLevels,
  starterClassInput?: string,
  starterItemInput?: string,
  currentClassNameInput?: string,
): SkillLoadout {
  const starterClass = normalizeClass(starterClassInput);
  const starterItem = starterItemInput || getStarterItemForClass(starterClass);

  const noviceBlueprint = NOVICE_SKILLS_BY_ITEM[starterItem] || NOVICE_SKILLS_BY_ITEM['Adaga de Treino'];
  const noviceSkills = noviceBlueprint.map((skill) => mapToNode(levels, profileLevel, skill));
  const classSkills = (CLASS_SKILLS[starterClass] || []).map((skill) => mapToNode(levels, profileLevel, skill));
  const specialtySkills = (T3_CLASS_SKILLS[currentClassNameInput ?? ''] || []).map((skill) =>
    mapToNode(levels, profileLevel, skill),
  );

  return { noviceSkills, classSkills, specialtySkills };
}

