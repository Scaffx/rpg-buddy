import { useShortRestStatus } from '@/hooks/useShortRestStatus';

/**
 * Personagem 2D pixel-art (CSS puro).
 * - Caminha para a direita e esquerda em loop dentro do header.
 * - Senta perto da fogueira quando descansando.
 * Tamanho reduzido para caber em um header de 64px.
 */
function PixelHero({ resting }: { resting: boolean }) {
  // Sprite ocupa ~36px de altura, deixando folga no header de 64px.
  return (
    <div
      className={`relative h-9 w-8 ${resting ? '' : 'animate-hero-bob'}`}
      style={{ imageRendering: 'pixelated' }}
      aria-hidden="true"
    >
      {/* Capacete */}
      <div className="absolute left-1/2 top-0 h-[5px] w-[18px] -translate-x-1/2 rounded-sm bg-amber-400 shadow-[0_0_3px_hsl(43_96%_60%/0.7)]" />
      {/* Penacho */}
      <div className="absolute left-1/2 top-[-2px] h-[3px] w-[4px] -translate-x-1/2 bg-rose-500" />
      {/* Rosto */}
      <div className="absolute left-1/2 top-[5px] h-[4px] w-[14px] -translate-x-1/2 bg-[hsl(30_60%_72%)]" />
      {/* Olhos */}
      <div className="absolute left-[10px] top-[6px] h-[1.5px] w-[1.5px] bg-zinc-900" />
      <div className="absolute left-[18px] top-[6px] h-[1.5px] w-[1.5px] bg-zinc-900" />

      {/* Tronco / túnica */}
      <div className="absolute left-1/2 top-[10px] h-[10px] w-[20px] -translate-x-1/2 rounded-sm bg-indigo-500 border-y border-indigo-300/60" />
      {/* Cinto */}
      <div className="absolute left-1/2 top-[18px] h-[2px] w-[20px] -translate-x-1/2 bg-amber-700" />

      {/* Braços */}
      <div
        className={`absolute left-[3px] top-[11px] h-[8px] w-[3px] origin-top rounded-sm bg-indigo-400 ${resting ? '' : 'animate-hero-arm-l'}`}
      />
      <div
        className={`absolute right-[3px] top-[11px] h-[8px] w-[3px] origin-top rounded-sm bg-indigo-400 ${resting ? '' : 'animate-hero-arm-r'}`}
      />

      {/* Espada na mão direita (apenas quando ativo) */}
      {!resting && (
        <>
          <div className="absolute right-[2px] top-[10px] h-[2px] w-[4px] bg-amber-600" />
          <div className="absolute right-[0px] top-[3px] h-[7px] w-[2px] bg-zinc-200 shadow-[0_0_3px_hsl(0_0%_100%/0.6)]" />
        </>
      )}

      {/* Pernas */}
      {!resting ? (
        <>
          <div className="absolute left-[10px] top-[20px] h-[8px] w-[3px] origin-top rounded-sm bg-zinc-800 animate-hero-leg-l" />
          <div className="absolute left-[18px] top-[20px] h-[8px] w-[3px] origin-top rounded-sm bg-zinc-800 animate-hero-leg-r" />
          {/* Botas */}
          <div className="absolute left-[9px] top-[28px] h-[2px] w-[5px] rounded-sm bg-amber-700" />
          <div className="absolute left-[17px] top-[28px] h-[2px] w-[5px] rounded-sm bg-amber-700" />
        </>
      ) : (
        <>
          <div className="absolute left-[5px] top-[22px] h-[2px] w-[10px] rounded-sm bg-zinc-800" />
          <div className="absolute right-[5px] top-[24px] h-[2px] w-[10px] rounded-sm bg-zinc-800" />
        </>
      )}

      {/* Sombra */}
      <div className="absolute left-1/2 top-[31px] h-[2px] w-[24px] -translate-x-1/2 rounded-full bg-black/40 blur-[1.5px]" />
    </div>
  );
}

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
              <PixelHero resting />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center animate-hero-walk-track">
              <div className="animate-hero-face-flip">
                <PixelHero resting={false} />
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
