import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getActivePetType, setActivePetType } from '@/lib/pets';

/**
 * Pet ativo do usuário (Fase 1: persistido em localStorage). Garante 1 pet por vez
 * e expõe um toggle (reativar o mesmo pet o desativa). O bônus de combate é lido
 * de forma independente em useBossCombat via getActivePetType — este hook serve à UI.
 */
export function useActivePet() {
  const { user } = useAuth();
  const [activeType, setActiveType] = useState<string | null>(() => getActivePetType(user?.id));

  useEffect(() => {
    setActiveType(getActivePetType(user?.id));
  }, [user?.id]);

  const setActive = useCallback(
    (companionType: string | null) => {
      if (!user?.id) return;
      const next = getActivePetType(user.id) === companionType ? null : companionType;
      setActivePetType(user.id, next);
      setActiveType(next);
    },
    [user?.id],
  );

  return { activeType, setActive };
}
