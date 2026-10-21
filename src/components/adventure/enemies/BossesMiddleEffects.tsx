import type { CSSProperties, ReactNode } from 'react';
import type { EnemyAnimationElement, EnemyEffectProps } from './types';
import { bossesMiddleAnimations, bossesMiddleMotifs, bossesMiddleVisuals } from './bossesMiddle.data';
import './bossesMiddle.css';

const elementColor: Record<EnemyAnimationElement, string> = {
  physical: '#e9d2b5', arcane: '#c3a6f5', fire: '#ff9d62', ice: '#b3ecff',
  lightning: '#ffe581', nature: '#b9e388', light: '#fff1ae', water: '#88d9f0',
  earth: '#d1b58a', shadow: '#b099d9', poison: '#a7e476', wind: '#d6f1e1',
};

function Motif({ name }: { name: string }) {
  let drawing: ReactNode;
  switch (name) {
    case 'fang': case 'triple-fang': case 'venom-fang': case 'end-bite':
      drawing = <><path d="M19 30 Q49 12 80 30 L69 73 57 45 49 76 38 45 27 71Z" />{name === 'triple-fang' && <><path d="M5 38 Q19 22 33 38 L23 72 15 47 10 69Z" /><path d="M68 38 Q83 22 97 38 L91 69 84 47 77 72Z" /></>}{name === 'venom-fang' && <><circle cx="48" cy="86" r="5" /><circle cx="73" cy="79" r="3" /></>}{name === 'end-bite' && <path d="M8 50 Q50 98 92 50" />}</>;
      break;
    case 'slash': case 'rift-slash': case 'sand-blade': case 'branch': case 'tail-sweep':
      drawing = <><path d="M13 77 Q48 18 90 19 Q69 43 28 85Z" />{name === 'rift-slash' && <path d="M44 4 L54 30 45 49 57 65 48 96" />}{name === 'sand-blade' && <><circle cx="71" cy="68" r="3" /><circle cx="81" cy="78" r="2" /></>}{name === 'branch' && <path d="M43 49 L23 36 M64 32 L73 12 M62 65 L78 78" />}{name === 'tail-sweep' && <path d="M12 87 Q63 80 91 58" />}</>;
      break;
    case 'claw': case 'shadow-claws':
      drawing = <><path d="M27 14 Q39 46 18 84 M52 8 Q62 45 42 88 M77 14 Q84 47 67 84" />{name === 'shadow-claws' && <path d="M15 90 Q51 68 85 90" />}</>;
      break;
    case 'puddle': case 'ink': case 'spores':
      drawing = <><path d="M11 73 Q28 58 44 69 Q61 52 87 72 Q77 90 51 84 Q24 91 11 73Z" /><circle cx="26" cy="38" r="5" /><circle cx="52" cy="22" r="7" /><circle cx="74" cy="44" r="4" />{name === 'spores' && <><circle cx="18" cy="18" r="3" /><circle cx="84" cy="18" r="5" /></>}</>;
      break;
    case 'regrow': case 'deep-regen': case 'heal':
      drawing = <><path d="M50 85 V24 M50 55 Q24 57 22 31 Q44 30 50 55Z M50 47 Q76 49 78 22 Q57 24 50 47Z" />{name === 'heal' && <path d="M38 15 H62 M50 3 V27" />}{name === 'deep-regen' && <path d="M50 76 Q27 75 15 91 M50 76 Q72 75 85 91" />}</>;
      break;
    case 'blink': case 'paradox': case 'mirages':
      drawing = <><path d="M47 16 Q59 17 61 32 L57 50 70 85 H29 L42 50 38 32 Q39 20 47 16Z" /><path d="M22 27 L14 78 M80 22 L89 79" />{name === 'mirages' && <><circle cx="9" cy="20" r="5" /><circle cx="91" cy="20" r="5" /></>}</>;
      break;
    case 'clock-rift': case 'rewind': case 'accelerate': case 'clock-hand':
      drawing = <><circle cx="50" cy="50" r="33" /><path d="M50 24 V51 L70 60 M50 6 V15 M50 85 V94 M6 50 H15 M85 50 H94" />{name === 'clock-rift' && <path d="M66 7 L55 43 66 57 51 93" />}{name === 'rewind' && <path d="M30 23 L18 22 21 35" />}{name === 'accelerate' && <path d="M76 17 L89 17 86 31" />}</>;
      break;
    case 'dive-bolt': case 'storm': case 'speed':
      drawing = <><path d="M57 5 L30 50 H50 L39 94 78 39 H56Z" />{name === 'storm' && <><path d="M14 20 L6 42 23 39 14 72 M83 24 L70 52 88 49 78 83" /></>}{name === 'speed' && <path d="M10 31 H38 M5 53 H31 M12 75 H42" />}</>;
      break;
    case 'skull': case 'death-mark': case 'skeletons': case 'mass-summon': case 'necro-burst':
      drawing = <><path d="M25 60 Q12 44 23 27 Q50 7 78 27 Q88 47 75 60 L68 82 H32Z" /><circle cx="37" cy="48" r="7" /><circle cx="63" cy="48" r="7" /><path d="M50 55 L45 65 H55Z M37 76 V86 M50 76 V86 M63 76 V86" />{['skeletons','mass-summon'].includes(name) && <><path d="M6 47 L14 39 22 48 M78 48 L86 39 94 47" /><circle cx="12" cy="33" r="6" /><circle cx="88" cy="33" r="6" /></>}</>;
      break;
    case 'drain': case 'soul':
      drawing = <><path d="M13 74 Q40 22 73 42 Q51 30 44 53 Q62 49 84 20" /><path d="M82 20 L69 24 M82 20 L76 32" /><circle cx="19" cy="70" r="9" />{name === 'soul' && <path d="M18 50 Q5 37 21 24 Q34 12 44 28" />}</>;
      break;
    case 'triple-breath': case 'dark-breath': case 'blue-fire': case 'bombard': case 'hell-portal': case 'magma-eruption':
      drawing = <><path d="M13 49 Q41 8 82 26 Q62 36 89 45 Q67 48 85 74 Q39 94 13 49Z" /><path d="M19 50 Q45 31 73 37 M20 54 Q54 63 76 67" />{['triple-breath','bombard','magma-eruption'].includes(name) && <><circle cx="29" cy="18" r="6" /><circle cx="51" cy="10" r="5" /><circle cx="77" cy="14" r="6" /></>}{name === 'hell-portal' && <ellipse cx="49" cy="50" rx="43" ry="47" />}</>;
      break;
    case 'three-heads': case 'ancestral': case 'growth': case 'night-wings':
      drawing = <><path d="M50 29 Q19 3 6 31 Q26 38 32 66 L50 84 68 66 Q74 38 94 31 Q81 3 50 29Z" /><path d="M50 26 L40 10 50 15 60 10Z" />{name === 'three-heads' && <><circle cx="25" cy="38" r="5" /><circle cx="50" cy="27" r="5" /><circle cx="75" cy="38" r="5" /></>}</>;
      break;
    case 'element-shard': case 'cycle': case 'converge': case 'unstable':
      drawing = <><path d="M50 4 L81 49 50 95 19 49Z" /><path d="M50 4 V95 M19 49 H81" /><circle cx="50" cy="50" r="14" />{name === 'cycle' && <><circle cx="12" cy="25" r="5" /><circle cx="88" cy="25" r="5" /><circle cx="12" cy="75" r="5" /><circle cx="88" cy="75" r="5" /></>}{name === 'unstable' && <path d="M30 14 L37 43 24 72 M68 13 L61 43 80 73" />}</>;
      break;
    case 'judgment': case 'spear': case 'barrier': case 'adamant-armor': case 'ice-scales':
      drawing = <><path d="M50 4 L68 36 57 88 50 96 43 88 32 36Z" /><path d="M50 13 V82" />{['barrier','adamant-armor','ice-scales'].includes(name) && <path d="M12 24 Q50 3 88 24 V62 Q75 86 50 96 Q25 86 12 62Z" />}</>;
      break;
    case 'tentacle': case 'tentacles': case 'maelstrom': case 'sandstorm':
      drawing = <><path d="M9 84 Q13 17 46 48 Q67 74 83 19 M29 91 Q30 59 55 68 Q80 80 91 50" /><path d="M15 26 Q55 3 84 27" />{name === 'tentacles' && <path d="M55 94 Q46 22 24 18" />}{['maelstrom','sandstorm'].includes(name) && <ellipse cx="50" cy="54" rx="40" ry="31" />}</>;
      break;
    case 'imperial-roar': case 'wolf-howl':
      drawing = <><path d="M22 64 Q50 36 77 63 L53 90Z" /><path d="M18 35 Q45 20 76 34 M7 23 Q50 2 93 22 M10 77 Q50 94 90 77" />{name === 'wolf-howl' && <path d="M24 62 L14 19 40 45 M75 62 L88 20 60 45" />}</>;
      break;
    case 'phylactery': case 'volcanic-core': case 'overload':
      drawing = <><path d="M31 24 H69 L77 78 50 93 23 78Z" /><circle cx="50" cy="52" r="19" /><path d="M50 28 L56 48 46 60 53 77" />{name === 'phylactery' && <path d="M25 16 Q50 3 75 16" />}</>;
      break;
    case 'blizzard': case 'ice-prison':
      drawing = <><path d="M50 8 V92 M8 50 H92 M20 20 L80 80 M80 20 L20 80" /><path d="M40 19 L50 29 60 19 M40 81 L50 71 60 81 M19 40 L29 50 19 60 M81 40 L71 50 81 60" />{name === 'ice-prison' && <path d="M19 23 L50 7 81 23 V78 L50 93 19 78Z" />}</>;
      break;
    case 'fist': case 'quake-fist': case 'stone-fist': case 'seismic-step':
      drawing = <><path d="M28 45 L28 18 Q34 11 39 19 L43 34 V13 Q49 7 53 15 V34 L58 17 Q64 12 68 20 V42 L79 31 Q88 28 89 38 L72 81 33 86 17 55 Q18 44 28 45Z" /><path d="M8 91 L30 88 40 97 M64 90 L78 86 96 95" />{name === 'seismic-step' && <path d="M4 72 Q50 59 96 72" />}</>;
      break;
    case 'roots':
      drawing = <><path d="M50 8 V88 M50 50 Q22 43 10 14 M50 62 Q75 43 91 17 M50 80 Q17 70 9 87 M50 80 Q84 68 93 86" /></>;
      break;
    case 'petrify-gaze':
      drawing = <><path d="M6 49 Q50 6 94 49 Q50 92 6 49Z" /><circle cx="50" cy="49" r="18" /><circle cx="50" cy="49" r="7" /><path d="M72 70 L88 93 M80 67 L96 76" /></>;
      break;
    case 'broken-chain':
      drawing = <><ellipse cx="27" cy="43" rx="13" ry="22" transform="rotate(-38 27 43)" /><ellipse cx="75" cy="59" rx="13" ry="22" transform="rotate(-38 75 59)" /><path d="M36 64 L46 54 M55 48 L65 38" /></>;
      break;
    case 'inverted-wish':
      drawing = <><path d="M50 5 L60 36 93 37 67 56 76 88 50 69 23 88 33 56 7 37 40 36Z" /><path d="M33 26 Q50 80 67 26" /></>;
      break;
    default:
      drawing = <><circle cx="50" cy="50" r="29" /><path d="M50 8 V92 M8 50 H92" /></>;
  }
  return <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><g>{drawing}</g></svg>;
}

export function BossesMiddleEffect({ animationId, target }: EnemyEffectProps) {
  const animation = bossesMiddleAnimations.find(item => item.id === animationId);
  const motif = bossesMiddleMotifs.get(animationId);
  const visual = animation && bossesMiddleVisuals.get(animation.enemyKey);
  if (!animation || !motif || !visual) return null;
  return <div
    className={`bosses-middle-vfx bosses-middle-vfx--${animation.motion} bosses-middle-vfx--${motif}`}
    style={{ '--bosses-middle-color': animation.kind === 'attack' ? visual.color : elementColor[animation.element] } as CSSProperties}
    data-enemy-vfx="middle" data-enemy-animation={animationId} data-target={target}
    aria-hidden="true"
  >
    <span className="bosses-middle-vfx__charge" />
    <span className="bosses-middle-vfx__travel"><Motif name={motif} /></span>
    <span className="bosses-middle-vfx__impact"><Motif name={motif} /></span>
  </div>;
}
