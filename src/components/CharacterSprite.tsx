import { useShortRestStatus } from '@/hooks/useShortRestStatus';

/**
 * Personagem 2D em pixel-art puramente CSS.
 * - Caminha em loop quando ativo (pernas alternam, braços balançam, leve bob no corpo).
 * - Senta perto da fogueira quando descansando.
 * Sem dependências de imagens externas.
 */
function PixelHero({ resting }: { resting: boolean }) {
  // Paleta retro: capacete dourado, túnica azul/roxa, espada prateada
  return (
    <div
      className={`relative h-16 w-16 ${resting ? '' : 'animate-hero-bob'}`}
      style={{ imageRendering: 'pixelated' }}
      aria-hidden="true"
    >
      {/* Cabelo / capacete */}
      <div className="absolute left-1/2 top-1 h-3 w-6 -translate-x-1/2 rounded-sm bg-amber-400 shadow-[0_0_4px_hsl(43_96%_60%/0.7)]" />
      {/* Penacho */}
      <div className="absolute left-1/2 top-0 h-1 w-2 -translate-x-1/2 bg-rose-500" />
      {/* Rosto */}
      <div className="absolute left-1/2 top-[16px] h-2 w-5 -translate-x-1/2 bg-[hsl(30_60%_72%)]" />
      {/* Olhos */}
      <div className="absolute left-[22px] top-[17px] h-[2px] w-[2px] bg-zinc-900" />
      <div className="absolute left-[28px] top-[17px] h-[2px] w-[2px] bg-zinc-900" />

      {/* Tronco / túnica */}
      <div className="absolute left-1/2 top-[22px] h-4 w-7 -translate-x-1/2 rounded-sm bg-indigo-500 border-y border-indigo-300/60" />
      {/* Cinto */}
      <div className="absolute left-1/2 top-[26px] h-[2px] w-7 -translate-x-1/2 bg-amber-700" />

      {/* Braços */}
      <div
        className={`absolute left-[10px] top-[23px] h-3 w-[4px] origin-top rounded-sm bg-indigo-400 ${resting ? '' : 'animate-hero-arm-l'}`}
      />
      <div
        className={`absolute right-[10px] top-[23px] h-3 w-[4px] origin-top rounded-sm bg-indigo-400 ${resting ? '' : 'animate-hero-arm-r'}`}
      />

      {/* Espada na mão direita */}
      {!resting && (
        <>
          <div className="absolute right-[6px] top-[21px] h-[2px] w-[6px] bg-amber-600" />
          <div className="absolute right-[2px] top-[12px] h-[10px] w-[3px] bg-zinc-200 shadow-[0_0_4px_hsl(0_0%_100%/0.6)]" />
        </>
      )}

      {/* Pernas (caminhando) */}
      {!resting ? (
        <>
          <div className="absolute left-[24px] top-[40px] h-3 w-[4px] origin-top rounded-sm bg-zinc-800 animate-hero-leg-l" />
          <div className="absolute left-[36px] top-[40px] h-3 w-[4px] origin-top rounded-sm bg-zinc-800 animate-hero-leg-r" />
          {/* Botas */}
          <div className="absolute left-[22px] top-[51px] h-[3px] w-[6px] rounded-sm bg-amber-700 animate-hero-leg-l" />
          <div className="absolute left-[34px] top-[51px] h-[3px] w-[6px] rounded-sm bg-amber-700 animate-hero-leg-r" />
        </>
      ) : (
        <>
          {/* Pernas cruzadas (sentado) */}
          <div className="absolute left-[20px] top-[42px] h-[3px] w-4 rounded-sm bg-zinc-800" />
          <div className="absolute right-[20px] top-[44px] h-[3px] w-4 rounded-sm bg-zinc-800" />
        </>
      )}

      {/* Sombra no chão */}
      <div className="absolute left-1/2 top-[58px] h-1 w-10 -translate-x-1/2 rounded-full bg-black/40 blur-[2px]" />
    </div>
  );
}

function Campfire() {
  return (
    <div className="relative h-12 w-10 self-end" aria-hidden="true">
      {/* Lenha */}
      <div className="absolute bottom-0 left-1/2 h-[3px] w-8 -translate-x-1/2 rotate-12 bg-amber-800" />
      <div className="absolute bottom-0 left-1/2 h-[3px] w-8 -translate-x-1/2 -rotate-12 bg-amber-900" />
      {/* Chamas */}
      <div className="absolute bottom-2 left-1/2 h-6 w-4 -translate-x-1/2 animate-hero-fire">
        <div className="absolute inset-0 rounded-t-full bg-orange-500 shadow-[0_0_12px_hsl(20_95%_55%/0.85)]" />
        <div className="absolute inset-x-1 bottom-0 top-1 rounded-t-full bg-amber-300" />
        <div className="absolute inset-x-[6px] bottom-0 top-2 rounded-t-full bg-yellow-100" />
      </div>
    </div>
  );
}

export function CharacterSprite() {
  const { isResting } = useShortRestStatus();

  return (
    <div className="pointer-events-none flex h-full items-center justify-center gap-2">
      <div className="flex flex-col items-center justify-center leading-none">
        <div className="flex items-end gap-1">
          {isResting && <Campfire />}
          <PixelHero resting={isResting} />
        </div>
        <span className="-mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-primary/80">
          {isResting ? 'Descansando' : 'Explorando'}
        </span>
      </div>
    </div>
  );
}
