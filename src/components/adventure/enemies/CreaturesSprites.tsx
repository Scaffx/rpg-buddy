import type { ReactNode } from 'react';
import type { EnemySpriteProps } from './types';
import './creatures.css';

// Each silhouette is drawn on the same 32 px grid as AdventureHeroSprite.
const SPRITES: Record<string, ReactNode> = {
  'creature:0:0': <>
    <path d="M3 19 L1 13 L5 15 L9 20 L20 17 L25 12 L30 15 L31 20 L25 22 L23 27 L19 27 L18 23 L12 23 L10 28 L6 28 L7 22 Z" fill="#5c6874" />
    <path d="M5 19 L10 17 L19 18 L24 13 L27 14 L28 17 L23 19 L17 20 L10 21 Z" fill="#97aab2" />
    <path d="M21 12 L22 5 L25 9 L28 6 L28 14 Z" fill="#394b59" />
    <path d="M24 17 L30 17 L29 20 L25 21 Z" fill="#dae0d4" /><rect x="25" y="14" width="2" height="2" fill="#f4e48e" />
    <path d="M27 21 L28 23 L29 20" fill="#fff4dc" />
  </>,
  'creature:0:1': <>
    <path d="M2 15 L6 12 L19 12 L25 15 L27 21 L23 25 L7 24 L3 21 Z" fill="#754c3d" />
    <path d="M4 14 L9 10 L22 12 L25 17 L21 21 L5 21 Z" fill="#aa7450" />
    <path d="M8 10 L7 6 L12 10 M18 10 L21 5 L22 13" fill="#4b3636" />
    <path d="M22 15 L29 15 L31 19 L27 22 L22 20 Z" fill="#b88a69" /><rect x="26" y="17" width="3" height="2" fill="#45333b" />
    <path d="M25 20 L25 25 L28 25 L29 21" fill="#fff0ca" /><rect x="21" y="14" width="2" height="2" fill="#f3d877" />
    <rect x="7" y="23" width="4" height="5" fill="#523c37" /><rect x="18" y="23" width="4" height="5" fill="#523c37" />
  </>,
  'creature:0:2': <>
    <path d="M16 29 Q4 26 7 14 Q4 7 13 3 Q17 1 21 7 Q29 10 25 17 Q29 23 16 29Z" fill="#397c62" />
    <path d="M11 25 Q7 20 10 13 Q13 7 17 6 Q25 11 22 20 Q20 26 11 25Z" fill="#83bc79" />
    <path d="M14 9 L14 3 L19 6 L20 11 M10 13 L4 10 L6 18 L10 20 M23 13 L29 9 L27 18 L23 20" fill="#b6d66f" />
    <rect x="14" y="14" width="2" height="2" fill="#203f43" /><rect x="21" y="14" width="2" height="2" fill="#203f43" />
    <path d="M17 20 Q19 22 21 19" stroke="#2e5b4d" strokeWidth="1.5" fill="none" />
    <path d="M11 27 L7 30 M22 26 L25 30" stroke="#8a6b4b" strokeWidth="2" />
  </>,
  'creature:1:0': <>
    <path d="M2 16 L8 10 L20 11 L26 16 L21 23 L9 22 Z" fill="#318fa9" />
    <path d="M3 16 L1 9 L9 14 L9 20 L1 25 Z" fill="#226b91" />
    <path d="M10 11 L14 5 L18 12 M13 21 L17 27 L21 21" fill="#7bd4cf" />
    <path d="M18 12 L25 12 L31 17 L25 21 L18 21 Z" fill="#79c6c6" /><rect x="25" y="15" width="2" height="2" fill="#173d58" />
    <path d="M26 20 L30 19 L29 21" fill="#e2f7e7" /><path d="M10 17 L16 15 L19 17" stroke="#c7eee0" fill="none" />
  </>,
  'creature:1:1': <>
    <path d="M10 16 L2 5 L14 8 L19 17 L15 21 Z" fill="#7597ad" />
    <path d="M14 14 L20 7 L29 4 L25 14 L20 19 Z" fill="#afc6c1" />
    <path d="M14 15 L21 13 L25 17 L20 22 L14 21 Z" fill="#eff0d7" />
    <path d="M22 17 L31 18 L24 21 Z" fill="#dbad67" /><rect x="21" y="15" width="2" height="2" fill="#233d50" />
    <path d="M8 12 L4 10 L10 19 M23 12 L27 8 L22 18" stroke="#d6e3dc" strokeWidth="2" fill="none" />
    <path d="M15 22 L13 27 L17 26 M19 22 L20 27 L23 26" stroke="#cc9e69" strokeWidth="1.5" fill="none" />
  </>,
  'creature:1:2': <>
    <path d="M3 24 Q1 16 8 17 Q14 17 12 24 Q16 29 23 23 Q27 20 23 15 L19 12 L22 7 L27 9 L29 15 Q32 26 22 29 Q9 32 7 24Z" fill="#267d86" />
    <path d="M6 21 Q11 18 11 23 Q16 29 23 25 Q29 21 25 14" stroke="#8ce3c5" strokeWidth="3" fill="none" />
    <path d="M22 8 L20 4 L25 6 L28 8 L30 14 L25 15 L21 13 Z" fill="#53b8a3" /><rect x="26" y="10" width="2" height="2" fill="#e7efb8" />
    <path d="M28 14 L31 16 L27 17" fill="#d7f2d8" /><path d="M3 20 L1 17 L2 25" fill="#a2ded2" />
  </>,
  'creature:2:0': <>
    <path d="M10 8 L13 5 L22 5 L26 9 L25 17 L20 20 L12 18 L9 14 Z" fill="#ddd7b9" />
    <path d="M12 16 L22 16 L21 22 L12 21 Z" fill="#b6ad9d" /><rect x="12" y="11" width="4" height="3" fill="#3b374b" /><rect x="20" y="11" width="4" height="3" fill="#3b374b" />
    <rect x="17" y="15" width="2" height="2" fill="#625b60" /><path d="M13 20 L13 23 L21 23 L21 20 M16 20 L16 23 M19 20 L19 23" stroke="#e9e4ce" fill="none" />
    <path d="M15 24 L13 29 M19 24 L21 29 M11 24 L7 28 M22 24 L25 28" stroke="#d7cfb6" strokeWidth="3" />
    <path d="M4 18 L3 14 L6 13 L7 16 L10 17 L9 20 L7 20 L6 22 L3 21Z" fill="#eee5cc" />
  </>,
  'creature:2:1': <>
    <path d="M15 14 L11 8 L6 10 L2 8 L3 20 L7 18 L11 22 L16 19Z" fill="#6a5979" />
    <path d="M19 14 L23 8 L27 10 L30 8 L29 20 L25 18 L21 22 L17 19Z" fill="#6a5979" />
    <path d="M13 12 L20 12 L24 18 L20 24 L14 24 L10 18Z" fill="#947b9c" />
    <path d="M14 22 L16 28 L18 23 L20 28 L21 22" fill="#5b4b70" />
    <rect x="14" y="16" width="2" height="2" fill="#f5d5a2" /><rect x="20" y="16" width="2" height="2" fill="#f5d5a2" />
    <path d="M16 21 L17 24 L18 21" fill="#eee1cc" /><path d="M5 14 L9 16 M25 16 L29 14" stroke="#aa95ab" fill="none" />
  </>,
  'creature:2:2': <>
    <path d="M7 8 L11 4 L22 5 L26 10 L27 24 L23 28 L8 27 L5 23Z" fill="#655f65" />
    <path d="M9 9 L13 6 L21 8 L24 13 L23 23 L19 26 L10 24 L8 21Z" fill="#a49a8b" />
    <path d="M10 12 L15 14 L14 18 L10 17 M19 14 L24 12 L23 17 L19 18" fill="#3b3d51" />
    <rect x="11" y="14" width="2" height="2" fill="#bce5d9" /><rect x="21" y="14" width="2" height="2" fill="#bce5d9" />
    <path d="M15 19 L19 19 L20 24 L14 23 Z" fill="#716e71" /><path d="M8 26 L6 30 L12 29 M22 27 L25 30 L28 29" stroke="#4d4852" strokeWidth="3" fill="none" />
    <path d="M3 17 L6 16 L7 24 L3 25 M27 17 L30 16 L31 25 L27 24" fill="#8f857e" />
  </>,
  'creature:3:0': <>
    <path d="M8 27 Q1 21 8 12 L7 4 L13 10 L18 2 L21 10 L26 6 L25 15 Q32 24 23 28Z" fill="#a83e37" />
    <path d="M10 25 Q5 20 13 14 L13 9 L17 13 L20 7 L22 14 Q28 21 22 25Z" fill="#f18b3c" />
    <path d="M14 25 Q11 21 16 17 L18 13 L20 18 Q24 23 21 25Z" fill="#ffd16a" />
    <rect x="16" y="17" width="2" height="2" fill="#51303b" /><rect x="21" y="17" width="2" height="2" fill="#51303b" />
    <path d="M9 23 L5 27 L10 28 M24 23 L29 27 L24 28" fill="#bc4c37" />
  </>,
  'creature:3:1': <>
    <path d="M13 18 L3 4 L7 16 L2 12 L8 23 L15 22Z" fill="#9e3540" />
    <path d="M20 17 L27 4 L26 15 L31 11 L28 23 L20 23Z" fill="#c84e3a" />
    <path d="M11 17 L16 13 L22 16 L24 21 L19 25 L12 22Z" fill="#e47a39" />
    <path d="M5 7 L12 18 L8 18 M28 8 L22 18 L26 18" stroke="#ffd17a" strokeWidth="2" fill="none" />
    <path d="M19 17 L30 18 L23 21Z" fill="#f5be65" /><rect x="20" y="16" width="2" height="2" fill="#472e41" />
    <path d="M14 23 L11 28 L17 26 M20 24 L22 28 L25 27" fill="#bf463a" />
  </>,
  'creature:3:2': <>
    <path d="M7 9 L12 5 L22 5 L27 11 L29 24 L25 29 L7 29 L3 24Z" fill="#503c42" />
    <path d="M9 10 L14 7 L22 9 L25 15 L23 25 L9 26 L6 21Z" fill="#896251" />
    <path d="M12 11 L16 15 L14 23 M22 11 L19 17 L23 24 M9 20 L13 19" stroke="#f2733b" strokeWidth="2" fill="none" />
    <path d="M11 14 L15 15 L14 18 L10 17 M19 15 L24 14 L24 17 L20 18" fill="#ffcf73" />
    <path d="M3 19 L7 18 L8 26 L3 27 M26 18 L30 17 L31 27 L26 26" fill="#5d4544" />
    <path d="M8 28 L6 31 L12 30 M22 28 L26 31 L29 30" stroke="#3a343d" strokeWidth="3" />
  </>,
};

export function CreaturesSprite({ enemyKey, className }: EnemySpriteProps) {
  const body = SPRITES[enemyKey];
  if (!body) return null;
  return <svg className={className} viewBox="0 0 32 32" shapeRendering="crispEdges" aria-hidden="true" data-enemy-key={enemyKey}>
    <g className="adventure-enemy-body">{body}</g>
  </svg>;
}
