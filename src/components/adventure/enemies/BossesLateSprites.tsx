import type { CSSProperties } from 'react';
import { bossesLateArtwork, type BossesLateForm } from './bossesLate.data';
import type { EnemySpriteProps } from './types';
import './bossesLate.css';

const INK = '#263044';

function tint(hex: string, toward: number, amount: number) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [value >> 16, (value >> 8) & 255, value & 255];
  return `#${channels.map(channel => Math.round(channel + (toward - channel) * amount).toString(16).padStart(2, '0')).join('')}`;
}

type Palette = ReturnType<typeof palette>;
function palette(body: string, accent: string) {
  return {
    body, shadow: tint(body, 15, .34), light: tint(body, 255, .38),
    accent, accentShadow: tint(accent, 15, .25), accentLight: tint(accent, 255, .4),
    ivory: '#f6eedb', ink: INK,
  };
}

function Eye({ x, y, size = 2.5, pupil = 1.15 }: { x: number; y: number; size?: number; pupil?: number }) {
  return <g stroke="none"><ellipse cx={x} cy={y} rx={size} ry={size * 1.12} fill="#fff7e9" /><circle cx={x + .65} cy={y + .2} r={pupil} fill={INK} /><circle cx={x + .95} cy={y - .45} r=".42" fill="white" /></g>;
}

function Art({ form, p }: { form: BossesLateForm; p: Palette }) {
  switch (form) {
    case 'sphinx': return <>
      <path d="M10 39Q3 35 5 28q2-5 8-5l6 4-2 7q-3 4-7 5Z" fill={p.accentShadow} />
      <path d="M17 39Q13 30 22 29l17 4q9 3 8 13l-6 7H18Z" fill={p.body} />
      <path d="M18 40q10-4 22 4l-1 9H19Z" fill={p.shadow} stroke="none" />
      <path d="M18 48q-3 2-3 10h8l3-11m13-1 1 12h8l1-15" fill={p.body} />
      <path d="M15 57h10m14 0h11" stroke={p.accentLight} fill="none" />
      <path d="M13 28Q9 18 15 12l10-7 8 7 8-1 5 17-7 7-21 1Z" fill={p.accent} />
      <path d="M16 14q-3 12 1 19m9-24q-2 12 0 26m8-22 3 19m5-17 2 10" stroke={p.accentShadow} fill="none" strokeWidth="2.6" />
      <path d="M29 18q7-7 14 0l3 10-7 8-10-3-5-8Z" fill={p.ivory} />
      <path d="M44 23q9 0 10 5l-8 5-5-2Z" fill={p.light} />
      <Eye x={39} y={23} /><path d="M48 29q3 1 5-1m-20 1q4 3 8 0" fill="none" />
      <path d="M20 39q9-4 17 1m-25 8q4-11 6-13" fill="none" stroke={p.light} strokeWidth="2.5" />
      <path d="M6 28q-5-5-3-12l5 1" fill="none" stroke={p.shadow} strokeWidth="4" />
    </>;
    case 'dragonGhost': return <>
      <path d="M7 36Q4 16 19 9l10 11-7 21Z" fill={p.accentShadow} />
      <path d="M10 34 9 17l11 9 3-17 9 11 8-13-2 28Z" fill={p.accent} />
      <path d="M13 32q2-8 11-9l13 7q5 7-1 15l-9 5-13-6Z" fill={p.body} />
      <path d="M14 38q-12 5-10 17l8-4 5 9q8-2 11-12" fill={p.shadow} />
      <path d="M34 31q-1-14 9-19l8 5-3 10 9 4 4 9-9 4-12-5Z" fill={p.body} />
      <path d="M43 18q3-9 9-13l1 12m-13 9 7-14" fill={p.accentLight} />
      <path d="M49 32q7-2 11 5l-8 5-9-3" fill={p.light} />
      <Eye x={50} y={29} size={2.3} /><path d="m53 38 2 4 2-5m-25 5 5 12-7-4-4 9" fill={p.ivory} />
      <path d="M18 31q8-6 15 1m-16 14q5 4 11 1" stroke={p.accentLight} strokeWidth="2" fill="none" />
    </>;
    case 'behemoth': return <>
      <path d="M7 24Q13 10 31 12l15 7 6 19-8 17H12L5 41Z" fill={p.body} />
      <path d="M9 37q14-6 35 4l-2 12H13Z" fill={p.shadow} stroke="none" />
      <path d="M12 16 16 4l8 11 9-13 6 14 10-9 2 18-18 6Z" fill={p.accent} />
      <path d="m17 12 2-3 4 8m10-6 2-5 3 10m9-3 2 10" stroke={p.accentLight} strokeWidth="2" fill="none" />
      <path d="M11 40q-5 3-5 18h11l4-14m20-3 1 17h12l-2-18" fill={p.body} />
      <path d="M8 57h11m22 0h13" stroke={p.light} fill="none" />
      <path d="M39 21q6-7 14-4l7 7 1 15-10 9-15-5-2-13Z" fill={p.body} />
      <path d="M48 31q9-4 14 3l-5 9-9-1Z" fill={p.light} />
      <path d="M53 37q2 5 5 5" fill="none" /><Eye x={48} y={27} />
      <path d="M39 25q6-4 10-3m-17 16q7 3 12 1" stroke={p.light} strokeWidth="2.5" fill="none" />
    </>;
    case 'serpent': return <>
      <path d="M10 50Q3 46 6 36q3-8 12-7 10 1 9 11-1 8-8 7 4 8 16 4 11-3 7-13L32 25q-5-10 4-18 11-8 20 1l-2 15-11 9 8 11q5 16-10 19-17 3-29-5Z" fill={p.body} />
      <path d="M15 38q3-5 7-1m-8 14q8 9 22 4 16-4 10-16L35 21" stroke={p.light} strokeWidth="3" fill="none" />
      <path d="M35 11Q29 1 37 3l6 6q6-10 12-6l-2 12-10 9Z" fill={p.accent} />
      <path d="M39 15q5-4 10-2l9 5q6 5 1 9l-12 2-9-7Z" fill={p.body} />
      <path d="M50 22q6-1 10 3l-10 4-5-3" fill={p.light} />
      <Eye x={49} y={18} /><path d="m54 27 1 5 3-4m-15 3q-2 6 1 11" fill="none" />
      <path d="M8 38q-3 10 3 15" stroke={p.accent} strokeWidth="3" fill="none" />
    </>;
    case 'phoenix': return <>
      <path d="M25 38Q11 42 3 29L4 9l13 16-3-19 13 22Z" fill={p.shadow} />
      <path d="M27 34Q42 20 57 4l-4 22 8-8q-2 18-23 24Z" fill={p.accentShadow} />
      <path d="M8 17q8 22 22 20M54 15Q44 35 33 37" stroke={p.accentLight} strokeWidth="3" fill="none" />
      <path d="M19 34q8-10 18-4l7 17-13 8-15-8Z" fill={p.body} />
      <path d="M24 44q6 4 14 0l-6 7-10-3" fill={p.light} stroke="none" />
      <path d="M21 50 13 61l13-4 5 5 3-11m3-1 8 10-1-12" fill={p.accent} />
      <path d="M31 30q-3-13 5-19l9-1 7 9-2 17-11 5Z" fill={p.body} />
      <path d="M36 14 35 4l8 8 7-9-1 14" fill={p.accent} />
      <path d="M47 23q8-2 14 3l-11 7-5-3Z" fill={p.ivory} />
      <Eye x={44} y={23} /><path d="M20 37q6-3 13 1" stroke={p.light} strokeWidth="2.5" fill="none" />
    </>;
    case 'tiamat': return <>
      <path d="M9 39 2 13l14 15 4-18 11 22L43 8l2 20L60 12l-5 31Z" fill={p.accentShadow} />
      <path d="M14 34q13-13 30 0l9 16-9 8H14L5 50Z" fill={p.body} />
      <path d="M12 47q18-5 37 3l-5 7H14Z" fill={p.shadow} stroke="none" />
      <path d="M13 51v9h9l4-8m14-1 2 9h10l-3-11" fill={p.body} />
      <path d="M13 36Q5 23 7 12l5-4 8 6 4 22m2-1Q19 16 24 7l6-4 7 7-2 26m3 0q-3-22 6-30l7 4-2 28m-5 0q8-21 13-21l4 8-8 18" fill={p.body} />
      <path d="M5 10q6-8 12 2l-2 8-8-1Zm17-4q7-8 12 1l-1 10-9 1Zm21 1q8-6 11 4l-4 10-9-4Zm12 13q6-7 7 1l-3 9-7-3Z" fill={p.accent} />
      <path d="M9 18q4 2 7 0m10-3q4 2 8 0m12 4q4 2 7 0m4 9q3 1 5-1" stroke={p.light} strokeWidth="1.7" fill="none" />
      <g stroke="none" fill={p.ink}><circle cx="12" cy="14" r="1.2" /><circle cx="29" cy="10" r="1.2" /><circle cx="48" cy="13" r="1.2" /><circle cx="58" cy="23" r="1.1" /></g>
      <path d="M18 34q7-12 14-9 9 0 12 12l-9 11-14-4Z" fill={p.body} />
      <path d="M24 28q6-10 12-9l7 10-3 10-14 1Z" fill={p.accent} />
      <Eye x={35} y={30} size={2} /><path d="M39 37q7 0 9 5l-9 2-6-4" fill={p.light} />
    </>;
    case 'odin': return <>
      <path d="M14 25Q5 33 4 57l15 2 9-12 16 12 14-2q-6-31-17-34Z" fill={p.shadow} />
      <path d="M16 28q13-10 27 2l4 27H13Z" fill={p.body} />
      <path d="M16 38q12 6 26 0m-22 8q11 5 20 0" stroke={p.light} strokeWidth="2.5" fill="none" />
      <path d="M15 31 7 44l5 5 12-11m19-7 9 14-6 5-12-12" fill={p.body} />
      <path d="M22 14q8-10 18-1l1 17-8 9-12-7Z" fill={p.ivory} />
      <path d="M20 26q2 13 12 17 11-6 10-17l-9 5Z" fill={p.light} />
      <path d="M19 20 16 11l7-8 19 1 5 8-5 8-5-7-12 2Z" fill={p.accent} />
      <path d="M19 11q12-5 25 0" stroke={p.accentLight} strokeWidth="2.5" fill="none" />
      <Eye x={34} y={20} size={2.1} /><path d="m24 19 5 2m1 5q5 2 8-1" fill="none" />
      <path d="M6 59 54 4m-5 3 5-5 5 5m-52 51h7" stroke={p.accent} strokeWidth="3" fill="none" />
      <path d="M4 20q4-6 9-1l-3 5-7-1m45-1q4-6 10-2l-5 5-6-1" fill={p.ink} />
    </>;
    case 'anubis': return <>
      <path d="M14 29q-8 9-9 29h43q-1-20-10-29Z" fill={p.shadow} />
      <path d="M15 36q13-6 27 0l4 21H10Z" fill={p.body} />
      <path d="M15 35q7 12 13 13 7-2 14-13l-8-7H23Z" fill={p.accent} />
      <path d="M18 37q10 11 20 0m-15 8q6 4 11 0" stroke={p.accentLight} strokeWidth="2" fill="none" />
      <path d="M18 30 14 7l8 10 8-5 6 17Z" fill={p.body} />
      <path d="M30 24 36 4l6 18-5 15Z" fill={p.body} />
      <path d="M18 29q6-13 18-9l8 9 15 2-3 8-17 5-17-5Z" fill={p.body} />
      <path d="M42 32q10-2 16 1l-3 6-13 1Z" fill={p.light} />
      <Eye x={37} y={29} /><path d="m55 36 3-1M20 15l2 8m13-8 2-5" stroke={p.accent} fill="none" strokeWidth="2" />
      <path d="M6 60 12 6m-4 8 3-7 5 7M7 53l8 1" stroke={p.accent} strokeWidth="3" fill="none" />
    </>;
    case 'poseidon': return <>
      <path d="M17 26Q5 33 8 58l20 1 9-14 13 14 10-2q-7-26-18-32Z" fill={p.accentShadow} />
      <path d="M16 31q9-7 26 0l6 27H13Z" fill={p.body} />
      <path d="M16 44q16 8 30-1m-27 8q13 5 25-1" stroke={p.light} strokeWidth="2.5" fill="none" />
      <path d="M15 33 8 45l7 5 13-13m15-4 9 14-6 5-14-14" fill={p.body} />
      <path d="M21 14q7-9 18-3l5 18-10 10-12-8Z" fill={p.ivory} />
      <path d="M23 27q4 14 11 16 10-6 8-17l-7 3Z" fill={p.light} />
      <path d="M19 18q-1-12 6-13l2 7q5-11 10-9l2 10 7-3-2 13-7-7-11 3Z" fill={p.accent} />
      <Eye x={35} y={21} size={2} /><path d="M30 27q5 2 9 0" fill="none" />
      <path d="M55 59V7m-6 7 6-9 6 9m-12 0v8m12-8v8" fill="none" stroke={p.accentLight} strokeWidth="3" />
      <path d="M4 58q4-5 9 0m34 0q5-5 11 0" fill="none" stroke={p.accentLight} strokeWidth="2.5" />
    </>;
    case 'bahamut': return <>
      <path d="M10 38 3 7l17 14 11-17 4 22L55 8l-4 30Z" fill={p.accentShadow} />
      <path d="M9 14q7 16 20 19M51 16Q43 33 35 36" stroke={p.accentLight} strokeWidth="3" fill="none" />
      <path d="M12 36q6-10 23-8 14 2 19 17l-7 11H15L7 48Z" fill={p.body} />
      <path d="M13 48q17-6 37 0l-3 7H15Z" fill={p.shadow} stroke="none" />
      <path d="M17 49 15 60h10l5-10m13-2 1 12h11l-3-15" fill={p.body} />
      <path d="M35 31q-1-13 8-17l9 2 5 14 5 7-10 10-14-4Z" fill={p.body} />
      <path d="M40 20 39 7l8 8 7-11 2 17" fill={p.accent} />
      <path d="M47 32q8-5 15 3l-4 8-12-2Z" fill={p.light} />
      <Eye x={51} y={27} /><path d="M18 39q11-5 19 0m-1 7q7 1 12-2" fill="none" stroke={p.light} strokeWidth="2" />
    </>;
    case 'shinigami': return <>
      <path d="M19 11Q28 2 42 10q8 11 4 22l12 27-17-5-11 7-9-8-15 6 9-30Z" fill={p.shadow} />
      <path d="M19 17q13-15 23 1l-1 24-14 8-12-13Z" fill={p.body} />
      <path d="M21 22q9-11 18 0l-2 14-9 7-10-10Z" fill={p.ink} />
      <path d="M25 24q6-5 11 0l-1 12-7 3-6-5Z" fill={p.ivory} />
      <path d="M24 29h4m5 0h3m-8 6 4 1" stroke={p.accent} strokeWidth="2.3" fill="none" />
      <path d="M18 45q12 6 26-1m-25 8q11 5 23-1" stroke={p.light} strokeWidth="2" fill="none" />
      <path d="M13 38 5 49l8 6 11-12m17-5 12 11-8 5-11-12" fill={p.body} />
      <path d="M5 59 53 8M53 8Q37 4 28 17q15-7 28 3 1-9-3-12Z" fill={p.accent} strokeWidth="2.5" />
    </>;
    case 'ifrit': return <>
      <path d="M26 42Q16 47 21 56l-8 7q21-1 29-17Z" fill={p.accentShadow} />
      <path d="M17 24q-6-11 1-18l2 10Q28 8 30 2l5 13q8-7 10-12 3 13 8 18l-4 16Z" fill={p.accent} />
      <path d="M20 25q8-8 23 0l6 18-13 11-20-11Z" fill={p.body} />
      <path d="M20 38q11 8 25 0l-10 13-16-8Z" fill={p.shadow} stroke="none" />
      <path d="M18 29 7 36l-4 12 9 3 15-15m18-8 11 8 5 12-10 4-13-16" fill={p.body} />
      <path d="M7 42q6 1 8 6m38-5q-4 0-6 5" stroke={p.light} strokeWidth="2" fill="none" />
      <path d="M24 23 19 9l10 7q6-10 12-6l-2 11" fill={p.shadow} />
      <path d="M25 24q4-8 12-7l7 8-5 11-14-1Z" fill={p.body} />
      <Eye x={36} y={25} /><path d="M30 31q5 3 9 0" fill="none" />
      <path d="M22 40q11 6 22 0" stroke={p.accentLight} strokeWidth="2.5" fill="none" />
    </>;
    case 'valkyrie': return <>
      <path d="M15 36Q4 31 3 13l13 9-3-17 15 20m18 11q13-8 15-26L48 21l3-17-17 23" fill={p.ivory} />
      <path d="M6 18q7 14 17 15m32-17Q50 28 39 33" stroke={p.light} strokeWidth="2.5" fill="none" />
      <path d="M17 30q12-9 23 0l7 27H11Z" fill={p.body} />
      <path d="M19 39q10 7 20 0l-4 15H22Z" fill={p.accent} />
      <path d="M13 31 5 43l8 6 13-12m17-6 10 13-7 6-13-14" fill={p.body} />
      <path d="M22 14q7-7 15 0l3 17-9 7-10-8Z" fill={p.ivory} />
      <path d="M19 17q0-11 12-13 11 2 11 13l-7-5-8 4Z" fill={p.accent} />
      <path d="M20 12 13 7l3 13 8 1m17-10 8-5-3 15-7 2" fill={p.ivory} />
      <Eye x={34} y={22} size={2.1} /><path d="M30 29q4 2 7-1" fill="none" />
      <path d="M5 60 47 6m-3 2 4-6 5 5" stroke={p.accent} strokeWidth="3" fill="none" />
      <ellipse cx="51" cy="46" rx="8" ry="11" fill={p.accent} /><path d="M51 39v13m-5-6h10" stroke={p.accentLight} strokeWidth="2" />
    </>;
    case 'leviathan': return <>
      <path d="M5 53Q1 39 12 35q10-4 16 4 6 9 16 4 9-4 1-14l-8-10q-5-11 6-15l10 7 4 15 5 7-8 7q8 16-7 21-15 5-27-6-8-5-15 1Z" fill={p.body} />
      <path d="M6 49q4-12 14-8 5 2 8 7 12 14 24 4" fill="none" stroke={p.light} strokeWidth="3" />
      <path d="M12 34 7 20l11 9 4-14 9 17m8-14-4-13 10 7 6-9 4 18" fill={p.accent} />
      <path d="M48 18q7-6 12-1l-2 13-11 5-7-9Z" fill={p.body} />
      <path d="M52 25q7-1 10 5l-8 5-7-3" fill={p.light} /><Eye x={52} y={20} />
      <path d="M4 57q6-4 13 0m20 2q8-5 17-1" fill="none" stroke={p.accentLight} strokeWidth="2.5" />
      <path d="M27 40q4-2 8-1m-8 11q4 3 9 2" fill="none" stroke={p.accentShadow} strokeWidth="2" />
    </>;
    case 'archlich': return <>
      <path d="M17 20Q25 5 40 18l5 14 12 27-18-4-11 5-10-6-13 5 10-29Z" fill={p.shadow} />
      <path d="M17 30q11-8 26 0l5 28H11Z" fill={p.body} />
      <path d="M19 44q11 4 22 0m-20 9q10 4 20 0" fill="none" stroke={p.light} strokeWidth="2" />
      <path d="M20 14 17 6l8 3 5-7 7 7 8-3-2 10-11 6Z" fill={p.accent} />
      <path d="M20 18q10-9 21 0l-2 17-10 6-11-7Z" fill={p.ivory} />
      <path d="M22 25h5m7 0h4m-10 7 3 2 3-2" stroke={p.accentShadow} strokeWidth="2.3" fill="none" />
      <path d="M16 36 7 45l7 7 11-12m17-4 10 10-6 7-12-13" fill={p.body} />
      <path d="M7 60 11 12m-4 0 5-7 7 5-2 9-9 1Z" fill={p.accent} strokeWidth="2.5" />
      <path d="M24 13q7-3 14 0" stroke={p.accentLight} strokeWidth="2" fill="none" />
    </>;
    case 'lucifer': return <>
      <path d="M21 34 3 7l17 9-8-12 21 20L51 3l-5 14L61 8 46 36Z" fill={p.shadow} />
      <path d="M7 14q9 15 21 22M56 14Q46 32 36 36" fill="none" stroke={p.accentShadow} strokeWidth="2.5" />
      <path d="M17 30q15-9 29 0l8 28H10Z" fill={p.body} />
      <path d="M22 35q10 8 19 0l-5 24H25Z" fill={p.shadow} />
      <path d="M14 33 5 48l8 5 15-15m18-5 11 14-8 6-14-15" fill={p.body} />
      <path d="M22 14q8-9 18-1l4 18-12 9-12-9Z" fill={p.ivory} />
      <path d="M19 19Q18 5 24 4l5 11 8-11q9 0 8 16l-9-7-9 6Z" fill={p.accentShadow} />
      <path d="M23 17q5-8 15-7" stroke={p.accent} strokeWidth="2" fill="none" />
      <Eye x={37} y={23} size={2.2} /><path d="M31 30q5 3 9-1" fill="none" />
      <path d="M8 58 58 5m-4 2 5-5 2 8" stroke={p.accent} strokeWidth="2.5" fill="none" />
    </>;
    case 'chronos': return <>
      <circle cx="32" cy="27" r="24" fill={p.accentShadow} />
      <circle cx="32" cy="27" r="19" fill={p.ivory} />
      <path d="M32 10v5m0 25v5M14 27h5m26 0h5m-18 0 9-11m-9 11-6-8" stroke={p.shadow} strokeWidth="2" fill="none" />
      <path d="M16 31Q6 40 9 58h47q-2-21-13-28Z" fill={p.shadow} />
      <path d="M18 35q13-7 26 0l6 23H13Z" fill={p.body} />
      <path d="M20 46q12 5 23 0m-18 7q8 3 15 0" stroke={p.light} strokeWidth="2" fill="none" />
      <path d="M21 21q7-10 17-5l4 19-9 10-12-9Z" fill={p.ivory} />
      <path d="M22 33q2 12 10 16 9-6 9-16l-9 4Z" fill={p.light} />
      <path d="M20 24q2-13 13-14l9 12-10-6-11 11" fill={p.accent} />
      <Eye x={35} y={27} size={2} /><path d="M31 33q4 2 7 0" fill="none" />
      <path d="M6 60 9 9m-3 0 4-6 5 6-2 9H6Z" fill={p.accent} strokeWidth="2.5" />
    </>;
    case 'void': return <>
      <path d="M12 20Q7 9 21 8l8-6 8 7q17-4 18 11l7 9-8 8 7 11-13 1-4 11-13-7-11 8-4-12-13-2 7-10-6-9Z" fill={p.accentShadow} />
      <path d="M15 18q14-10 30 0l9 12-8 22-16 8-18-12-4-17Z" fill={p.body} />
      <path d="M13 37q10 6 15 1 8-7 16 0l6-5m-32 15q9 7 20 5" stroke={p.light} strokeWidth="2.5" fill="none" />
      <path d="M22 23q10-10 20 0l5 12-12 13-13-9Z" fill={p.ink} />
      <path d="M25 28q5-4 10-1l6 8-8 8-9-6Z" fill={p.accent} />
      <Eye x={32} y={32} size={3.7} pupil={1.8} />
      <path d="M12 23 4 18m48 3 8-5M12 50 4 57m43-5 11 7" fill="none" stroke={p.accent} strokeWidth="3" />
    </>;
    case 'gaia': return <>
      <path d="M27 24Q17 15 10 5L6 15l-4-3q1 13 20 21m15-9Q47 12 54 4l3 11 5-3q-3 15-23 21" fill={p.accentShadow} />
      <path d="M10 10q5 12 15 18m29-18Q48 22 37 28" fill="none" stroke={p.accentLight} strokeWidth="2.5" />
      <path d="M17 31q14-9 27 0l12 27-19-5-9 8-8-8-14 5Z" fill={p.body} />
      <path d="M17 43q13 8 29 1l-8 13-10-5-9 5Z" fill={p.shadow} stroke="none" />
      <path d="M13 33 5 45l9 5 14-12m16-5 12 12-8 6-15-12" fill={p.body} />
      <path d="M22 17q8-9 18-1l4 17-11 9-12-9Z" fill={p.ivory} />
      <path d="M19 22q1-13 8-17l5 9q4-12 12-9l-1 19-8-9-10 8Z" fill={p.accent} />
      <path d="M24 9 17 4l3 10m20-5 8-6-2 12" fill={p.light} />
      <Eye x={36} y={25} size={2.1} /><path d="M31 32q4 3 8 0" fill="none" />
      <path d="M13 56q5-5 9 1m23-1q4-5 9 1" stroke={p.accentLight} strokeWidth="2.5" fill="none" />
    </>;
    case 'ragnarok': return <>
      <path d="M15 21Q3 27 3 57l18-6 10 9 13-8 17 5Q58 27 47 21Z" fill={p.shadow} />
      <path d="M16 27q15-8 30 0l8 31H10Z" fill={p.body} />
      <path d="M15 43q14 6 33-1m-29 9q11 5 25 0" stroke={p.light} strokeWidth="2.5" fill="none" />
      <path d="M13 28 5 42l9 8 15-13m19-9 11 14-9 8-15-13" fill={p.body} />
      <path d="M22 16q8-8 19-1l3 18-12 10-12-10Z" fill={p.ivory} />
      <path d="M18 23 15 7l10 6 8-10 8 10 10-6-4 17-11-6-11 6Z" fill={p.accent} />
      <path d="M19 16q13-5 27 0" stroke={p.accentLight} strokeWidth="2.5" fill="none" />
      <Eye x={37} y={26} size={2.1} /><path d="M31 34q5 2 9-1" fill="none" />
      <path d="M5 59 51 9m-5-3 10-3 5 11-10 7-7-8Z" fill={p.accentShadow} strokeWidth="2.5" />
      <path d="M47 8q6 6 10 5" stroke={p.accentLight} strokeWidth="2" fill="none" />
    </>;
  }
}

export function BossesLateSprite({ enemyKey, className }: EnemySpriteProps) {
  const art = bossesLateArtwork.find(({ enemyKey: key }) => key === enemyKey);
  if (!art) return null;

  return (
    <svg
      viewBox="0 0 32 32"
      className={['bossesLate-sprite', className].filter(Boolean).join(' ')}
      style={{ '--bossesLate-body': art.body, '--bossesLate-accent': art.accent } as CSSProperties}
      data-enemy-key={enemyKey}
      aria-hidden="true"
      focusable="false"
    >
      <g className="bossesLate-sprite__silhouette" transform="scale(.5)" stroke={INK} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
        <Art form={art.form} p={palette(art.body, art.accent)} />
      </g>
    </svg>
  );
}
