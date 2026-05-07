import { useCallback, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface TourStep {
  /** Matches the value of the `data-tour="..."` attribute on the target element */
  target: string;
  title: string;
  description: string;
}

interface GuidedTourProps {
  /** Unique key used to store completion state in localStorage */
  tourKey: string;
  steps: TourStep[];
}

const PAD = 10;          // spotlight padding around target (px)
const TIP_W = 320;       // tooltip width (px)
const TIP_H_EST = 220;   // estimated tooltip height for positioning

function calcTooltipStyle(rect: DOMRect | null): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!rect) {
    return { top: vh / 2 - TIP_H_EST / 2, left: Math.max(12, (vw - TIP_W) / 2) };
  }

  const cx = rect.left + rect.width / 2;
  const left = Math.max(12, Math.min(cx - TIP_W / 2, vw - TIP_W - 12));

  const spaceBelow = vh - (rect.bottom + PAD + 16);
  const spaceAbove = rect.top - PAD - 16;

  if (spaceBelow >= TIP_H_EST || spaceBelow >= spaceAbove) {
    return { top: rect.bottom + PAD + 16, left };
  }
  return { bottom: vh - (rect.top - PAD - 16), left };
}

export default function GuidedTour({ tourKey, steps }: GuidedTourProps) {
  const storageKey = `tour_done_${tourKey}`;
  const uid = useId();
  // useId returns ":r0:" etc — strip non-alphanumeric chars for a valid SVG ID
  const maskId = `tour-mask-${uid.replace(/\W/g, '')}`;

  const [active, setActive] = useState(
    () => localStorage.getItem(storageKey) !== 'true'
  );
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const current = steps[stepIdx];

  const finish = useCallback(() => {
    localStorage.setItem(storageKey, 'true');
    setActive(false);
  }, [storageKey]);

  // RAF loop: continuously track the target element's position.
  // This keeps the spotlight smooth during scroll animations.
  useEffect(() => {
    if (!active || !current) return;

    const el = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }

    // Scroll the target into view if it's off-screen
    const r = el.getBoundingClientRect();
    const inView = r.top >= 0 && r.bottom <= window.innerHeight;
    if (!inView) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    let rafId: number;
    const tick = () => {
      setRect(el.getBoundingClientRect());
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [active, stepIdx, current]);

  if (!active) return null;

  // Spotlight rect (target + padding)
  const hx = rect ? rect.left - PAD : -9999;
  const hy = rect ? rect.top - PAD : -9999;
  const hw = rect ? rect.width + PAD * 2 : 0;
  const hh = rect ? rect.height + PAD * 2 : 0;

  const tipStyle = calcTooltipStyle(rect);

  const isLast = stepIdx === steps.length - 1;

  return createPortal(
    <>
      {/* ── Click-blocking full-screen overlay ─────────────────── */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 9998 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* SVG with spotlight cutout using mask */}
        <svg
          width="100%"
          height="100%"
          className="absolute inset-0"
          style={{ pointerEvents: 'none' }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <mask id={maskId}>
              {/* White = visible (dark overlay), Black = transparent (spotlight) */}
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {rect && (
                <rect
                  x={hx} y={hy}
                  width={hw} height={hh}
                  rx="12" ry="12"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0" y="0"
            width="100%" height="100%"
            fill="rgba(0, 0, 0, 0.72)"
            mask={`url(#${maskId})`}
          />
        </svg>
      </div>

      {/* ── Glowing highlight ring around the target ───────────── */}
      {rect && (
        <div
          className="fixed pointer-events-none rounded-xl"
          style={{
            zIndex: 9999,
            left: hx,
            top: hy,
            width: hw,
            height: hh,
            boxShadow:
              '0 0 0 2px hsl(var(--primary)), ' +
              '0 0 0 5px hsl(var(--primary) / 0.15), ' +
              '0 0 30px hsl(var(--primary) / 0.35)',
          }}
        />
      )}

      {/* ── Tooltip card ────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={stepIdx}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.96 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="fixed bg-card border border-primary/30 rounded-2xl shadow-2xl p-5 select-none"
          style={{ zIndex: 10000, width: TIP_W, ...tipStyle }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Progress bar dots + close button */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === stepIdx
                      ? 'w-5 bg-primary'
                      : i < stepIdx
                        ? 'w-2.5 bg-primary/40'
                        : 'w-2.5 bg-border'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={finish}
              className="p-1 rounded-lg hover:bg-muted/60 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              title="Pular tutorial"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Content */}
          <h3 className="text-sm font-bold text-foreground mb-1.5 leading-snug">
            {current.title}
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {current.description}
          </p>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => setStepIdx((s) => s - 1)}
              disabled={stepIdx === 0}
              className="flex items-center gap-0.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-0 transition-all"
            >
              <ChevronLeft className="w-3 h-3" /> Anterior
            </button>

            <span className="text-[10px] text-muted-foreground/40 font-medium tabular-nums">
              {stepIdx + 1} / {steps.length}
            </span>

            <button
              onClick={() => (isLast ? finish() : setStepIdx((s) => s + 1))}
              className="flex items-center gap-0.5 px-3 py-1.5 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-semibold transition-colors"
            >
              {isLast ? (
                'Entendi! ✓'
              ) : (
                <>
                  Próximo <ChevronRight className="w-3 h-3" />
                </>
              )}
            </button>
          </div>

          {/* Skip link */}
          <div className="mt-3 text-center">
            <button
              onClick={finish}
              className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors underline-offset-2 hover:underline"
            >
              Pular tutorial
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </>,
    document.body
  );
}
