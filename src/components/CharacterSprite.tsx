import { useShortRestStatus } from '@/hooks/useShortRestStatus';
import { LifeonRPGMascot } from '@/components/branding/LifeonRPGMascot';

/**
 * Personagem 2D pixel-art (CSS puro).
 * - Caminha para a direita e esquerda em loop dentro do header (animação `animate-hero-walk-track`).
 * - Senta ao lado da fogueira quando descansando (animação parada).
 *
 * O sprite em si veio do design "LifeonRPG Mascote" (LifeonRPGMascot) — herói pixel art
 * que respira (bob), balança a espada (sway), pisca (blink) e solta um glint na lâmina.
 * A fogueira do estado de descanso é mantida aqui em CSS puro.
 */

function Campfire() {
  return (
    <div className="relative h-9 w-7 self-end" aria-hidden="true">
      {/* Lenha */}
      <div className="absolute bottom-0 left-1/2 h-[2px] w-[20px] -translate-x-1/2 rotate-12 bg-amber-800" />
      <div className="absolute bottom-0 left-1/2 h-[2px] w-[20px] -translate-x-1/2 -rotate-12 bg-amber-900" />
      {/* Chamas */}
      <div className="absolute bottom-1 left-1/2 h-4 w-3 -translate-x-1/2 animate-hero-fire">
        <div className="absolute inset-0 rounded-t-full bg-orange-500 shadow-[0_0_8px_hsl(20_95%_55%/0.85)]" />
        <div className="absolute inset-x-[2px] bottom-0 top-[3px] rounded-t-full bg-amber-300" />
        <div className="absolute inset-x-[4px] bottom-0 top-[6px] rounded-t-full bg-yellow-100" />
      </div>
    </div>
  );
}

export function CharacterSprite() {
  const { isResting } = useShortRestStatus();

  return (
    <div className="pointer-events-none flex h-full w-full items-center justify-center">
      <div className="flex flex-col items-center justify-center leading-none">
        {/* Pista de caminhada: overflow-hidden garante que o sprite nunca escape do layout. */}
        <div className="relative h-10 w-24 sm:w-32 overflow-hidden">
          {isResting ? (
            <div className="flex h-full items-end justify-center gap-1">
              <Campfire />
              {/* Descansando: postura parada (sem bob/sway/blink/glint). */}
              <LifeonRPGMascot size={36} resting />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center animate-hero-walk-track">
              <div className="animate-hero-face-flip">
                <LifeonRPGMascot size={36} />
              </div>
            </div>
          )}
        </div>
        <span className="-mt-0.5 text-[8px] font-semibold uppercase tracking-[0.22em] text-primary/80">
          {isResting ? 'Descansando' : 'Explorando'}
        </span>
      </div>
    </div>
  );
}
