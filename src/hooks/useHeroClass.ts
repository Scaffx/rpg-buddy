import { useMemo } from 'react';
import { useProfile, useClasses, useAttributes } from '@/hooks/useProfile';
import { getAttributeLevels } from '@/lib/combat';
import { resolveTreeKey, isAprendizClass } from '@/lib/aprendizTree';

// Nome da classe (col. 2 da progressão) -> classe-base usada nas árvores/loadout.
const CLASS_NAME_TO_STARTER: Record<string, string> = {
  Espadachim: 'guerreiro',
  Mago: 'mago',
  Gatuno: 'gatuno',
  'Noviço': 'novato',
  Arqueiro: 'arqueiro',
  Ferreiro: 'ferreiro',
};

// classe-base (starter_class) -> nome de exibição da classe (col. 2).
// 'novato' e 'clerico' mapeiam para o "Noviço". Usado como fallback de rótulo
// no lugar do antigo "Aprendiz".
export const STARTER_TO_CLASS_NAME: Record<string, string> = {
  guerreiro: 'Espadachim',
  mago: 'Mago',
  gatuno: 'Gatuno',
  novato: 'Noviço',
  clerico: 'Noviço',
  arqueiro: 'Arqueiro',
  ferreiro: 'Ferreiro',
};

/** Nome de exibição da classe a partir do starter_class (sem mais "Aprendiz"). */
export function starterClassDisplayName(starter?: string | null): string {
  if (!starter) return 'Iniciante';
  return STARTER_TO_CLASS_NAME[starter] || 'Iniciante';
}

/**
 * Deriva a classe-base do herói (mago/guerreiro/gatuno/ferreiro/arqueiro/novato),
 * a arma inicial, o nome da classe atual e os níveis de atributo.
 * Centraliza a lógica antes duplicada no Perfil — usada pelo hub de Habilidades.
 */
export function useHeroClass() {
  const { data: profile } = useProfile();
  const { data: classes } = useClasses();
  const { data: attributes } = useAttributes();

  const attributeLevels = useMemo(() => getAttributeLevels(attributes as any[]), [attributes]);

  const starterClass = useMemo(() => {
    const currentClassId = (profile as any)?.current_class_id;
    if (currentClassId && classes) {
      const classMap = new Map<string, any>();
      (classes as any[]).forEach((c) => classMap.set(c.id, c));
      let node = classMap.get(currentClassId);
      while (node && node.column_index > 2) {
        node = node.parent_class_id ? classMap.get(node.parent_class_id) : null;
      }
      const resolved = node?.column_index === 2 ? CLASS_NAME_TO_STARTER[node.name] : null;
      if (resolved) return resolved;
    }
    return (profile as any)?.starter_class || 'novato';
  }, [profile, classes]);

  const starterItem = useMemo(
    () => (profile as any)?.starter_item || 'Adaga de Treino',
    [profile],
  );

  const currentClassName = useMemo(() => {
    const currentClassId = (profile as any)?.current_class_id;
    if (currentClassId && classes) {
      const cls = (classes as any[]).find((c) => c.id === currentClassId);
      if (cls?.name) return cls.name as string;
    }
    return undefined;
  }, [profile, classes]);

  // A classe inicial é uma projeção do servidor. Cache local não concede árvore.
  const hasClass = useMemo(
    () => typeof (profile as any)?.starter_class === 'string' &&
      Object.prototype.hasOwnProperty.call(STARTER_TO_CLASS_NAME, (profile as any).starter_class),
    [profile],
  );

  // Árvore de habilidades a exibir: Aprendiz (tier 0) mostra a mini-árvore tutorial.
  const isAprendiz = useMemo(
    () => isAprendizClass((profile as any)?.current_class_id, classes as any[]),
    [profile, classes],
  );
  const treeKey = useMemo(
    () => resolveTreeKey((profile as any)?.current_class_id, classes as any[], starterClass),
    [profile, classes, starterClass],
  );

  return {
    starterClass: starterClass as string,
    treeKey,
    isAprendiz,
    starterItem: starterItem as string,
    currentClassName,
    hasClass,
    level: (profile as any)?.level || 1,
    attributeLevels,
  };
}
