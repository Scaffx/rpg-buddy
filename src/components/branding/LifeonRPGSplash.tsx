import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Splash de abertura de portal / masmorra (dungeon).
 * Anel de runas girando, núcleo pulsando, espada com glint, motes de mana subindo.
 */

type Props = {
  label?: string;
  fullscreen?: boolean;
  minimal?: boolean;
  className?: string;
};

const SplashStyles = () => (
  <style>{`
    @keyframes lifeon-spin { to { transform: rotate(360deg); } }
    @keyframes lifeon-pulse { 0%,100%{ transform:scale(1); opacity:.92; } 50%{ transform:scale(1.05); opacity:1; } }
    @keyframes lifeon-breathe { 0%,100%{ opacity:.45; transform:scale(.98);} 50%{ opacity:.85; transform:scale(1.04);} }
    @keyframes lifeon-glint { 0%{ transform:translateY(-30px); opacity:0;} 30%{opacity:.9;} 60%{opacity:0;} 100%{ transform:translateY(46px); opacity:0;} }
    @keyframes lifeon-rise { 0%{ opacity:0; transform:translate(0,0) scale(.6);} 15%{opacity:.9;} 100%{ opacity:0; transform:translate(var(--x),-170px) scale(1.1);} }
    @keyframes lifeon-riseIn { to { opacity:1; transform:translateY(0); } }
    @keyframes lifeon-blink { 0%,100%{ opacity:.25; transform:scale(.8);} 50%{ opacity:1; transform:scale(1);} }

    .lifeon-halo { animation: lifeon-breathe 3.6s ease-in-out infinite; }
    .lifeon-ring-out { transform-box: fill-box; transform-origin: center; animation: lifeon-spin 26s linear infinite; }
    .lifeon-ring-in  { transform-box: fill-box; transform-origin: center; animation: lifeon-spin 16s linear infinite reverse; }
    .lifeon-core     { transform-box: fill-box; transform-origin: center; animation: lifeon-pulse 3.6s ease-in-out infinite; }
    .lifeon-glint    { animation: lifeon-glint 3.2s ease-in-out infinite; }
    .lifeon-mote     { position:absolute; bottom:46%; left:50%; width:5px; height:5px; border-radius:50%;
                       background: oklch(0.84 0.12 218); box-shadow:0 0 8px 2px oklch(0.84 0.12 218 / .7); opacity:0; }
    .lifeon-mote.m1 { animation: lifeon-rise 3.8s ease-in 0s infinite;  --x:-60px; }
    .lifeon-mote.m2 { animation: lifeon-rise 4.6s ease-in .8s infinite; --x:46px; }
    .lifeon-mote.m3 { animation: lifeon-rise 4.2s ease-in 1.6s infinite; --x:-20px; }
    .lifeon-mote.m4 { animation: lifeon-rise 5s   ease-in 2.4s infinite; --x:70px; }
    .lifeon-word { font-family:'Cinzel',serif; font-weight:700; letter-spacing:2px;
                   opacity:0; transform:translateY(14px); animation: lifeon-riseIn .9s ease-out .5s forwards; }
    .lifeon-tag  { letter-spacing:5px; text-transform:uppercase; color: oklch(0.84 0.12 218);
                   opacity:0; transform:translateY(12px); animation: lifeon-riseIn .9s ease-out .85s forwards; }
    .lifeon-loader { display:flex; gap:9px; align-items:center;
                     opacity:0; animation: lifeon-riseIn .8s ease-out 1.2s forwards; }
    .lifeon-loader i { width:7px; height:7px; border-radius:50%; background: oklch(0.83 0.12 86);
                       display:block; animation: lifeon-blink 1.2s ease-in-out infinite; }
    .lifeon-loader i:nth-child(2){ animation-delay:.2s; }
    .lifeon-loader i:nth-child(3){ animation-delay:.4s; }

    @media (prefers-reduced-motion: reduce){
      .lifeon-ring-out,.lifeon-ring-in,.lifeon-core,.lifeon-glint,.lifeon-halo,.lifeon-mote { animation:none !important; }
      .lifeon-word,.lifeon-tag,.lifeon-loader { animation:none !important; opacity:1 !important; transform:none !important; }
    }
  `}</style>
);

export const LifeonRPGSplash: React.FC<Props> = ({
  label = 'abrindo o portal',
  fullscreen = true,
  minimal = false,
  className,
}) => {
  const ticks = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    const long = i % 3 === 0;
    const r1 = long ? 58 : 63;
    const r2 = 71;
    return (
      <line
        key={i}
        x1={(100 + r1 * Math.cos(a)).toFixed(2)}
        y1={(100 + r1 * Math.sin(a)).toFixed(2)}
        x2={(100 + r2 * Math.cos(a)).toFixed(2)}
        y2={(100 + r2 * Math.sin(a)).toFixed(2)}
        stroke="#e3c06a"
        strokeWidth={long ? 3 : 1.4}
        strokeLinecap="round"
        opacity={long ? 0.95 : 0.45}
      />
    );
  });

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 overflow-hidden',
        fullscreen ? 'fixed inset-0 z-[9999]' : 'relative w-full min-h-[60vh]',
        className,
      )}
      style={{
        background: fullscreen
          ? `radial-gradient(70% 50% at 50% 42%, oklch(0.27 0.10 268) 0%, transparent 62%),
             radial-gradient(120% 90% at 50% 120%, oklch(0.22 0.09 250) 0%, transparent 55%),
             oklch(0.16 0.045 285)`
          : undefined,
        color: 'oklch(0.94 0.018 92)',
        fontFamily: "'Space Grotesk', sans-serif",
      }}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <SplashStyles />

      {fullscreen && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: 0.5,
            backgroundImage: `
              radial-gradient(1.4px 1.4px at 18% 26%, oklch(0.9 0.05 230 / .8), transparent 60%),
              radial-gradient(1.2px 1.2px at 78% 18%, oklch(0.9 0.05 90 / .7), transparent 60%),
              radial-gradient(1.6px 1.6px at 66% 72%, oklch(0.9 0.05 230 / .6), transparent 60%),
              radial-gradient(1.2px 1.2px at 30% 80%, oklch(0.9 0.05 90 / .6), transparent 60%),
              radial-gradient(1.3px 1.3px at 88% 60%, oklch(0.9 0.05 230 / .7), transparent 60%)
            `,
          }}
        />
      )}

      <div className="relative" style={{ width: 'min(54vmin, 320px)', aspectRatio: '1 / 1' }}>
        <div
          className="lifeon-halo absolute rounded-full"
          style={{
            inset: '-18%',
            background:
              'radial-gradient(circle, oklch(0.7 0.13 230 / .55) 0%, transparent 62%)',
            filter: 'blur(14px)',
          }}
        />
        <span className="lifeon-mote m1" />
        <span className="lifeon-mote m2" />
        <span className="lifeon-mote m3" />
        <span className="lifeon-mote m4" />

        <svg
          viewBox="0 0 200 200"
          className="absolute inset-0 w-full h-full"
          style={{ overflow: 'visible' }}
          aria-hidden
        >
          <defs>
            <radialGradient id="lifeon-core-grad" cx="50%" cy="44%" r="56%">
              <stop offset="0" stopColor="#dff3fc" />
              <stop offset="0.4" stopColor="#5b7fe0" />
              <stop offset="0.8" stopColor="#2f2a63" />
              <stop offset="1" stopColor="#1d1b2e" />
            </radialGradient>
          </defs>

          <g className="lifeon-core">
            <circle cx="100" cy="100" r="58" fill="url(#lifeon-core-grad)" />
            <circle cx="100" cy="100" r="58" fill="none" stroke="#7fd6ee" strokeWidth="2" opacity="0.85" />
          </g>

          <g className="lifeon-ring-in">
            <circle
              cx="100" cy="100" r="46"
              fill="none" stroke="#cdeffa"
              strokeWidth="1.2" opacity="0.6"
              strokeDasharray="3 7"
            />
          </g>

          <g className="lifeon-ring-out">
            <circle cx="100" cy="100" r="70" fill="none" stroke="#e3c06a" strokeWidth="3" />
            {ticks}
          </g>

          <g transform="translate(0 4)" strokeLinecap="round" fill="none">
            <line x1="100" y1="29" x2="100" y2="129.5" stroke="#f0ece4" strokeWidth="6" />
            <line x1="83.5" y1="129.5" x2="116.5" y2="129.5" stroke="#f0ece4" strokeWidth="6" />
            <line x1="100" y1="129.5" x2="100" y2="173" stroke="#f0ece4" strokeWidth="6.6" />
            <circle cx="100" cy="179" r="5.7" fill="#f0ece4" stroke="none" />
            <line className="lifeon-glint" x1="100" y1="40" x2="100" y2="58"
                  stroke="#ffffff" strokeWidth="3" opacity="0" />
          </g>
        </svg>
      </div>

      {!minimal && (
        <>
          <div className="lifeon-word" style={{ fontSize: 'clamp(28px, 6vmin, 50px)', marginTop: 20 }}>
            Lifeon<span style={{ color: 'oklch(0.83 0.12 86)' }}>RPG</span>
          </div>
          <div className="lifeon-tag" style={{ fontSize: 'clamp(10px, 2vmin, 12px)' }}>
            Sua rotina é a aventura
          </div>
        </>
      )}

      <div className="lifeon-loader" style={{ marginTop: minimal ? 18 : 26 }}>
        <i /><i /><i />
        <span
          style={{
            fontSize: 11,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: 'oklch(0.78 0.03 285)',
            marginLeft: 6,
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
};

export default LifeonRPGSplash;
