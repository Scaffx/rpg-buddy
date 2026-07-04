import { describe, it, expect } from 'vitest';
import { isAprendizClass, resolveTreeKey, APRENDIZ_TREE, type ClassRow } from '@/lib/aprendizTree';

const APRENDIZ_ID = '00000001-0000-0000-0000-000000000001';
const MAGO_TIER1_ID = '00000002-0000-0000-0000-000000000002';

const classes: ClassRow[] = [
  { id: APRENDIZ_ID, column_index: 1 },   // Aprendiz, "Início" (tier 0)
  { id: MAGO_TIER1_ID, column_index: 2 }, // Mago (tier 1)
];

describe('isAprendizClass', () => {
  it('true quando o herói ainda é Aprendiz (column_index <= 1)', () => {
    expect(isAprendizClass(APRENDIZ_ID, classes)).toBe(true);
  });
  it('false para classe tier-1 (column_index 2)', () => {
    expect(isAprendizClass(MAGO_TIER1_ID, classes)).toBe(false);
  });
  it('false sem classe/sem dados', () => {
    expect(isAprendizClass(null, classes)).toBe(false);
    expect(isAprendizClass(APRENDIZ_ID, null)).toBe(false);
    expect(isAprendizClass('inexistente', classes)).toBe(false);
  });
});

describe('resolveTreeKey', () => {
  it('Aprendiz vê a mini-árvore tutorial, ignorando o starter_class', () => {
    expect(resolveTreeKey(APRENDIZ_ID, classes, 'mago')).toBe(APRENDIZ_TREE);
  });
  it('ao virar tier-1, usa a árvore da classe-base', () => {
    expect(resolveTreeKey(MAGO_TIER1_ID, classes, 'mago')).toBe('mago');
  });
  it('sem classe atual: cai no starter_class (comportamento antigo)', () => {
    expect(resolveTreeKey(null, classes, 'guerreiro')).toBe('guerreiro');
  });
});
