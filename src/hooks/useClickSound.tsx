import { useEffect } from 'react';
import { sfx, isMuted } from '@/lib/sfx';

/**
 * Hook que adiciona som de clique para toda interação do usuário
 */
export function useClickSound() {
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Ignora cliques em elementos com data-no-sound
      if ((e.target as HTMLElement)?.closest('[data-no-sound]')) {
        return;
      }
      
      if (!isMuted()) {
        sfx.click();
      }
    };

    // Adiciona listener com captura para ouvir todos os cliques
    window.addEventListener('click', handleClick, true);
    
    return () => {
      window.removeEventListener('click', handleClick, true);
    };
  }, []);
}
