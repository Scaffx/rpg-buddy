import type { ReactNode } from 'react';
import type { EnemyEffectProps } from './types';
import { bossesEarlyAnimations, bossesEarlyMotifs } from './bossesEarly.data';
import './bossesEarly.css';

const animations = new Map(bossesEarlyAnimations.map((animation) => [animation.id, animation]));

function Glyph({ motif }: { motif: string }): ReactNode {
  switch (motif) {
    case 'dagger': case 'bone-sword': case 'knight-sword': case 'holy-sword':
      return <><path d="M15 82 70 20 84 10 78 27 26 84Z"/><path d="m19 61 21 18M17 85l-7 8"/>{motif === 'holy-sword' && <path d="M67 8v28M53 22h28"/>}</>;
    case 'axe': case 'crush': case 'bone-break':
      return <><path d="M26 88 64 15M59 14 85 24 70 52 51 43Z"/><path d="m68 72 9 10 10-8M25 88l-12 4"/></>;
    case 'bite': case 'fang': case 'venom-bite': case 'sea-bite': case 'devour':
      return <><path d="M13 32 Q50 58 88 27 L75 72 Q50 90 21 67Z"/><path d="m25 43 9 18 8-11 9 16 8-15 9 10 11-20"/>{(motif === 'venom-bite' || motif === 'sea-bite') && <path d="M50 82q-7 9 0 13 7-4 0-13Z"/>}</>;
    case 'double-claw': case 'dragon-claw': case 'gold-claw': case 'shadow-hand': case 'doom-touch':
      return <><path d="m14 72 21-51M37 80 57 20M60 82 83 28"/><path d="m14 72 12 7m11 1 12 5m11-3 10 4"/>{motif === 'doom-touch' && <circle cx="51" cy="52" r="15"/>}</>;
    case 'charge': case 'gallop': case 'multi-charge': case 'horn-charge': case 'spear-charge':
      return <><path d="M89 49 57 20v18H15v23h42v18Z"/><path d="M8 23h27M4 50h30M8 77h27"/>{motif === 'multi-charge' && <path d="m66 11 17 11m-17 67 17-11"/>}</>;
    case 'shout': case 'pack': case 'defense-roar':
      return <><path d="M14 39 37 28 49 39 80 27M14 53 40 48 58 55 91 47M14 69 37 74 50 64 80 77"/>{motif === 'pack' && <><path d="m18 18 9-12 9 13m36 2 9-12 8 16"/><circle cx="29" cy="23" r="3"/><circle cx="78" cy="29" r="3"/></>}{motif === 'defense-roar' && <path d="M50 14 69 21v27q0 20-19 32-19-12-19-32V21Z"/>}</>;
    case 'spin': case 'fire-tornado':
      return <><path d="M79 30C53 9 15 32 27 63c10 23 48 20 54-2M55 15l26 15-17 15M14 63l13 17 18-10"/><path d="M49 29q-25 20 2 43"/></>;
    case 'rage': case 'heat-aura': case 'daemon-aura': case 'wisdom-aura':
      return <><circle cx="50" cy="50" r="26"/><path d="M50 6v14m0 60v14M6 50h14m60 0h14M19 19l10 10m42 42 10 10M81 19 71 29M29 71 19 81"/><path d="m39 57 9-26 5 20 11-11"/></>;
    case 'web':
      return <><circle cx="50" cy="50" r="10"/><circle cx="50" cy="50" r="29"/><path d="M50 5v90M5 50h90M18 18l64 64M82 18 18 82M50 22 33 33 22 50l11 17 17 11 17-11 11-17-11-17Z"/></>;
    case 'shell': case 'stone-skin': case 'immortal-shield':
      return <><path d="M50 8 84 23v28c0 24-16 37-34 43C32 88 16 75 16 51V23Z"/><path d="M50 20 72 29v22c0 13-8 24-22 30-14-6-22-17-22-30V29Z"/><path d="m32 50 13 12 25-27"/></>;
    case 'flame-cone': case 'seeking-flames': case 'fire-pillars': case 'ember-tail': case 'fire-feather':
      return <><path d="M48 90C8 62 41 51 31 26c19 12 12 24 20 27 12-21 9-29 8-43 35 33 35 62-11 80Z"/><path d="M51 76c-13-11 2-20 2-32 16 17 18 25-2 32Z"/>{motif === 'fire-pillars' && <path d="M11 86V45M22 86V26M78 86V33M89 86V54"/>}</>;
    case 'dragon-flight': case 'holy-flight':
      return <><path d="M50 54 9 16 15 66 42 72 50 58 58 72 85 66 91 16Z"/><path d="M50 54V12m-8 70 8-22 8 22"/></>;
    case 'fire-ring': case 'rebirth': case 'resurrection':
      return <><circle cx="50" cy="54" r="30"/><path d="M50 80V18m-17 29 17-28 17 28M27 83l-8 10m54-10 8 10"/>{motif === 'rebirth' && <path d="M21 65q30 33 58 0"/>}</>;
    case 'bone-burst': case 'bone-reform':
      return <><path d="m24 23 52 54M76 23 24 77M17 20l10-4 7 10-7 9-10-3M72 67l10-3 7 10-7 9-10-3M72 17l10 4 1 10-10 5-7-8M16 69l10-4 8 8-5 10-10 1"/><circle cx="50" cy="50" r="12"/></>;
    case 'shadow-bolt': case 'dark-ray': case 'curse': case 'dark-field':
      return <><path d="M13 47 39 30l13 14 34-33-16 34 17 12-34 11-8 22-10-22Z"/><circle cx="51" cy="50" r="13"/>{(motif === 'curse' || motif === 'dark-field') && <circle cx="51" cy="50" r="34"/>}</>;
    case 'clones': case 'summon':
      return <><circle cx="50" cy="23" r="9"/><path d="M34 76V55q0-15 16-15t16 15v21Z"/><circle cx="20" cy="39" r="6"/><path d="M9 78V59q0-10 11-10t11 10v19ZM69 78V59q0-10 11-10t11 10v19Z"/><circle cx="80" cy="39" r="6"/></>;
    case 'spear': case 'trident': case 'trident-hook': case 'horn': case 'stinger': case 'venom-sting':
      return <><path d="M12 86 76 20M66 16l15-8-5 17-12 4Z"/>{(motif === 'trident' || motif === 'trident-hook') && <path d="M65 18 60 6m14 15 13-3M54 25l-7-10"/>}{motif === 'trident-hook' && <path d="M13 70q18-13 31-2"/>}</>;
    case 'arrows': case 'thorns':
      return <><path d="M18 12 36 76m17-64 4 65m26-65L69 78M24 27l-7-11 15 5m20 6-8-11 16 7m19 3-3-13 12 11M19 80h18m11 0h18m5 0h18"/></>;
    case 'stone-fist': case 'rock-punch': case 'branch-fist':
      return <><path d="M19 85V48l12-10 8 5 8-9 10 5 8-8 14 11v43Z"/><path d="m19 60 19 6 14-9 27 6M32 39l3 18m20-19 2 19"/></>;
    case 'quake': case 'pressure':
      return <><path d="M5 72h22l11-28 12 20 14-39 12 47h19M10 87h80M20 19l8 8m48-9-8 9"/><circle cx="50" cy="52" r="37"/></>;
    case 'absorb-flame':
      return <><path d="M50 83C28 67 43 54 38 40c15 7 14 17 16 18 8-13 7-25 7-34 20 25 19 44-11 59Z"/><path d="m9 25 23 20m-6-29 10 24m55-14L69 46m8-29L66 40M5 54l25 6m64-6-24 6"/><circle cx="52" cy="61" r="10"/></>;
    case 'ice-regen':
      return <><path d="M50 23 66 47 50 79 34 47Z"/><path d="M50 23v56M34 47h32M8 18l20 17M92 18 72 35M9 82l20-17m62 17L71 65"/><path d="m24 28 4 7-8-1m56-6-4 7 8-1M23 70l6-5-1 8m49-3-6-5 1 8"/></>;
    case 'pool-regen':
      return <><path d="M10 76q12-11 23 0 14-14 28-1 13-10 29 1l-5 12H15Z"/><path d="M28 65q-8-12 1-19t1-17m21 34q-7-12 1-19t1-17m20 38q-7-12 1-19t1-17"/><circle cx="18" cy="78" r="3"/><circle cx="73" cy="79" r="3"/></>;
    case 'growth':
      return <><path d="M50 84V40M49 58C23 63 18 45 23 32c14-2 23 7 26 26ZM51 51c3-25 15-32 29-28 0 18-8 27-29 28Z"/><path d="M25 87h50M35 92h30"/></>;
    case 'ice-shard': case 'frost-jet': case 'ice-slide':
      return <><path d="M50 7 68 36 91 50 68 64 50 93 32 64 9 50l23-14Z"/><path d="M50 7v86M9 50h82M32 36l36 28M68 36 32 64"/>{motif === 'ice-slide' && <path d="M4 87q22-8 43 0t49 0M8 96h82"/>}</>;
    case 'riddle':
      return <><path d="M30 32c0-17 40-17 40 3 0 16-19 17-19 29M51 76v2"/><circle cx="50" cy="50" r="43"/><path d="M18 18 8 8m74 10 10-10M8 91l10-10m74 10-10-10"/></>;
    case 'roots':
      return <><path d="M50 91V51M50 58Q25 31 10 46M50 66Q72 26 89 39M50 77Q24 64 8 77M50 81Q76 69 94 78M50 51 37 20m13 31 17-39"/><path d="m10 46 9-15m70 8-8-16"/></>;
    case 'whispers':
      return <><path d="M12 47q15-24 33 0t40-2M11 61q17 20 38-2t39 0M19 25q11-15 28 2m14 49q15 12 24-3"/><circle cx="23" cy="47" r="3"/><circle cx="77" cy="57" r="3"/></>;
    case 'spores':
      return <><circle cx="28" cy="29" r="8"/><circle cx="65" cy="25" r="6"/><circle cx="77" cy="52" r="10"/><circle cx="38" cy="56" r="5"/><path d="M9 82q16-15 29 0 15-18 28 0 15-13 26 0M12 89h77"/></>;
    case 'tsunami':
      return <><path d="M6 73Q25 16 55 31q-16 0-18 17Q69 18 92 42q-28 4-20 25 9-15 23-9-2 27-30 28H6Z"/><path d="M15 84q15-8 30 0t30 0"/></>;
    default:
      return <><path d="M50 9 88 50 50 91 12 50Z"/><path d="M50 24v52M24 50h52"/></>;
  }
}

export function BossesEarlyEffect({ animationId, target }: EnemyEffectProps) {
  const animation = animations.get(animationId);
  if (!animation) return null;
  const motif = bossesEarlyMotifs[animationId];
  return <div className="bossesEarly-vfx" data-enemy-vfx="early" data-enemy-animation={animationId} data-target={target} data-element={animation.element} data-motion={animation.motion} data-motif={motif} aria-hidden="true">
    <span className="bossesEarly-vfx__source"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="22"/><circle cx="50" cy="50" r="8"/><path d="M50 5v18M50 77v18M5 50h18M77 50h18"/></svg></span>
    <span className="bossesEarly-vfx__travel"><span className="bossesEarly-vfx__glyph"><svg viewBox="0 0 100 100"><Glyph motif={motif}/></svg></span></span>
    <span className="bossesEarly-vfx__impact"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="27"/><path d="M50 3v16M50 81v16M3 50h16M81 50h16M17 17l12 12m42 42 12 12M83 17 71 29M29 71 17 83"/></svg></span>
  </div>;
}
