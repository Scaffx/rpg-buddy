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

