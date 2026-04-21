import { describe, it, expect } from 'vitest';
import { deriveMissionCategory, resolveMissionTalentEffects } from '@/lib/missionTalentRules';

// ─── deriveMissionCategory ───────────────────────────────

describe('deriveMissionCategory — categoria explícita', () => {
  it('usa mission_category quando presente', () => {
    expect(deriveMissionCategory({ mission: { mission_category: 'fisico' } })).toBe('fisico');
  });

  it('normaliza acentos na categoria explícita', () => {
    // 'estudo' sem acento
    expect(deriveMissionCategory({ mission: { mission_category: 'estudo' } })).toBe('estudo');
  });

  it('retorna null para categoria desconhecida → fallback por atributo ou keyword', () => {
    // categoria "xpto" → fallback para geral
    const result = deriveMissionCategory({ mission: { mission_category: 'xpto' } });
    expect(result).toBe('geral');
  });
});

describe('deriveMissionCategory — por atributo primário', () => {
  it('Forca → fisico', () => {
    expect(deriveMissionCategory({ mission: {}, primaryAttributeName: 'Forca' })).toBe('fisico');
  });

  it('Inteligencia → estudo', () => {
    expect(deriveMissionCategory({ mission: {}, primaryAttributeName: 'Inteligencia' })).toBe('estudo');
  });

  it('Carisma → social', () => {
    expect(deriveMissionCategory({ mission: {}, primaryAttributeName: 'Carisma' })).toBe('social');
  });

  it('Criatividade → criativo', () => {
    expect(deriveMissionCategory({ mission: {}, primaryAttributeName: 'Criatividade' })).toBe('criativo');
  });
});

describe('deriveMissionCategory — por keyword no título', () => {
  it('título "corrida matinal" → fisico', () => {
    expect(deriveMissionCategory({ mission: { title: 'corrida matinal' } })).toBe('fisico');
  });

  it('título "estudar para a prova" → estudo', () => {
    expect(deriveMissionCategory({ mission: { title: 'estudar para a prova' } })).toBe('estudo');
  });

  it('título "limpeza da casa" → casa', () => {
    expect(deriveMissionCategory({ mission: { title: 'limpeza da casa' } })).toBe('casa');
  });

  it('missão sem keywords → geral', () => {
    expect(deriveMissionCategory({ mission: { title: 'fazer algo aleatório' } })).toBe('geral');
  });
});

// ─── resolveMissionTalentEffects ─────────────────────────

describe('resolveMissionTalentEffects — sem talents', () => {
  it('retorna defaults sem talento algum', () => {
    const res = resolveMissionTalentEffects('fisico', new Set());
    expect(res.goldMultiplier).toBe(1);
    expect(res.recoverLostHpPct).toBe(0);
    expect(res.grantFlowXpBuff).toBe(false);
    expect(res.grantInspired).toBe(false);
    expect(res.doubledByOrderNoCaos).toBe(false);
  });
});

describe('resolveMissionTalentEffects — pulmoes_de_aco (fisico)', () => {
  it('adiciona recuperação de HP', () => {
    const res = resolveMissionTalentEffects('fisico', new Set(['pulmoes_de_aco']));
    expect(res.recoverLostHpPct).toBe(0.1);
  });

  it('não afeta categoria estudo', () => {
    const res = resolveMissionTalentEffects('estudo', new Set(['pulmoes_de_aco']));
    expect(res.recoverLostHpPct).toBe(0);
  });
});

describe('resolveMissionTalentEffects — ordem_no_caos (casa)', () => {
  it('dobra gold com rng sempre < 0.2', () => {
    const res = resolveMissionTalentEffects('casa', new Set(['ordem_no_caos']), () => 0.1);
    expect(res.goldMultiplier).toBe(2);
    expect(res.doubledByOrderNoCaos).toBe(true);
  });

  it('não dobra gold com rng sempre >= 0.2', () => {
    const res = resolveMissionTalentEffects('casa', new Set(['ordem_no_caos']), () => 0.5);
    expect(res.goldMultiplier).toBe(1);
    expect(res.doubledByOrderNoCaos).toBe(false);
  });
});

describe('resolveMissionTalentEffects — estado_de_fluxo (criativo)', () => {
  it('concede buff de XP para categoria criativo', () => {
    const res = resolveMissionTalentEffects('criativo', new Set(['estado_de_fluxo']));
    expect(res.grantFlowXpBuff).toBe(true);
  });

  it('não concede buff para outra categoria', () => {
    const res = resolveMissionTalentEffects('fisico', new Set(['estado_de_fluxo']));
    expect(res.grantFlowXpBuff).toBe(false);
  });
});

describe('resolveMissionTalentEffects — presenca_inspiradora (social)', () => {
  it('concede inspired para social', () => {
    const res = resolveMissionTalentEffects('social', new Set(['presenca_inspiradora']));
    expect(res.grantInspired).toBe(true);
  });
});
