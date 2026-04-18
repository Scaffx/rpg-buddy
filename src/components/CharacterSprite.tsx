import { useShortRestStatus } from '@/hooks/useShortRestStatus';

export function CharacterSprite() {
  const { isResting } = useShortRestStatus();

  if (isResting) {
    // Sprite de descanso - mostra personagem com fogueira
    return (
      <div className="flex items-center justify-center h-full gap-2">
        <div className="text-center">
          <svg className="w-20 h-20 mx-auto mb-1" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Personagem em repouso */}
            <circle cx="32" cy="12" r="6" fill="#06B6D4" />
            <rect x="24" y="20" width="16" height="12" rx="2" fill="#DC2626" />
            <rect x="20" y="32" width="24" height="16" rx="2" fill="#1F2937" />
            <rect x="20" y="48" width="6" height="12" fill="#3F3F46" />
            <rect x="38" y="48" width="6" height="12" fill="#3F3F46" />
          </svg>
          <span className="text-xs font-semibold text-amber-500">Descansando</span>
        </div>
        {/* Fogueira */}
        <div className="text-center">
          <div className="relative w-12 h-12 flex items-end justify-center">
            <div className="w-8 h-4 bg-amber-900 rounded-sm mb-2" />
            <svg className="absolute w-8 h-8 animate-bounce" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 4C16 4 20 12 20 18C20 23.5228 18.2091 28 16 28C13.7909 28 12 23.5228 12 18C12 12 16 4 16 4Z" fill="#FCA5A5" />
              <path d="M16 8C16 8 18 14 18 18C18 20.5 17.1046 22 16 22C14.8954 22 14 20.5 14 18C14 14 16 8 16 8Z" fill="#FEA08A" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-amber-500">🔥</span>
        </div>
      </div>
    );
  }

  // Sprite ativo - mostra personagem em combate
  return (
    <div className="flex items-center justify-center h-full">
      <svg className="w-20 h-20 animate-pulse" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Personagem em ação */}
        <circle cx="32" cy="12" r="6" fill="#06B6D4" />
        {/* Corpo em posição de combate */}
        <rect x="22" y="20" width="12" height="10" rx="2" fill="#DC2626" />
        <rect x="34" y="18" width="10" height="14" rx="2" fill="#7C3AED" transform="rotate(20 39 25)" />
        {/* Pernas */}
        <rect x="24" y="30" width="5" height="14" rx="2" fill="#1F2937" />
        <rect x="36" y="32" width="5" height="12" rx="2" fill="#1F2937" />
        {/* Efeito de movimento */}
        <line x1="12" y1="28" x2="8" y2="24" stroke="#FCA5A5" strokeWidth="2" strokeLinecap="round" />
        <line x1="52" y1="24" x2="56" y2="20" stroke="#FCA5A5" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
