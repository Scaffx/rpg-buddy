import type { ReactNode } from 'react';
import type { EnemySpriteProps } from './types';
import './creatures.css';

function Eye({ x, y, size = 3 }: { x: number; y: number; size?: number }) {
  return <g stroke="none"><ellipse cx={x} cy={y} rx={size} ry={size + .7} fill="#293244"/><circle cx={x + .8} cy={y - 1} r="1" fill="#fff9e7"/></g>;
}

/** Original artwork on a 64-unit grid, scaled by the sprite's static wrapper. */
const CREATURE_ARTWORK: Record<string, ReactNode> = {
  'creature:0:0': <>
    <path fill="#758d9e" d="M16 38Q4 37 5 22L12 26 9 19Q23 25 23 39Z"/>
    <path fill="#647c91" d="M16 43 14 55Q10 62 19 60L25 48M38 45 39 57Q39 61 46 59L47 44"/>
    <ellipse cx="30" cy="41" rx="21" ry="12" fill="#9db4be"/>
    <path fill="#dce5de" stroke="none" d="M13 42Q27 50 48 39L45 48Q24 57 13 45Z"/>
    <path fill="#b7cbd0" d="M29 43 30 31 35 24 42 25 50 33 47 49 40 46 36 50Z"/>
    <path fill="#8da8b8" d="M35 27 34 8Q42 9 46 22L52 12Q60 16 56 34L50 43 39 42Z"/>
    <path fill="#dfb7b4" stroke="none" d="M38 15 39 26 44 24ZM53 20 50 28 55 29Z"/>
    <path fill="#dce7e2" d="M47 34Q60 30 61 38Q60 45 47 45L42 40Z"/>
    <path fill="#293244" d="M56 34Q63 32 61 39L58 41 55 38Z"/>
    <Eye x={48} y={29}/><path d="m44 23 7 1M48 42l7 1" fill="none"/>
    <path fill="#b4c7cc" d="M21 47 22 55Q17 63 27 60L29 47M43 47 46 56Q43 62 52 59L52 43"/>
    <path d="M21 58h5m19-1h6" stroke="#718b9a"/>
  </>,
  'creature:0:1': <>
    <path d="M12 37Q1 37 5 28Q11 25 10 32Q9 35 5 32" fill="none" stroke="#79594d" strokeWidth="3"/>
    <path fill="#5a4846" d="M13 45v12q4 4 8 0l2-11M36 45l1 12q4 4 8 0l1-13"/>
    <path fill="#987456" d="M10 41Q7 20 27 20Q45 17 52 33L49 49Q24 57 12 48Z"/>
    <path fill="#644e48" d="m15 26 2-10 7 5 4-10 7 8 7-6 2 13Z"/>
    <path fill="#ba916b" stroke="none" d="M16 33Q26 24 41 31L43 39Q29 34 16 41Z"/>
    <path fill="#a98261" d="M36 29Q35 14 43 14L48 25Q59 25 58 40L53 49 38 47Z"/>
    <path fill="#e2b698" stroke="none" d="m40 19 2 9 4-3Z"/>
    <ellipse fill="#d1a185" cx="53" cy="40" rx="9" ry="8"/>
    <ellipse fill="#866154" stroke="none" cx="52" cy="40" rx="6" ry="5"/>
    <path d="M49 39v2m6-2v2" strokeWidth="2"/>
    <path fill="#fff0cb" d="M43 41Q35 46 39 33Q32 44 40 48Z"/>
    <Eye x={44} y={31} size={2.4}/><path d="m40 26 7 1" fill="none"/>
    <path fill="#86634f" d="m18 48 1 10q5 5 8 0l1-10M40 49l2 9q6 4 7-2l-1-10"/>
    <path d="M20 58h5m18-1h4" stroke="#4c4140"/>
  </>,
  'creature:0:2': <>
    <path fill="#567e55" d="M25 48 13 58 26 55 30 60 35 54 47 58 39 46Z"/>
    <path fill="#568b67" d="M23 33Q10 26 6 36Q14 46 23 43M42 32Q55 25 58 34Q52 44 44 42"/>
    <path fill="#96c883" d="M15 30Q10 20 16 14Q15 5 27 10Q37 2 45 12Q56 13 53 25Q61 35 48 39L20 39Z"/>
    <path fill="#6b9e6e" d="M20 31Q10 49 29 55Q48 57 48 34L34 26Z"/>
    <path fill="#a9d18c" stroke="none" d="M26 37Q20 46 31 50Q40 52 43 39Z"/>
    <path fill="#efd1a0" d="M18 23Q17 15 29 16Q44 13 49 24L47 35Q39 44 25 38L19 32Z"/>
    <path fill="#d8ac79" stroke="none" d="M20 29Q33 36 48 27L47 35Q34 44 24 36Z"/>
    <Eye x={29} y={27} size={2.3}/><Eye x={41} y={27} size={2.3}/>
    <path d="M32 34q4 3 7-1" fill="none"/><path d="M23 31h3m16 0h3" stroke="#d98979" strokeWidth="2"/>
    <path fill="#c0db8c" d="M31 16Q24 4 17 6Q16 15 31 16ZM33 14Q34 2 45 3Q47 13 33 14Z"/>
    <path fill="none" stroke="#659265" d="m34 13 6-5m-12 6-6-4"/>
    <circle fill="#f9e5a1" stroke="#afad67" cx="34" cy="43" r="3"/>
  </>,
  'creature:1:0': <>
    <path fill="#4398b6" d="M17 28Q6 16 3 23L7 34 3 46Q10 50 20 38Z"/>
    <path fill="#a2e0d8" d="M29 24Q28 12 40 8L45 26M31 43Q39 57 46 47L46 39"/>
    <path fill="#64bdc9" d="M13 34Q22 16 41 22Q56 23 60 34Q57 50 38 49Q22 48 13 34Z"/>
    <path fill="#bee6d5" stroke="none" d="M17 36Q38 40 58 34Q53 52 34 46Q23 45 17 36Z"/>
    <path fill="none" stroke="#8dd5d6" strokeWidth="3" d="m23 28 4 8m4-11 3 10"/>
    <path fill="#3f94ae" d="M36 35Q25 34 27 44Q36 45 40 36Z"/>
    <Eye x={48} y={29} size={3.8}/><path d="M52 39q4 3 7-2" fill="none"/>
    <circle fill="#efb5a3" stroke="none" cx="52" cy="36" r="2"/>
    <path d="m7 25 6 8-6 9" stroke="#84c8cf" fill="none"/>
  </>,
  'creature:1:1': <>
    <path fill="#6d96b3" d="M27 31Q14 32 3 17Q3 8 13 18L9 9Q16 7 27 26Z"/>
    <path fill="#bfd8db" d="M32 29Q39 12 58 6Q63 7 56 14L62 13Q63 18 56 23L60 23Q59 29 38 38Z"/>
    <path fill="none" stroke="#8eafbf" strokeWidth="2" d="m38 28 12-13m-8 18 15-11M14 20l9 9"/>
    <path fill="#7097ae" d="M26 39 12 43 20 48 28 45Z"/>
    <path fill="#f0edda" d="M24 29Q27 18 39 20Q48 21 47 32Q47 43 34 45Q21 46 24 29Z"/>
    <path fill="#c2d6d5" stroke="none" d="M25 35Q35 42 47 31Q45 45 32 44Z"/>
    <path fill="#f3c47b" d="M45 27Q51 26 59 32L46 35Z"/>
    <Eye x={41} y={26} size={2.5}/><path d="m39 21 5 1" stroke="#a7b9bc"/>
    <path d="m30 43-1 9-5 2m12-11 3 8 5 1" fill="none" stroke="#b88860" strokeWidth="2"/>
  </>,
  'creature:1:2': <>
    <path fill="#338c9a" d="M8 43Q3 34 11 33Q21 33 16 43Q14 50 27 51Q44 51 41 39L33 29 36 16 47 15Q58 24 52 35Q63 53 43 59Q14 67 8 49L4 53Z"/>
    <path fill="none" stroke="#b6e5ce" strokeWidth="7" d="M13 43Q9 54 27 55Q53 58 47 39L40 28"/>
    <path fill="none" stroke="#609c9f" d="m16 51-2 5m9-4-1 6m9-6v6m8-8 3 6m0-12 6 1"/>
    <path fill="#a1d5c9" d="M37 22 25 17 31 29 26 32 39 35ZM46 16 49 6 53 17 59 17 54 28Z"/>
    <path fill="#73c8bc" d="M34 16Q38 8 48 13L53 22Q63 23 60 30Q56 37 43 33L35 27Z"/>
    <path fill="#d6edcf" d="M43 28Q54 32 61 26L59 33Q50 38 42 32Z"/>
    <Eye x={48} y={22} size={2.8}/><path d="m44 17 6 1M53 34l4 4" fill="none"/>
    <circle fill="#b7e4d0" stroke="none" cx="37" cy="37" r="2"/>
  </>,
  'creature:2:0': <>
    <path d="M24 36 15 42 10 34m32 2 10 7 5-8M26 48l-6 12m16-12 6 12" stroke="#9b9285" strokeWidth="5" fill="none"/>
    <path d="M24 36 15 42 10 34m32 2 10 7 5-8M26 48l-6 12m16-12 6 12" stroke="#e8dbc2" strokeWidth="2.8" fill="none"/>
    <path fill="#bcae94" d="M24 35Q32 31 41 35L39 49 25 49Z"/>
    <path fill="#f1e3c6" d="M30 33h5v16h-5Z"/>
    <path d="M24 38h16m-16 5h16m-14 5h12" stroke="#e8dabb" strokeWidth="2"/>
    <path fill="#f0e3ca" d="M16 17Q15 4 31 4Q49 2 50 18Q53 29 43 32L42 37H26L25 32Q16 29 16 17Z"/>
    <path fill="#d6c6a8" stroke="none" d="M17 21Q33 32 51 21L47 30 42 32 41 36H27L26 31 19 28Z"/>
    <ellipse cx="26" cy="22" rx="5" ry="6" fill="#424252"/><ellipse cx="41" cy="22" rx="5" ry="6" fill="#424252"/>
    <circle cx="27" cy="20" r="1.5" fill="#b9d9ce" stroke="none"/><circle cx="42" cy="20" r="1.5" fill="#b9d9ce" stroke="none"/>
    <path fill="#86796b" stroke="none" d="m33 25-3 5h6Z"/><path d="M29 32v4m5-4v4m5-4v4M24 8l4 6-4 4" fill="none" stroke="#b7a68f"/>
    <path d="M17 60h6m16 0h6" stroke="#efdfbf" strokeWidth="3"/>
  </>,
  'creature:2:1': <>
    <path fill="#68537b" d="M27 28Q16 11 3 17L7 43Q11 32 18 39Q23 38 25 45L32 40 41 46Q43 36 50 39Q54 31 59 41L61 16Q47 11 37 28Z"/>
    <path fill="#ac8baf" stroke="none" d="M9 22Q18 22 26 34L23 38Q17 30 10 34ZM57 22Q45 23 38 35L42 39Q48 29 56 34Z"/>
    <path fill="none" stroke="#433d5b" d="M7 19q12 3 20 17M59 19Q45 23 38 37"/>
    <path fill="#8c739a" d="M23 27 21 7Q31 9 33 21Q39 9 46 9L44 31 46 42Q46 54 34 55Q21 55 20 43Z"/>
    <path fill="#d6aab5" stroke="none" d="m25 14 2 15 5-3Zm16 2-5 11 5 3Z"/>
    <ellipse cx="34" cy="40" rx="14" ry="12" fill="#a88daf"/>
    <path fill="#c7a4bd" stroke="none" d="M24 41Q34 48 45 40Q42 53 34 52Q25 52 24 41Z"/>
    <Eye x={28} y={37} size={2.7}/><Eye x={40} y={37} size={2.7}/>
    <path fill="#6c486c" d="m32 41 3-1 2 2-3 2Z"/>
    <path fill="#fff0d4" d="m29 45 2 5 2-4m3 0 2 4 2-5"/>
    <path d="m29 54 1 5m7-5-1 5" stroke="#4d405e" strokeWidth="2"/>
  </>,
  'creature:2:2': <>
    <path fill="#707b83" d="M15 41 10 56 24 59 28 43M37 42l2 17 14-1-6-18"/>
    <path fill="#a6b0ae" d="M17 29 43 28 49 47 37 53 21 49Z"/>
    <path fill="#718a8a" d="m23 32 14-1 2 15-14-2Z"/>
    <path d="m28 35 6 4-5 5m3-6v8" stroke="#c3e8cd" fill="none" strokeWidth="2"/>
    <path fill="#c0c6b8" d="M15 16 22 6 43 7 48 17 43 32 20 31Z"/>
    <path fill="#8f9e9e" stroke="none" d="M16 22 47 17 44 31 21 31Z"/>
    <path fill="#3e5962" d="M21 18 30 20 28 24 22 23M36 20l9-3-1 6-8 2"/>
    <path d="M24 21h3m12 0h3" stroke="#c3edce" strokeWidth="2"/>
    <path fill="#e3cf8d" d="m32 8 4 5-4 6-4-6Z"/>
    <path d="m21 10 5 4m14-3-4 4M29 29h9" stroke="#657c7e" fill="none"/>
    <path fill="#859392" d="M12 28q-9 2-7 11l6 9 9-6-1-10Z"/>
    <path fill="#a2b1a7" d="m46 28 12 3 2 18-10 5-8-9Z"/>
    <path fill="#667f80" d="m49 33 6 2 1 12-6 2-5-5Z"/><path d="m49 39 5 3-4 3" fill="none" stroke="#bddbc4"/>
    <path d="M12 56h10m20 0h9" stroke="#b8c0b2" strokeWidth="2"/>
    <path fill="#85a270" stroke="none" d="m18 12 5-6 8 1-4 4ZM43 32l5 4-2 5-6-2Z"/>
  </>,
  'creature:3:0': <>
    <path fill="#c85a42" d="M15 43Q4 41 8 32L17 34M45 34q11-8 13 1l-8 10"/>
    <path fill="#ed8747" d="M16 52Q3 42 18 25L17 13 27 21Q30 14 30 5Q45 13 45 25L52 18Q49 29 54 36Q61 53 42 57L34 61 27 56 19 59Z"/>
    <path fill="#ffbd63" stroke="none" d="M20 51Q9 42 27 29Q26 40 35 26Q40 18 37 14Q47 25 43 35Q55 42 46 51Q31 59 20 51Z"/>
    <path fill="#ffe3a0" stroke="none" d="M27 52Q21 46 31 39L35 30Q45 41 42 49Q38 57 27 52Z"/>
    <Eye x={28} y={36} size={2.6}/><Eye x={42} y={36} size={2.6}/>
    <path d="M32 44q4 4 8-1" fill="none" stroke="#994936"/>
    <circle fill="#ef8558" stroke="none" cx="23" cy="41" r="2"/><circle fill="#ef8558" stroke="none" cx="47" cy="41" r="2"/>
    <path fill="#ffe3a0" stroke="none" d="M22 21q-4-8 0-12 5 7 0 12M49 13q-1-5 3-8 3 6-3 8"/>
  </>,
  'creature:3:1': <>
    <path fill="#8d4657" d="M27 32Q11 27 4 10L4 30 9 27 10 39 17 35 24 45ZM38 31Q49 15 58 9L55 31 51 28 49 41 43 37 39 45Z"/>
    <path fill="#ec9360" stroke="none" d="M9 18Q17 28 27 35L23 38 17 30 13 32ZM53 18Q48 21 38 34L41 37 47 28 49 31Z"/>
    <path d="m8 16 16 20m30-20L41 35" fill="none" stroke="#f6bd77"/>
    <path fill="#b9584f" d="M30 43Q30 54 19 60L31 56 35 60 40 49Z"/>
    <ellipse cx="34" cy="39" rx="11" ry="14" fill="#d87854"/>
    <path fill="#f1b477" stroke="none" d="M29 37Q36 34 42 40L40 49Q31 56 29 46Z"/>
    <path fill="#e99c63" d="M29 31 28 16 35 22Q45 18 49 28L47 37 39 39 30 35Z"/>
    <path fill="#ffda8d" d="M46 28 60 32 47 36Z"/>
    <Eye x={41} y={28} size={2.8}/><path d="m37 23 7 1" fill="none"/>
    <path fill="#ffc97f" d="m31 21-2-12 6 8 4-5 1 9Z"/>
    <path d="m30 51-3 4 6 1m5-5 2 5h5" fill="none" stroke="#744051" strokeWidth="2"/>
  </>,
  'creature:3:2': <>
    <path fill="#423d4b" d="m17 43-4 15 14 3 4-14M37 44l1 17 15-3-6-15"/>
    <path fill="#63525b" d="M15 25 29 19 45 24 51 44 40 53 20 49 12 39Z"/>
    <path fill="#8b655b" stroke="none" d="m18 29 12-4 13 5 2 9-9 9-15-3Z"/>
    <path fill="#ef8c48" d="m30 30 10 4-3 11-9 1-5-9Z"/>
    <path fill="#ffcc72" stroke="none" d="m31 34 5 3-2 5h-4l-2-4Z"/>
    <path fill="#64525a" d="M18 11 27 4 43 7 50 20 44 31 23 30 16 21Z"/>
    <path fill="#a27561" stroke="none" d="m21 12 9-4 9 1 5 6-14 1-8 5Z"/>
    <path fill="#302f3f" d="m22 19 11 2-3 5-7-1M37 20l10-3-1 7-8 2"/>
    <path d="m25 23 4 1m12-1 3-1" fill="none" stroke="#ffcf75" strokeWidth="2"/>
    <path d="m32 9-3 6 5 3m8 11 1 8m-23 7 5-5M18 52l6 2m19-4 5 3" fill="none" stroke="#f28c4d" strokeWidth="1.7"/>
    <path fill="#57464f" d="M11 27 3 34 4 48 12 52 20 43 19 32Z"/>
    <path fill="#72565a" d="m48 28 11 4 3 14-8 7-10-7-1-11Z"/>
    <path d="m6 36 7 3-4 8m41-13 4 7 6 1" fill="none" stroke="#fa9b52" strokeWidth="2"/>
    <path d="m17 58 8 1m16 0 8-2" fill="none" stroke="#998078" strokeWidth="2"/>
  </>,
};

export function CreaturesSprite({ enemyKey, className }: EnemySpriteProps) {
  const body = CREATURE_ARTWORK[enemyKey];
  if (!body) return null;
  return <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false" data-enemy-key={enemyKey} data-art-version="bestiary-2">
    <g className="adventure-enemy-body"><g transform="scale(.5)" stroke="#293244" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">{body}</g></g>
  </svg>;
}
