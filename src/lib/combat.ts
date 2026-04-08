type GenericRecord = Record<string, any>;

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
  const matk = profileLevel * 4 + levels.Inteligencia * 6 + levels.Sabedoria * 2;
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

const SKILL_BLUEPRINTS = [
  {
    id: 'lamina-de-rotina',
    name: 'Lamina de Rotina',
    archetype: 'Vanguarda Urbana',
    fantasy: 'Inspiracao em classes de combate corpo a corpo',
    description: 'Golpe consistente para quem mantém missões de Forca e Disciplina.',
    basedOn: ['Forca', 'Disciplina'],
    unlockLevel: 3,
    cooldown: 2,
    factor: 1.25,
  },
  {
    id: 'selo-analitico',
    name: 'Selo Analitico',
    archetype: 'Arcanista Tatico',
    fantasy: 'Inspiracao em classes de magia e estudo',
    description: 'Converte foco intelectual em dano magico de precisao.',
    basedOn: ['Inteligencia', 'Sabedoria'],
    unlockLevel: 4,
    cooldown: 3,
    factor: 1.3,
  },
  {
    id: 'passo-sombra',
    name: 'Passo Sombra',
    archetype: 'Especialista Noturno',
    fantasy: 'Inspiracao em classes de mobilidade e furtividade',
    description: 'Aumenta evasao e dano critico por uma rodada.',
    basedOn: ['Agilidade', 'Criatividade'],
    unlockLevel: 5,
    cooldown: 4,
    factor: 1.2,
  },
  {
    id: 'bencao-de-campo',
    name: 'Bencao de Campo',
    archetype: 'Suporte de Vanguarda',
    fantasy: 'Inspiracao em classes de suporte e cura',
    description: 'Recupera recursos e fortalece defesa da equipe.',
    basedOn: ['Sabedoria', 'Relacionamento'],
    unlockLevel: 4,
    cooldown: 3,
    factor: 1.1,
  },
  {
    id: 'armadura-mental',
    name: 'Armadura Mental',
    archetype: 'Guardiao Estrategico',
    fantasy: 'Inspiracao em classes de protecao',
    description: 'Escudo temporario baseado em resiliencia e vitalidade.',
    basedOn: ['Resiliencia', 'Vitalidade'],
    unlockLevel: 6,
    cooldown: 5,
    factor: 1.35,
  },
  {
    id: 'ordem-cirurgica',
    name: 'Ordem Cirurgica',
    archetype: 'Comandante de Precisao',
    fantasy: 'Inspiracao em classes de alcance e controle',
    description: 'Ataque calibrado que explora a fraqueza principal do boss.',
    basedOn: ['Disciplina', 'Agilidade'],
    unlockLevel: 7,
    cooldown: 4,
    factor: 1.45,
  },
] as const;

export function getSkillNodes(levels: AttrLevels): SkillNode[] {
  return SKILL_BLUEPRINTS.map((skill) => {
    const statA = levels[skill.basedOn[0] as keyof AttrLevels] || 1;
    const statB = levels[skill.basedOn[1] as keyof AttrLevels] || 1;
    const average = (statA + statB) / 2;
    const power = Math.round(average * 22 * skill.factor);
    const unlocked = average >= skill.unlockLevel;

    return {
      id: skill.id,
      name: skill.name,
      archetype: skill.archetype,
      fantasy: skill.fantasy,
      description: skill.description,
      basedOn: [...skill.basedOn],
      unlockLevel: skill.unlockLevel,
      cooldown: skill.cooldown,
      power,
      unlocked,
    };
  });
}
