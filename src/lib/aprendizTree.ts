// Aprendiz = classe-base tier 0 (lv 1-4, column_index 1 "Início"). Enquanto o herói
// é Aprendiz, a árvore exibida é a mini-árvore tutorial 'aprendiz' — não a árvore da
// classe tier-1 (evita "aprendiz vê tudo sem contexto"). Ao escolher classe no lv4,
// current_class_id passa a apontar p/ uma classe column_index>=2 e a árvore vira a da classe.

export const APRENDIZ_TREE = 'aprendiz';

export type ClassRow = { id: string; column_index?: number | null };

/** O herói ainda é Aprendiz (tier 0)? current_class aponta p/ uma classe de column_index <= 1. */
export function isAprendizClass(
  currentClassId: string | null | undefined,
  classes: ClassRow[] | null | undefined,
): boolean {
  if (!currentClassId || !classes) return false;
  const cls = classes.find((c) => c.id === currentClassId);
  return !!cls && cls.column_index != null && cls.column_index <= 1;
}

/** Árvore a exibir/usar: 'aprendiz' se ainda tier 0, senão a árvore da classe-base. */
export function resolveTreeKey(
  currentClassId: string | null | undefined,
  classes: ClassRow[] | null | undefined,
  starterClass: string,
): string {
  return isAprendizClass(currentClassId, classes) ? APRENDIZ_TREE : starterClass;
}
