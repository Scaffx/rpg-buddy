import type { ReactNode } from 'react';
import type { EnemySpriteProps } from './types';
import { bossesEarlyEnemies } from './bossesEarly.data';
import './bossesEarly.css';

function Figure({ index }: { index: number }): ReactNode {
  switch (index) {
    case 0: // Goblin: large pointed ears, dagger, short legs.
      return <><path fill="#578c3c" d="M7 9 3 7l3 7-2 4 3 8h15l4-7-3-6-5-3-4-6-2 6Z"/><path fill="#345d32" d="M7 23h7l-2 7H6Zm11 0h6l1 7h-6Z"/><path fill="#d0a666" d="m19 19 4-4 3 4-5 5Z"/><path fill="#c9d5d4" d="m23 22 6-9-2 10-6 3Z"/><circle fill="#f8cf73" cx="21" cy="13" r="1.5"/><path fill="none" stroke="#26392a" d="m22 18 3 1"/></>;
    case 1: // Wolf.
      return <><path fill="#69717b" d="m3 19 4-4 5 1 3-6 4 3 4-2 5 3 2 4-5 3-2 7h-3l-1-5-9 1-2 5H5l1-7Z"/><path fill="#878f96" d="m19 13 2-7 3 5 4 2 3 5-6 2-4-2Z"/><path fill="#e6e3d9" d="m25 18 6 1-5 3-5-3Z"/><circle fill="#efc66c" cx="25" cy="15" r="1"/><path fill="none" stroke="#364353" d="m5 17-3-5"/></>;
    case 2: // Orc.
      return <><path fill="#587c49" d="m10 6 11 1 6 7-2 9-14 1-6-8Z"/><path fill="#334737" d="M8 22h7l-2 8H7Zm10 0h7l1 8h-7Z"/><path fill="#a06d4b" d="M6 16 2 19l2 8 5-4Zm19 0 5 1 1 8-6-2Z"/><path fill="#e8d9b8" d="m19 16 3 5 1-5 3 4"/><path fill="#aeb3b1" d="m28 14 2-11-4 4-3 9Z"/><circle fill="#f7c35f" cx="21" cy="11" r="1"/></>;
    case 3: // Giant spider.
      return <><path fill="none" stroke="#332d3a" strokeWidth="2.1" d="M12 17 4 8 2 14m10 6-9 1-2 8m21-12 7-9 2 7m-9 6 8 1 1 8M13 15 8 4m13 11 6-11"/><ellipse fill="#43334c" cx="13" cy="20" rx="9" ry="7"/><ellipse fill="#674869" cx="23" cy="18" rx="5" ry="4"/><circle fill="#de7979" cx="25" cy="17" r="1"/><circle fill="#de7979" cx="28" cy="17" r="1"/><path fill="#e8e4db" d="m26 21-1 4 3-3 2 3v-5Z"/></>;
    case 4: // Young dragon.
      return <><path fill="#823b32" d="M4 17 1 6l11 7 6-5 4 7 6-2 3 7-6 4-1 6-4-3-7 2-2-6-7 4Z"/><path fill="#c46035" d="M11 14 8 2l12 11-5 7Z"/><path fill="#dc8a4d" d="m20 13 4-10 3 11 4 1-3 5-7-1Z"/><path fill="#ebd2a0" d="m27 20 4 1-5 3-4-2Z"/><circle fill="#f9d76c" cx="26" cy="15" r="1.2"/><path fill="none" stroke="#f6bb65" d="m4 23-3 5m11-4-2 6"/></>;
    case 5: // Skeleton champion.
      return <><path fill="#d9d3bd" d="M10 5h12l3 4-1 7-3 3v3H9v-4l-3-5 1-5Z"/><path fill="#b7b5aa" d="M10 20h14l-2 6h-3l-2-3-3 3h-3Z"/><path fill="none" stroke="#dad6c5" strokeWidth="2" d="M11 24 9 31m12-7 2 7M8 17l-5 8m22-8 5 8"/><path fill="#9aa5af" d="m27 9 3-6-1 20-4 3Z"/><path fill="#382b40" d="M11 12h4l-1 4h-3Zm8 0h4v4h-3Z"/><path fill="none" stroke="#807769" d="M13 20h7m-6 2h5"/></>;
    case 6: // Shadow witch.
      return <><path fill="#383050" d="m13 9 4-8 7 9 5 20H5l5-19Z"/><path fill="#695073" d="M11 8h12l4 4-5 2H7Z"/><path fill="#af8ca2" d="M13 14h10l-1 7-4 3-5-3Z"/><path fill="#211e39" d="M8 23 3 30h25l-6-9-4 3-5-4Z"/><path fill="none" stroke="#b78ddd" strokeWidth="1.5" d="M26 19q5 0 4-7m-3 9 4 2"/><circle fill="#eac2fa" cx="21" cy="17" r="1.2"/></>;
    case 7: // Centaur with four hooves and spear.
      return <><path fill="#946b50" d="M3 17h19l2 7H5Z"/><path fill="#b98c64" d="m14 9 7-2 4 7-2 9-9-3Z"/><path fill="#6e523f" d="M5 23h4l-1 8H5Zm11 0h4l-1 8h-4Zm-9-8-5-5 1 11Z"/><path fill="#c9aa86" d="m19 7 4-3 4 4-2 7-5 1Z"/><path fill="none" stroke="#d3d8d1" strokeWidth="1.5" d="m23 25 7-22M27 7l3-5 1 7"/><circle fill="#342e31" cx="24" cy="10" r="1"/></>;
    case 8: // Rock golem.
      return <><path fill="#77796e" d="m7 7 7-5 9 3 4 10-3 11-14 2-7-9Z"/><path fill="#a29e87" d="m3 10 5-3 3 9-6 8-4-4Zm21-2 6 2 1 13-6 1-4-8Z"/><path fill="#60695c" d="M9 26h6l-2 5H6Zm10-1h7l2 6h-8Z"/><path fill="none" stroke="#c8ad7b" d="m14 4 3 9-6 6m13-9-8 5 2 11"/><path fill="#e0d587" d="M18 13h3l-1 3h-2Z"/></>;
    case 9: // Phoenix.
      return <><path fill="#e76631" d="M14 20 1 7l4 16 9 6 7-4 8-18-10 8-3-12Z"/><path fill="#ffb249" d="M16 21 6 17l8 11 7-3 6-13-10 5Z"/><path fill="#f6d46a" d="m17 12 3-7 5 9 5 4-7 2-5-2Z"/><path fill="#f8e4a4" d="m25 15 7 3-8 2Z"/><circle fill="#6c3940" cx="23" cy="13" r="1"/><path fill="none" stroke="#ef7e36" d="m13 27-5 5m10-5 3 5"/></>;
    case 10: // Fire salamander.
      return <><path fill="#8b3a32" d="M4 19q10-12 20-5l5 5-5 5-15 2-7 5 3-10Z"/><path fill="#d36735" d="m9 19 3-12 5 9 3-13 6 13-3 6Z"/><path fill="none" stroke="#6b3834" strokeWidth="2" d="m10 23-5 7m12-6-2 7m8-7 5 6"/><path fill="#e5b85d" d="m24 17 7 2-6 4Z"/><circle fill="#f2d482" cx="25" cy="16" r="1"/></>;
    case 11: // Ice mermaid.
      return <><path fill="#79b8c7" d="m14 18 8 2 2 7-8 2-5-4-8 4 3-8 8-3Z"/><path fill="#cee9e9" d="m16 6 6 2 2 7-3 6-7-2-2-7Z"/><path fill="#a9d8e4" d="m13 9 4-8 7 5-3 6-6 1Z"/><path fill="#a7d3da" d="M5 21 1 13l9 6Z"/><circle fill="#44687c" cx="21" cy="12" r="1"/><path fill="none" stroke="#e6f9fa" d="m23 8 7-5m-6 11 7 1"/></>;
    case 12: // Minotaur.
      return <><path fill="#79543e" d="m9 10 10-3 7 5-1 13-15 1-5-9Z"/><path fill="#a5744d" d="m11 5 4 8 8-2 6 8-4 6-10-3-5-10Z"/><path fill="#e7d7ab" d="M13 9 4 2l3 10 7 4Zm12 6 5-11 1 12-4 4Z"/><path fill="#473929" d="M9 25h6l-2 6H7Zm10-1h6l2 7h-7Z"/><circle fill="#e3b95d" cx="24" cy="16" r="1"/><path fill="#483a32" d="m25 22 6 2-7 2Z"/></>;
    case 13: // Winged sphinx.
      return <><path fill="#c5a263" d="M5 16 1 5l13 6 8-3 6 7-3 11H8Z"/><path fill="#e5c77c" d="m13 17-7-14 15 11-3 8Z"/><path fill="#a88359" d="M7 25h5l-2 6H6Zm14 0h5l2 6h-6Z"/><path fill="#e6d29a" d="m21 7 6-2 4 7-3 8-8-1Z"/><path fill="#745d47" d="m21 6 2-5 5 4 4 1-3 4Z"/><circle fill="#35505e" cx="27" cy="13" r="1"/></>;
    case 14: // Forest titan.
      return <><path fill="#675e3a" d="m9 5 12-3 7 9-3 16H8L4 17Z"/><path fill="#779343" d="M4 10q-4-7 6-8l5 7 4-8q8 0 9 8l-8 5Z"/><path fill="#8b774a" d="m8 25 6 1-2 6H6Zm11 0 7-2 2 9h-8Z"/><path fill="none" stroke="#a8bf6c" d="m14 7 3 9-5 10m8-14 3 14"/><path fill="#d2c777" d="M23 12h3v3h-3Z"/><path fill="none" stroke="#4f4b2f" d="m5 16-4 7m26-8 4 9"/></>;
    case 15: // Immortal knight.
      return <><path fill="#acb4b5" d="m9 8 12-3 5 7-2 14H8L6 13Z"/><path fill="#d9d3b8" d="m11 5 4-4 8 4 1 9-4 4-9-4Z"/><path fill="#5a6876" d="M8 25h7l-2 7H6Zm11 0h7l1 7h-7Z"/><path fill="#d5b662" d="M16 1v10m-5-5h10"/><path fill="#e1d19b" d="m28 8 3-5-1 27h-3Z"/><path fill="#6f7780" d="M14 12h9v3h-9Z"/><path fill="#d3b762" d="m3 16 6-3 1 12-6 2Z"/></>;
    case 16: // Shadow wraith.
      return <><path fill="#3d304d" d="M14 3 24 7l6 11-4 6 3 7-8-4-6 4-5-5-7 3 2-12Z"/><path fill="#5c4673" d="M13 8 20 4l6 10-4 7-11-1Z"/><path fill="#271f3a" d="M8 22q6 8 13 0l4 7-6-3-5 5-5-6-6 4Z"/><path fill="#bd8fe2" d="M18 14h3l-1 3h-2Zm6 0h3l-1 3h-2Z"/><path fill="none" stroke="#806294" d="m9 20-8 6m24-5 6 7"/></>;
    case 17: // Manticore: lion, wings, venom stinger.
      return <><path fill="#ad754b" d="M6 15 21 12l7 7-4 7-17 1Z"/><path fill="#80563e" d="m4 15-3-8 8 6 1 11Z"/><path fill="#9c6b65" d="M12 15 8 2l13 11-2 8Z"/><path fill="#5b6d4a" d="m4 16-2 11 4-5-2-8m19 5 7-8 2 2-8 11"/><path fill="#634934" d="M8 25h5l-2 7H7Zm12 0h5l1 7h-5Z"/><path fill="#eee1bf" d="m25 19 7 2-6 3Z"/><circle fill="#e9ce79" cx="25" cy="16" r="1"/></>;
    case 18: // Daemon lord: horns and trident.
      return <><path fill="#773d46" d="m8 7 14-2 6 10-4 12H9L4 17Z"/><path fill="#aa5045" d="M11 9 7 1l-4 2 5 11Zm12-1 6-7 3 3-6 11Z"/><path fill="#512b3f" d="M8 25h7l-2 7H6Zm12 0h6l1 7h-6Z"/><path fill="#38273b" d="m5 14-4 11 10-5Zm22 0 5 11-10-5Z"/><path fill="none" stroke="#d8ad70" strokeWidth="1.5" d="m28 28 2-23m-3 5 3 2 2-2M25 5l2 5"/><circle fill="#ffbc76" cx="23" cy="14" r="1.2"/></>;
    case 19: // Ancient leviathan: long aquatic serpent.
      return <><path fill="#386b77" d="M1 24q3-11 12-10l7-8 7 3 5 8-6 6-10-3q-7 1-8 10l-6-2Z"/><path fill="#67a9b1" d="m11 16-3-9 9 6 4-11 4 7-4 8Z"/><path fill="#89c0ba" d="M20 18q5 5 12 0l-4 8-8-1Z"/><path fill="#d7e7d7" d="m25 20 2 4 2-4 2 2-4 5Z"/><circle fill="#ecda8e" cx="26" cy="14" r="1.2"/><path fill="none" stroke="#8bc4cb" d="M3 23q8 4 14-3m-14 8q6-5 12-1"/></>;
    default: return null;
  }
}

export function BossesEarlySprite({ enemyKey, className }: EnemySpriteProps) {
  const index = bossesEarlyEnemies.findIndex((enemy) => enemy.key === enemyKey);
  if (index < 0) return null;
  return <svg className={['bossesEarly-sprite', className].filter(Boolean).join(' ')} data-enemy-key={enemyKey} viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <g className="bossesEarly-sprite__body" stroke="#242832" strokeWidth=".7" strokeLinejoin="round"><Figure index={index}/></g>
  </svg>;
}
