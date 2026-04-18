import { CSSProperties, useEffect, useMemo, useState } from 'react';
import { useShortRestStatus } from '@/hooks/useShortRestStatus';

type SpriteMode = 'active' | 'rest';

type SpriteDefinition = {
  src: string;
  alt: string;
  columns: number;
  rows: number;
  frameOrder: number[];
  frameDurationMs: number;
  label: string;
  fallbackLabel: string;
  renderScale: number;
  detectNonEmptyFrames?: boolean;
  maxDetectedFrames?: number;
};

const SPRITES: Record<SpriteMode, SpriteDefinition> = {
  active: {
    src: '/sprites/Movement.png',
    alt: 'Heroi em movimento',
    columns: 16,
    rows: 16,
    frameOrder: [0],
    frameDurationMs: 70,
    label: 'Explorando',
    fallbackLabel: 'Sprite de movimento indisponivel',
    renderScale: 3,
    detectNonEmptyFrames: true,
    maxDetectedFrames: 32,
  },
  rest: {
    src: '/sprites/Rest_fire.png',
    alt: 'Heroi descansando na fogueira',
    columns: 4,
    rows: 4,
    frameOrder: [8, 9, 10, 11, 12, 13, 14, 15],
    frameDurationMs: 180,
    label: 'Descansando',
    fallbackLabel: 'Sprite de descanso indisponivel',
    renderScale: 0.8,
  },
};

function detectNonEmptyFrames(
  image: HTMLImageElement,
  columns: number,
  rows: number,
): number[] {
  const frameWidth = Math.floor(image.naturalWidth / columns);
  const frameHeight = Math.floor(image.naturalHeight / rows);

  if (frameWidth <= 0 || frameHeight <= 0) return [];

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [];

  context.drawImage(image, 0, 0);

  const filledFrames: number[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const x = col * frameWidth;
      const y = row * frameHeight;

      const data = context.getImageData(x, y, frameWidth, frameHeight).data;
      let hasVisiblePixel = false;

      for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 8) {
          hasVisiblePixel = true;
          break;
        }
      }

      if (hasVisiblePixel) {
        filledFrames.push(row * columns + col);
      }
    }
  }

  return filledFrames;
}

function SpriteSheet({ mode }: { mode: SpriteMode }) {
  const sprite = SPRITES[mode];
  const [frame, setFrame] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [frameOrder, setFrameOrder] = useState<number[]>(sprite.frameOrder);
  const [sheetWidth, setSheetWidth] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(0);

  useEffect(() => {
    setFrame(0);
    setHasError(false);
    setIsLoaded(false);
    setFrameOrder(sprite.frameOrder);
    setSheetWidth(0);
    setSheetHeight(0);
  }, [mode]);

  useEffect(() => {
    const image = new window.Image();

    image.onload = () => {
      setSheetWidth(image.naturalWidth);
      setSheetHeight(image.naturalHeight);

      if (sprite.detectNonEmptyFrames) {
        const detectedFrames = detectNonEmptyFrames(image, sprite.columns, sprite.rows);
        const selectedFrames = sprite.maxDetectedFrames
          ? detectedFrames.slice(0, sprite.maxDetectedFrames)
          : detectedFrames;

        if (selectedFrames.length > 0) {
          setFrameOrder(selectedFrames);
        }
      }

      setHasError(false);
      setIsLoaded(true);
    };

    image.onerror = () => {
      setHasError(true);
      setIsLoaded(false);
    };

    image.src = sprite.src;
  }, [sprite.src]);

  useEffect(() => {
    if (hasError || !isLoaded) return;

    const intervalId = window.setInterval(() => {
      setFrame((currentFrame) => (currentFrame + 1) % frameOrder.length);
    }, sprite.frameDurationMs);

    return () => window.clearInterval(intervalId);
  }, [frameOrder.length, hasError, isLoaded, sprite.frameDurationMs]);

  const currentFrameIndex = frameOrder[frame] ?? frameOrder[0] ?? 0;
  const currentColumn = currentFrameIndex % sprite.columns;
  const currentRow = Math.floor(currentFrameIndex / sprite.columns);

  const spriteStyle = useMemo<CSSProperties>(() => {
    const frameWidth = sheetWidth > 0 ? Math.floor(sheetWidth / sprite.columns) : 0;
    const frameHeight = sheetHeight > 0 ? Math.floor(sheetHeight / sprite.rows) : 0;

    const width = Math.max(1, Math.round(frameWidth * sprite.renderScale));
    const height = Math.max(1, Math.round(frameHeight * sprite.renderScale));

    return {
      width: `${width}px`,
      height: `${height}px`,
      backgroundImage: `url(${sprite.src})`,
      backgroundPosition: `${-currentColumn * width / sprite.renderScale}px ${-currentRow * height / sprite.renderScale}px`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: `${sheetWidth * sprite.renderScale}px ${sheetHeight * sprite.renderScale}px`,
      imageRendering: 'pixelated',
    };
  }, [currentColumn, currentRow, sheetHeight, sheetWidth, sprite.columns, sprite.renderScale, sprite.rows, sprite.src]);

  if (hasError) {
    return (
      <div className="flex h-[92px] w-[92px] items-center justify-center rounded-2xl border border-dashed border-primary/30 bg-background/60 px-3 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground md:h-[108px] md:w-[108px]">
        {sprite.fallbackLabel}
      </div>
    );
  }

  if (!isLoaded) {
    return <div className="h-[96px] w-[96px] animate-pulse rounded-xl bg-primary/10 md:h-[108px] md:w-[108px]" />;
  }

  return (
    <div
      role="img"
      aria-label={sprite.alt}
      className="select-none"
      style={spriteStyle}
    />
  );
}

export function CharacterSprite() {
  const { isResting } = useShortRestStatus();
  const mode: SpriteMode = isResting ? 'rest' : 'active';
  const sprite = SPRITES[mode];

  return (
    <div className="flex h-full min-w-[148px] items-center justify-center self-center -translate-y-2 md:min-w-[180px] md:-translate-y-3">
      <div className="pointer-events-none flex flex-col items-center justify-center leading-none">
        <SpriteSheet mode={mode} />
        <span className="mt-[-8px] text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80 md:mt-[-12px]">
          {sprite.label}
        </span>
      </div>
    </div>
  );
}
