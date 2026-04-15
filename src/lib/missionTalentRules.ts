export type MissionCategory = 'fisico' | 'casa' | 'criativo' | 'social' | 'ar_livre' | 'estudo' | 'geral';

export type MissionTalentResolution = {
  category: MissionCategory;
  goldMultiplier: number;
  recoverLostHpPct: number;
  grantFlowXpBuff: boolean;
  grantInspired: boolean;
  addMaxMp: number;
  addMaxHp: number;
  doubledByOrderNoCaos: boolean;
};

type DeriveCategoryInput = {
  mission: any;
  primaryAttributeName?: string | null;
};

const KEYWORDS_BY_CATEGORY: Record<MissionCategory, string[]> = {
  fisico: ['treino', 'academia', 'corrida', 'caminhada', 'musculacao', 'exercicio', 'bike', 'cardio'],
  casa: ['casa', 'limpeza', 'louca', 'cozinha', 'organizar', 'arrumar', 'faxina'],
  criativo: ['criativo', 'desenho', 'pintura', 'escrever', 'musica', 'arte', 'design'],
  social: ['social', 'amizade', 'familia', 'reuniao', 'network', 'conversa', 'encontro'],
  ar_livre: ['ar livre', 'parque', 'trilha', 'sol', 'natureza', 'praia', 'externo'],
  estudo: ['estudo', 'estudar', 'leitura', 'livro', 'curso', 'aula', 'codigo', 'programar'],
  geral: [],
};

const ATTRIBUTE_TO_CATEGORY: Record<string, MissionCategory> = {
  forca: 'fisico',
  agilidade: 'fisico',
  vitalidade: 'fisico',
  resiliencia: 'fisico',
  inteligencia: 'estudo',
  sabedoria: 'estudo',
  disciplina: 'estudo',
  criatividade: 'criativo',
  carisma: 'social',
  relacionamento: 'social',
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function normalizeMissionCategory(value: unknown): MissionCategory | null {
  if (!value) return null;
  const v = normalize(String(value));

  if (v === 'ar livre' || v === 'ar_livre') return 'ar_livre';
  if (v === 'fisico') return 'fisico';
  if (v === 'casa') return 'casa';
  if (v === 'criativo') return 'criativo';
  if (v === 'social') return 'social';
  if (v === 'estudo') return 'estudo';
  if (v === 'geral') return 'geral';
  return null;
}

export function deriveMissionCategory({ mission, primaryAttributeName }: DeriveCategoryInput): MissionCategory {
  const explicit = normalizeMissionCategory((mission as any)?.mission_category ?? (mission as any)?.category);
  if (explicit) return explicit;

  const attr = normalize(primaryAttributeName || '');
  if (attr && ATTRIBUTE_TO_CATEGORY[attr]) {
    return ATTRIBUTE_TO_CATEGORY[attr];
  }

  const haystack = normalize(`${String((mission as any)?.title || '')} ${String((mission as any)?.description || '')}`);
  for (const [category, words] of Object.entries(KEYWORDS_BY_CATEGORY) as Array<[MissionCategory, string[]]>) {
    if (category === 'geral') continue;
    if (words.some((w) => haystack.includes(normalize(w)))) {
      return category;
    }
  }

  return 'geral';
}

export function resolveMissionTalentEffects(
  category: MissionCategory,
  talentEffects: Set<string>,
  rng: () => number = Math.random,
): MissionTalentResolution {
  const result: MissionTalentResolution = {
    category,
    goldMultiplier: 1,
    recoverLostHpPct: 0,
    grantFlowXpBuff: false,
    grantInspired: false,
    addMaxMp: 0,
    addMaxHp: 0,
    doubledByOrderNoCaos: false,
  };

  if (category === 'fisico' && talentEffects.has('pulmoes_de_aco')) {
    result.recoverLostHpPct = 0.1;
  }

  if (category === 'casa' && talentEffects.has('ordem_no_caos')) {
    if (rng() < 0.2) {
      result.goldMultiplier *= 2;
      result.doubledByOrderNoCaos = true;
    }
  }

  if (category === 'criativo' && talentEffects.has('estado_de_fluxo')) {
    result.grantFlowXpBuff = true;
  }

  if (category === 'social' && talentEffects.has('presenca_inspiradora')) {
    result.grantInspired = true;
  }

  if (category === 'ar_livre' && talentEffects.has('fotossintese')) {
    result.goldMultiplier *= 2;
  }

  if (category === 'estudo' && talentEffects.has('rato_biblioteca')) {
    result.addMaxMp = 1;
  }

  if (category === 'fisico' && talentEffects.has('corpo_de_ferro')) {
    result.addMaxHp = 2;
  }

  return result;
}
