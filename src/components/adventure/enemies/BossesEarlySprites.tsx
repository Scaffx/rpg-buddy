import type { ReactNode } from 'react';
import type { EnemySpriteProps } from './types';
import { bossesEarlyEnemies } from './bossesEarly.data';
import './bossesEarly.css';

// The public 32-unit viewBox contains figures drawn on a 64-unit grid.
function Figure({ index }: { index: number }): ReactNode {
  switch (index) {
    case 0: // Goblin: wide grin, curled ears, patched jerkin and dagger.
      return <>
        <path fill="#426444" d="M15 43Q9 48 10 59h9l5-11 10 1 4 10h10q0-11-9-17Z"/>
        <path fill="#aa754e" d="M15 34q12-7 27 1l4 15q-12 9-31 0Z"/>
        <path fill="#d0a16e" d="M19 37q8-3 13 1l-3 13-11-3Zm18 0 5-1 2 11-8 4Z"/>
        <path fill="#639449" d="M15 27Q7 27 3 14q9 3 14 10Q20 15 32 15q12 0 16 9 5-8 14-10-4 13-14 15 0 17-17 20-17-1-18-13Z"/>
        <path fill="#9fc970" d="M7 19q6 4 9 10l-5-1Zm42 10q5-8 9-10l-3 10ZM20 23q9-9 19-1-9-2-18 7Z"/>
        <path fill="#4d7642" d="M22 18q1-12 12-15-2 8 0 13 5 0 7 4-11-3-19 4Z"/>
        <path fill="#d1aa72" d="M19 37q12 8 24-2-2 11-13 13-7-1-11-11Z"/>
        <path fill="#fff4d9" stroke="none" d="M30 31q4-3 8 0v5h-8Z"/>
        <circle fill="#253537" stroke="none" cx="36" cy="33" r="2.4"/><circle fill="#fff" stroke="none" cx="36.7" cy="32" r=".8"/>
        <path fill="none" stroke="#44613b" strokeWidth="1.5" d="M20 30q3-3 7-2m-2 13q7 5 13-1"/>
        <path fill="#faf0d1" d="m27 42 2 5 3-3 3 2 3-5q-5 3-11 1Z"/>
        <path fill="#784f38" d="m41 44 5-6 5 4-8 10-5-4Z"/>
        <path fill="#d1dbd2" d="M47 39q8-12 15-13-2 13-14 21l-4-4Z"/>
      </>;
    case 1: // Wolf: long low body, soft ruff, pointed ears and friendly muzzle.
      return <>
        <path fill="#647385" d="M15 37Q5 34 4 21q-5 18 8 28l10-5Z"/>
        <path fill="#8593a1" d="M8 33q9-14 28-8 13 3 17 13l-6 12q-19 8-36-1Q5 43 8 33Z"/>
        <path fill="#aeb8b9" d="M13 31q11-7 22-2l-7 15-18-2q-1-5 3-11Z"/>
        <path fill="#596979" d="M14 45q-6 5-6 14h9l6-12Zm20 1q-2 5-1 13h9l3-13Z"/>
        <path fill="#8c9daa" d="M22 45q-2 6-1 14h8l3-13Zm21-2q3 8 5 16h9q0-10-7-19Z"/>
        <path fill="#d7d8cb" d="M17 37q2-8 7-10 0 8 5 11 3-9 8-11l4 15q-8 10-20 9Z"/>
        <path fill="#718293" d="M36 29q-3-10 3-23 5 3 9 14 3-11 10-13 1 15-1 23 7 9 0 16-8 6-20-2-6-6-1-15Z"/>
        <path fill="#c7ccca" d="M40 14q2 4 4 8l-5 4Zm14 2-4 10 7-2Z"/>
        <path fill="#e2ddd2" d="M46 36q8-5 15 0 5 4 1 11-7 7-18 1-5-4 2-12Z"/>
        <path fill="#fff8e8" stroke="none" d="M49 27q5-3 8 1l-1 6-6 1Z"/>
        <circle fill="#29353c" stroke="none" cx="54" cy="30" r="2.6"/><circle fill="#fff" stroke="none" cx="55" cy="29" r=".8"/>
        <ellipse fill="#30363d" stroke="none" cx="61" cy="40" rx="3" ry="2.5"/>
        <path fill="none" stroke="#9da8a5" strokeWidth="1.5" d="M47 43q6 6 12 3"/>
      </>;
    case 2: // Orc: rounded heavy frame, mohawk, tusks and broad axe.
      return <>
        <path fill="#3e5e45" d="M17 43q-6 6-4 17h10l5-14Zm20 0q-1 9 3 17h10q1-12-6-19Z"/>
        <path fill="#855e41" d="M10 33q5-12 20-13 17 0 23 14l-6 18-30 1-8-12Z"/>
        <path fill="#b28655" d="M15 32q5-5 13-5l-3 19-13-3Zm26-3q7 2 9 9l-5 9-11-3Z"/>
        <path fill="#80a456" d="M14 20Q17 7 30 6q17 0 21 14l1 12q-2 15-19 18-20 0-24-17Z"/>
        <path fill="#b7cb7d" d="M17 20q11-10 24-3l-5 9-23 3Z"/>
        <path fill="#49663f" d="M19 17Q20 5 27 2l2 11q5-10 11-12l-2 17q-10-4-19 4Z"/>
        <path fill="#d2ad7f" d="M18 36q13 9 28-2-2 10-13 12-11 0-15-10Z"/>
        <path fill="#fff0c9" d="M17 36q2 6 5 8l3-7Zm24-1 4 8 2-9Z"/>
        <path fill="#fff9df" stroke="none" d="M19 26q4-3 8 0v5h-8Zm16 0q5-3 9 0v5h-9Z"/>
        <path fill="#2e4035" stroke="none" d="M22 27h4v4h-4Zm17 0h4v4h-4Z"/>
        <circle fill="#fff" stroke="none" cx="25" cy="27" r=".8"/><circle fill="#fff" stroke="none" cx="42" cy="27" r=".8"/>
        <path fill="none" stroke="#537047" strokeWidth="1.7" d="m18 25 9-2m9 0 9 2m-15 15q4 2 8-1"/>
        <path fill="#5d7c4f" d="M11 33Q2 33 2 44l11 5 8-12Zm41 0q10 1 10 10l-11 6-8-12Z"/>
        <path fill="#75523e" d="m52 21 5-2 1 37-5 1Z"/>
        <path fill="#b9c9bb" d="M50 19q-9-10-17-5l-6 11 12 6 8-9 8 10Z"/>
      </>;
    case 3: // Spider: oval abdomen, round face, eight bent living legs.
      return <>
        <path fill="none" stroke="#534254" strokeWidth="5" d="M19 29Q12 17 8 14q-4-2-6 5m16 17Q9 27 6 29q-4 2-4 10m17 2Q10 42 7 47q-3 5-1 12m18-31Q17 14 19 9q1-5 6-7m17 27q7-14 12-15 5-2 8 5M43 35q11-8 15-5 4 3 4 11M42 42q12 2 15 8 3 6 1 11M37 28q4-16 9-21 3-3 7-2"/>
        <path fill="none" stroke="#ad8397" strokeWidth="1.8" d="M8 17q3 1 5 5M6 31q4 0 7 3M8 48q4-3 7-3m39-29q-4 4-6 8m9 8q-4 1-8 4m7 15q-5-4-10-5"/>
        <ellipse fill="#5b455d" cx="22" cy="38" rx="19" ry="17"/>
        <ellipse fill="#906779" cx="21" cy="35" rx="15" ry="12"/>
        <path fill="#c18f9a" d="M12 29q9-8 19 2-10-2-16 5Z"/>
        <path fill="none" stroke="#654657" strokeWidth="2" d="M10 42q5-5 10 1 5-6 11-2m-15 8q5-4 9 1"/>
        <ellipse fill="#6b4d66" cx="44" cy="38" rx="14" ry="13"/>
        <ellipse fill="#ad788b" cx="44" cy="35" rx="11" ry="9"/>
        <path fill="#fff5e9" stroke="none" d="M36 33q4-3 7 1v5h-7Zm9 0q4-3 7 1v5h-7Z"/>
        <path fill="#2f3440" stroke="none" d="M39 34h3v4h-3Zm9 0h3v4h-3Z"/>
        <circle fill="#fff" stroke="none" cx="41" cy="34" r=".8"/><circle fill="#fff" stroke="none" cx="50" cy="34" r=".8"/>
        <circle fill="#efc6bd" stroke="none" cx="34" cy="40" r="1.5"/><circle fill="#efc6bd" stroke="none" cx="54" cy="40" r="1.5"/>
        <path fill="#f2e5d5" d="M39 47q2 5 5 8l3-5 3 5q4-4 4-8-7 4-15 0Z"/>
      </>;
    case 4: // Young dragon: rounded belly, sturdy paws, feather-like wing membranes.
      return <>
        <path fill="#9d473e" d="M18 43Q4 40 4 56q8-7 17-3l9-7Z"/>
        <path fill="#bd5941" d="M19 39Q7 32 5 13q8 9 14 10 0-9 5-16 8 9 12 15 9-4 14-12 1 18-8 32Z"/>
        <path fill="#e68b54" d="M17 35Q8 26 8 19q9 9 18 13-3-11-1-17 9 13 13 15 7-5 10-13-2 13-12 21Z"/>
        <path fill="none" stroke="#a75443" strokeWidth="1.8" d="M10 21q9 12 19 15m-4-20q7 15 13 18m9-14q-7 10-14 14"/>
        <ellipse fill="#b94f3f" cx="31" cy="43" rx="20" ry="13"/>
        <path fill="#ec9f62" d="M21 41q10-10 23-1 0 10-12 14-12-2-11-13Z"/>
        <path fill="#ffe0a0" d="M28 43q9-7 16-2-3 10-12 11-6-2-4-9Z"/>
        <path fill="#a8463d" d="M18 48q-5 5-5 11h9l5-8Zm20-1q-2 7 1 12h10q-1-8-6-12Z"/>
        <path fill="#d76e47" d="M39 29Q40 16 48 13q12 1 13 13l-3 14q-7 8-18 3-8-6-1-14Z"/>
        <path fill="#f8d297" d="M43 18q-1-9 3-15l6 12q5-6 10-7-2 10-7 15Z"/>
        <path fill="#f3ad6d" d="M46 32q7-4 14 0 5 4 2 9-7 6-17 1-5-5 1-10Z"/>
        <path fill="#fff2d5" stroke="none" d="M48 25q4-3 8 0v6h-8Z"/>
        <circle fill="#30343c" stroke="none" cx="53" cy="27" r="2.5"/><circle fill="#fff" stroke="none" cx="54" cy="26" r=".8"/>
        <path fill="none" stroke="#a95f46" strokeWidth="1.7" d="M47 39q6 4 12 1"/>
      </>;
    case 5: // Skeleton champion: rounded skull inside armor, ribs, shield and blade.
      return <>
        <path fill="#5c6a77" d="M17 44q-4 7-4 16h11l5-15Zm20 0q0 8 3 16h10l-5-17Z"/>
        <path fill="#a8b2ae" d="M16 24q8-8 27-2l6 22-15 10-20-8Z"/>
        <path fill="#e8dfc6" d="M21 28q10-5 20 0l-4 17-7 3-9-6Z"/>
        <path fill="none" stroke="#9da099" strokeWidth="2.3" d="M21 33q10 6 20 1m-19 6q9 5 17 1m-9-11v17"/>
        <path fill="#778895" d="M12 24Q4 24 2 34l10 7 11-13Zm36-1q11 2 12 11l-11 7-10-14Z"/>
        <path fill="#d8cdb0" d="M17 12Q20 2 32 2q15 0 16 12l-3 14q-5 8-14 8-11 0-15-10Z"/>
        <path fill="#f1e7ce" d="M21 14q12-8 23 1l-3 12-9 5-10-6Z"/>
        <path fill="#657a8d" d="M16 13Q18 2 31 1q15-1 18 12l-5 4q-12-9-23 0Z"/>
        <path fill="#bf725f" d="M24 5Q18-1 10 4q9-1 12 6Z"/>
        <path fill="#34414a" stroke="none" d="M23 19q5-4 9 0l-2 7h-6Zm13 0q5-4 9 0l-2 7h-6Z"/>
        <circle fill="#fff8de" stroke="none" cx="29" cy="20" r="1"/><circle fill="#fff8de" stroke="none" cx="42" cy="20" r="1"/>
        <path fill="#a7a092" d="m30 26 4-2 4 6H28Z"/>
        <path fill="#c4b082" d="M4 33q4-7 11-3l3 18-10 10-6-9Z"/>
        <path fill="#e8d6a5" d="M6 35q5-4 8-2l1 12-7 8-4-5Z"/>
        <path fill="#c0cbc8" d="m52 32 7-18 4 4-3 35-7 1Z"/>
      </>;
    case 6: // Witch: visible smiling face, soft hair and curved brim.
      return <>
        <path fill="#40334f" d="M17 37Q7 43 4 60h49q-4-18-15-24Z"/>
        <path fill="#796085" d="M19 40q-7 7-8 17l12 3 8-15 10 15h8q-4-15-12-20Z"/>
        <path fill="#40344f" d="M14 53q5-4 9 1l8-8 7 9q5-5 10 0l4 5H4Z"/>
        <path fill="#54415b" d="M16 23q1-14 15-15 16 2 16 18l-4 14-14 7-14-8Z"/>
        <path fill="#d7a7ad" d="M20 23q9-7 20 0l-1 15q-5 7-11 6-9-4-8-14Z"/>
        <path fill="#f4c9c4" d="M23 27q7-5 14-1l-1 10-7 5-6-5Z"/>
        <path fill="#60496d" d="M18 26q-1-10 7-16 10 5 17 13-6 0-10-6-6 8-14 9Z"/>
        <path fill="#684e79" d="M15 22Q18 8 25 3q9-6 15 1l-6 9q12-2 17 11-20 7-44 2Z"/>
        <path fill="#ad89b3" d="M11 23q17-6 37-1l3 3q-22 6-44 1Z"/>
        <path fill="#fff6eb" stroke="none" d="M31 27q4-3 7 0v5h-7Z"/>
        <circle fill="#342e3b" stroke="none" cx="35" cy="29" r="2"/><circle fill="#fff" stroke="none" cx="35.6" cy="28.3" r=".7"/>
        <path fill="none" stroke="#a56a83" strokeWidth="1.4" d="M26 37q4 3 7 0"/>
        <path fill="none" stroke="#745282" strokeWidth="2.5" d="M47 39q10-8 10-22"/>
        <circle fill="#d5b8e8" cx="56" cy="15" r="6"/><circle fill="#f7e6fb" stroke="none" cx="55" cy="13" r="2"/>
      </>;
    case 7: // Centaur: horse haunches, human torso and expressive profile.
      return <>
        <path fill="#76523f" d="M12 37Q4 34 3 24q-3 15 9 24Z"/>
        <path fill="#a67955" d="M7 35q5-14 24-13 15 1 20 14l-8 13q-18 5-32-1Q4 43 7 35Z"/>
        <path fill="#cf9e6e" d="M11 32q12-10 27-2l-6 13-23-3Z"/>
        <path fill="#815c44" d="M10 46q-4 6-3 14h9l5-14Zm25 1q-1 5 0 13h9l1-14Z"/>
        <path fill="#ae805b" d="M22 46q0 7 2 14h8l-3-14Zm22-2q6 8 5 16h9q-1-12-8-18Z"/>
        <path fill="#eee0bb" d="m49 46 7-2 2 11-8 2Z"/>
        <path fill="none" stroke="#a77c5d" strokeWidth="1.6" d="m50 49 7-2m-6 6 6-2"/>
        <path fill="#b98962" d="M27 20q2-9 10-9 8 0 11 10l1 20-21 2-5-10Z"/>
        <path fill="#6e8970" d="M25 28q9-7 22-3l-2 11-18 2Z"/>
        <path fill="#e1ae81" d="M30 10Q33 2 40 2q10 1 12 11l-5 11-13 1-6-9Z"/>
        <path fill="#68503e" d="M27 14Q28 1 40 1q9-1 13 9l-5 2q-8-8-16 6Z"/>
        <path fill="#f5c799" d="M34 13q6-5 12 0l-3 10-8-1Z"/>
        <path fill="#fff9e9" stroke="none" d="M40 12q4-2 6 1v5h-6Z"/>
        <circle fill="#333941" stroke="none" cx="43" cy="14" r="2"/><circle fill="#fff" stroke="none" cx="43.5" cy="13.5" r=".6"/>
        <path fill="none" stroke="#936649" strokeWidth="1.5" d="M38 20q3 2 5 0"/>
        <path fill="#b98962" d="M43 27q8-4 11 3l1 11-7 2-6-10Z"/>
        <path fill="none" stroke="#e9e4cf" strokeWidth="2.5" d="M57 58 62 8"/>
        <path fill="#e9e4cf" d="m60 11 3-9 1 13-4 1Z"/>
      </>;
    case 8: // Golem: stone facets remain material-specific; softer mass and moss.
      return <>
        <path fill="#667568" d="M13 44Q8 50 8 60h16l5-14Zm24 1q0 9 3 15h18l-9-17Z"/>
        <path fill="#899485" d="M13 16q8-10 23-9 15 2 19 22l-5 18q-11 12-31 6Q7 47 8 32Z"/>
        <path fill="#b0b7a4" d="M18 17q11-8 18-5l-2 17-18 3-5-8Zm22-4q10 1 12 14l-13 2Z"/>
        <path fill="#6d8270" d="M18 35q10-5 17 3l13-4 4 11q-11 12-32 6Z"/>
        <path fill="#abb69c" d="m22 39 10 2-4 9-11-3Zm18 2 9-4 1 8-11 7Z"/>
        <path fill="#7d8c7b" d="M9 25Q2 25 2 36l5 16 10 2 8-16-8-11Zm43-3q9 0 10 11l-2 19-11 3-10-17Z"/>
        <path fill="#bac0aa" d="M4 34q6-6 13-2l1 8-7 9-7-4Zm47-3q6-5 10 2l-2 13-9 5-5-11Z"/>
        <path fill="#6c9367" d="M13 16Q9 7 18 5l8 7-4 8Zm28-3q8-10 17-5l-8 10Z"/>
        <path fill="#f4e9bd" stroke="none" d="M22 26q5-3 8 0v5h-8Zm17-1q5-3 8 0v5h-8Z"/>
        <path fill="#3c534a" stroke="none" d="M25 27h4v4h-4Zm17-1h4v4h-4Z"/>
        <path fill="none" stroke="#647766" strokeWidth="2" d="m34 13-1 12 6 6-9 9m-14-5 8 4"/>
      </>;
    case 9: // Phoenix: upright round bird, broad scalloped wings and flowing plumes.
      return <>
        <path fill="#c7543b" d="M28 49Q11 48 8 61q9-6 18-5 5-2 9-8Z"/>
        <path fill="#ea813e" d="M31 51Q20 53 20 63q7-7 16-8l7-7Z"/>
        <path fill="#ffd279" d="M36 51q-5 6-3 12 6-6 12-8Z"/>
        <path fill="#be4d3b" d="M29 41Q17 37 8 15q-3-7-6-4-2 9 5 19-5 1-4 6 0 4 6 7-1 4 3 7 10 8 21 1Z"/>
        <path fill="#e8783b" d="M28 42Q17 36 8 20q0 12 10 22-7-1-11-5 6 11 17 12Z"/>
        <path fill="#ffb95a" d="M27 44Q16 40 9 31q2 10 16 17l7-1Z"/>
        <path fill="#ffda81" d="M23 44q-6-1-10-5 4 8 14 10Z"/>
        <path fill="#c3513d" d="M35 40Q47 32 54 14q3-8 6-6 4 8-2 20 6 2 3 7-2 5-8 6 2 5-3 9-7 6-17 2Z"/>
        <path fill="#ec813e" d="M39 40q11-8 17-24 1 12-7 22 5-1 9-5-3 10-14 14Z"/>
        <path fill="#ffc15c" d="M41 41q8-5 13-13-2 10-12 18l-8 1Z"/>
        <path fill="#ffe092" d="M44 42q5-1 9-6-3 8-13 12Z"/>
        <ellipse fill="#e87b3c" cx="33" cy="43" rx="14" ry="16"/>
        <ellipse fill="#ffb852" cx="35" cy="43" rx="10" ry="12"/>
        <path fill="#ffe4a0" d="M35 44q4-6 9-5-1 9-8 13-4-2-1-8Z"/>
        <path fill="#ec813d" d="M36 25q-2-9 5-13 6 2 7 9 2-8 8-11 1 8-3 15 5 6 2 13-5 9-13 8-12-2-10-14Z"/>
        <path fill="#ffca68" d="M42 21q-1-4 1-7 4 3 4 8Zm7 2q2-6 5-9 0 6-3 11Z"/>
        <path fill="#fff6e0" stroke="none" d="M44 27q5-3 9 1v6h-9Z"/>
        <circle fill="#32323a" stroke="none" cx="50" cy="30" r="2.4"/><circle fill="#fff" stroke="none" cx="51" cy="29" r=".8"/>
        <path fill="#f7dc8b" d="M52 35q6-1 11 3-5 5-11 3l-3-3Z"/>
        <path fill="none" stroke="#af623e" strokeWidth="1.5" d="M30 56q-3 3-6 3m13-4q3 3 6 3"/>
        <circle fill="#fa9f6c" stroke="none" cx="43" cy="38" r="2"/>
      </>;
    case 10: // Salamander: curled tail, low soft body, small feet and flame crest.
      return <>
        <path fill="#9b453c" d="M17 37Q3 35 3 51q0 9 9 9-6-7 1-11l12-3Z"/>
        <path fill="#b8543c" d="M10 34q6-12 23-12 16 0 24 12l3 9q-10 11-30 10-17 0-22-10Z"/>
        <path fill="#e38a46" d="M11 29q4-9 11-13-2-7 1-12 7 8 8 16 3-10 9-17 4 10 2 17 7-5 13-8-1 11-8 17Z"/>
        <path fill="#ffd676" d="M22 18q2-4 2-8 5 6 4 12Zm15 2q3-6 4-10 2 8-1 14Z"/>
        <ellipse fill="#d36b40" cx="32" cy="39" rx="22" ry="13"/>
        <path fill="#f5b264" d="M14 39q16-11 36-1 2 8-12 12-18 2-24-11Z"/>
        <path fill="#a64b3c" d="M17 46q-10 1-13 11l9 2 11-9Zm21 3q0 8 7 10l8-5-9-7Z"/>
        <path fill="#c55b3d" d="M45 27q12-7 18 4v11q-6 9-17 5-8-5-5-13Z"/>
        <path fill="#f2a75d" d="M50 38q6-4 12-1l1 5q-5 7-13 4-5-3 0-8Z"/>
        <path fill="#fff7df" stroke="none" d="M51 29q5-3 9 1v5h-9Z"/>
        <circle fill="#36343b" stroke="none" cx="56" cy="31" r="2.3"/><circle fill="#fff" stroke="none" cx="57" cy="30" r=".7"/>
        <path fill="none" stroke="#ac5c42" strokeWidth="1.5" d="M51 43q4 2 8 0"/>
      </>;
    case 11: // Ice mermaid: visible human expression and flowing scaled tail.
      return <>
        <path fill="#76b4c0" d="M26 42Q13 40 10 51L3 46q0 9 5 16l10-7 10 7 5-13Z"/>
        <path fill="#4c98ae" d="M26 34q17-5 22 9-2 13-17 13-10-2-17-10l11-4Z"/>
        <path fill="#addcda" d="M21 45q11 8 24 0-3 8-14 8-7-1-10-8Z"/>
        <path fill="none" stroke="#74aab7" strokeWidth="1.5" d="m23 45 5 5m4-8 5 6m1-10 5 5"/>
        <path fill="#80bcc7" d="M17 16Q20 4 32 3q14 1 17 18l-5 20-14 5-17-14Z"/>
        <path fill="#c7e8e6" d="M18 27q9-9 23-4l3 14-13 8-14-10Z"/>
        <path fill="#dfd2c8" d="M22 18q9-8 20 1l-2 15q-5 9-12 7-9-3-8-13Z"/>
        <path fill="#f5ece3" d="M24 22q8-5 15-1l-2 11-8 6-6-7Z"/>
        <path fill="#61a0b0" d="M17 28Q11 7 24 3q12-6 21 5 5 7 4 21-5-10-8-15-8-5-15 5l-6 14Z"/>
        <path fill="#daf3ed" d="m20 8 4-7 8 4 8-4 5 9q-11-1-15 6Z"/>
        <path fill="#fff" stroke="none" d="M32 23q5-3 8 0v6h-8Z"/>
        <circle fill="#345466" stroke="none" cx="37" cy="25" r="2.3"/><circle fill="#fff" stroke="none" cx="38" cy="24" r=".8"/>
        <path fill="none" stroke="#b7838d" strokeWidth="1.4" d="M28 34q4 3 8 0"/>
        <path fill="#e9eef0" d="M17 32q-9 0-13 15l7 5 14-15Z"/>
        <path fill="none" stroke="#eefbfa" strokeWidth="2" d="M50 10 59 2m-7 13 10-1"/>
      </>;
    case 12: // Minotaur: broad bull, curved horns and rounded muzzle.
      return <>
        <path fill="#604a39" d="M17 45q-5 5-6 15h12l5-12Zm22 0q1 8 2 15h12l-6-18Z"/>
        <path fill="#875940" d="M13 26q8-12 23-9 17 1 21 17l-8 19-30 1Q6 45 10 34Z"/>
        <path fill="#b4845d" d="M17 27q8-7 20-4l-5 17-18 6Zm25 0q10 3 11 11l-8 9-11-10Z"/>
        <path fill="#b9855b" d="M18 15Q23 3 36 3q16 1 20 16l-3 19q-6 12-18 12-16-2-19-17Z"/>
        <path fill="#e9dbb4" d="M20 17Q7 17 6 4q-4 19 9 24l10-5Zm29 0Q59 16 57 4q9 17-3 25l-9-6Z"/>
        <path fill="#81553d" d="M19 13Q24 1 36 2q15 0 19 14l-8 4q-8-8-12-7-7-1-12 8Z"/>
        <ellipse fill="#d9ab7d" cx="45" cy="36" rx="15" ry="10"/>
        <ellipse fill="#f0c696" cx="47" cy="37" rx="11" ry="7"/>
        <path fill="#fff6df" stroke="none" d="M40 22q5-3 9 0v6h-9Z"/>
        <circle fill="#36393a" stroke="none" cx="45" cy="24" r="2.5"/><circle fill="#fff" stroke="none" cx="46" cy="23" r=".8"/>
        <ellipse fill="#7c5b47" stroke="none" cx="43" cy="38" rx="2" ry="1.6"/><ellipse fill="#7c5b47" stroke="none" cx="52" cy="38" rx="2" ry="1.6"/>
        <path fill="#ab9974" d="M5 34q6-7 15-3l2 18-10 10-10-8Z"/>
        <path fill="#d9c59b" d="m7 35 10-1 2 13-8 8-6-6Z"/>
        <path fill="none" stroke="#866e50" strokeWidth="1.8" d="m8 40 7-1-1 7-6 1 1-7"/>
      </>;
    case 13: // Sphinx: feline haunches, layered feathers and human face.
      return <>
        <path fill="#a57d52" d="M13 42Q3 34 4 24q-5 20 8 27Z"/>
        <path fill="#bd9263" d="M8 35q11-11 32-4 12 2 14 14l-11 11q-18 3-30-5Q6 43 8 35Z"/>
        <path fill="#e8c889" d="M14 37q15-7 30 2l-7 10-22-4Z"/>
        <path fill="#9b734e" d="M12 47q-3 7-2 13h10l5-10Zm27 0q0 6 2 13h12l-6-16Z"/>
        <path fill="#c9a16c" d="M17 34Q8 23 7 6q12 9 24 18l6 14Z"/>
        <path fill="#f3d698" d="M16 28q-4-7-5-14 10 10 18 15l-3 7Z"/>
        <path fill="none" stroke="#a98355" strokeWidth="1.5" d="M11 18q8 13 19 19m-17-11q7 10 16 13"/>
        <path fill="#d6aa73" d="M31 15Q35 5 44 5q12 1 16 15l-3 20-17 5-10-15Z"/>
        <path fill="#f1d1a0" d="M37 19q10-5 18 3l-1 14q-7 7-14 4-6-6-3-21Z"/>
        <path fill="#7e624d" d="M32 18Q30 7 40 3q10-4 17 6l4 9-6 2q-4-11-14-8Z"/>
        <path fill="#e7c384" d="M35 8q10-6 21 4l-4 5-17-2Z"/>
        <path fill="#fff8e7" stroke="none" d="M45 23q5-3 9 0v6h-9Z"/>
        <circle fill="#303a41" stroke="none" cx="50" cy="25" r="2.4"/><circle fill="#fff" stroke="none" cx="51" cy="24" r=".8"/>
        <path fill="none" stroke="#b78769" strokeWidth="1.4" d="M44 35q4 3 8 0"/>
        <path fill="#e9cc9e" d="M51 37q8-2 12 2-3 5-11 6l-9-5Z"/>
      </>;
    case 14: // Forest titan: woody trunk, root feet and leafy round crown.
      return <>
        <path fill="#665a41" d="M18 42Q8 46 4 61h16l10-15Zm21 1 5 18h16L47 44Z"/>
        <path fill="#806d49" d="M17 18q8-11 25-7 13 5 13 24l-8 20q-14 8-28-3-10-11-7-23Z"/>
        <path fill="#aa9160" d="M20 22q9-7 22 1l5 18-9 10-17-7Z"/>
        <path fill="#5e533d" d="M12 27Q4 24 2 35l3 17 12 3 8-18Zm38-1q8-3 12 8l-3 18-11 4-10-18Z"/>
        <path fill="#947c50" d="M4 35q5-5 12-2l2 9-7 8-7-4Zm47-2q6-4 9 3l-2 11-9 6-5-12Z"/>
        <path fill="#628347" d="M14 22Q5 19 9 10q5-8 15-4Q27-2 35 2q5 1 7 8 7-8 15-4 6 6-2 14-4 5-12 6-13-5-29-4Z"/>
        <path fill="#91ae59" d="M12 13q5-6 12 2-7 0-9 5Zm23-5q6-6 10 1l-8 11q-5-5-2-12Zm13 3q5-5 8 0-2 7-8 9Z"/>
        <path fill="none" stroke="#705b3c" strokeWidth="2.1" d="M31 9q-5 13-3 24l-8 11m8-11 12 13m-7-27 9 10"/>
        <path fill="#f1e3a8" stroke="none" d="M24 29q4-3 8 0v5h-8Zm15-1q4-3 8 0v5h-8Z"/>
        <path fill="#5b613e" stroke="none" d="M27 30h4v4h-4Zm15-1h4v4h-4Z"/>
        <path fill="none" stroke="#745f42" strokeWidth="1.7" d="M28 40q5 4 10-1"/>
      </>;
    case 15: // Immortal warrior: armor facets but an open, readable human face.
      return <>
        <path fill="#596d7e" d="M17 44q-4 7-4 16h12l5-15Zm22 0q0 8 2 16h12l-6-17Z"/>
        <path fill="#aab7b7" d="M16 22q10-9 27-2l7 24-17 10-19-9Z"/>
        <path fill="#d7dbcf" d="M21 27q10-5 21 0l-2 19-9 5-10-7Z"/>
        <path fill="#c6a75d" d="m30 26 5 1v23l-5 1Z"/>
        <path fill="#748998" d="M13 23Q4 23 3 35l10 6 11-15Zm35-1q10 2 13 12l-10 8-11-15Z"/>
        <path fill="#b9c8c4" d="M23 8q9-8 18-2l6 10-3 15-10 8-14-9-2-13Z"/>
        <path fill="#eccdb3" d="M25 17q8-5 17 1l-1 13-8 5-10-8Z"/>
        <path fill="#667e8f" d="M19 17Q18 4 31 3q16-1 17 13l-5 3q-10-10-20 2Z"/>
        <path fill="#cba95d" d="M30 5Q25-1 18 2q9 2 7 9Z"/>
        <path fill="#fff9e7" stroke="none" d="M31 21q5-2 9 0v5h-9Z"/>
        <circle fill="#34414a" stroke="none" cx="36" cy="23" r="2.2"/><circle fill="#fff" stroke="none" cx="37" cy="22" r=".7"/>
        <path fill="none" stroke="#9e796a" strokeWidth="1.4" d="M29 30q4 2 8 0"/>
        <path fill="#bfa96e" d="M5 33q5-6 14-3l2 19-11 11-8-11Z"/>
        <path fill="#e4d396" d="M6 36q5-4 10-2l2 13-8 9-5-8Z"/>
        <path fill="#d2ddd6" d="m52 33 7-19 4 4-3 39-5 1Z"/>
      </>;
    case 16: // Wraith: hovering cloak, hollow soft mask and spectral hands.
      return <>
        <path fill="#4e4064" d="M20 10Q31-1 44 9q11 12 10 27l5 24-14-7-9 9-10-8-11 6 2-17-11-6Z"/>
        <path fill="#7b688d" d="M22 15q12-9 21 0l6 21-11 12-18-8-6-10Z"/>
        <path fill="#39304f" d="M17 40q12 9 26 0l10 14-8-5-9 12-9-10-12 9 3-16-10 5Z"/>
        <path fill="#d6bfdf" d="M24 18q9-8 19 0l3 13-11 13-12-9Z"/>
        <path fill="#f0e6ea" d="M27 21q7-5 13 1l2 8-8 9-8-7Z"/>
        <path fill="#815b96" stroke="none" d="M27 25q5-3 8 1l-2 6-6-1Zm10 0q5-3 8 1l-4 6-4-1Z"/>
        <circle fill="#e3d3ee" stroke="none" cx="31" cy="26" r="1"/><circle fill="#e3d3ee" stroke="none" cx="42" cy="26" r="1"/>
        <path fill="none" stroke="#ac96b5" strokeWidth="1.5" d="M33 36q3-2 5 0"/>
        <path fill="#56446b" d="M17 30Q7 27 2 36l1 11 10 5 10-16Zm31 0q10-4 14 5l1 12-12 5-9-16Z"/>
        <path fill="#b596c3" d="M3 44 1 54l7-5 3 8 4-11Zm56 0 4 10-8-5-2 8-5-11Z"/>
        <path fill="none" stroke="#907da3" strokeWidth="2" d="M19 12q-7 4-9 12m40 5q7-4 9-11"/>
      </>;
    case 17: // Manticore: lion haunches, curved feather wings and scorpion sting.
      return <>
        <path fill="none" stroke="#77634d" strokeWidth="5" d="M13 37Q3 26 7 13q2-8 10-9 8-1 10 7"/>
        <path fill="#9a7855" d="M22 8q4-8 10-7l-4 13-9 3Z"/>
        <path fill="#e9ddb7" d="M25 9q6 3 4 8l-6 5-5-5Z"/>
        <path fill="#b98058" d="M8 34q11-13 30-8 15 3 16 17l-9 11q-19 3-32-3Q5 45 8 34Z"/>
        <path fill="#dfad71" d="M12 34q11-8 27-2l3 13-26 2Z"/>
        <path fill="#805a42" d="M14 47q-4 7-4 13h9l6-11Zm29 0 3 13h10l-5-16Z"/>
        <path fill="#c6936b" d="M20 34Q12 19 16 6q11 8 18 23l-5 14Z"/>
        <path fill="#e8b68c" d="M21 28q-3-8-3-14 7 8 12 16l-5 6Z"/>
        <path fill="#9c7c67" d="M28 35q4-18 18-24l-1 18-12 14Z"/>
        <path fill="#d4a687" d="M33 33q4-10 10-15l-2 14-8 7Z"/>
        <ellipse fill="#97694d" cx="48" cy="35" rx="13" ry="15"/>
        <path fill="#b98459" d="M43 24q8-5 15 2l3 8-7 9-10-6Z"/>
        <path fill="#ebc592" d="M49 36q7-4 13 1v8q-7 6-14 1-4-5 1-10Z"/>
        <path fill="#fff8e5" stroke="none" d="M49 27q5-3 9 0v6h-9Z"/>
        <circle fill="#33323a" stroke="none" cx="54" cy="29" r="2.4"/><circle fill="#fff" stroke="none" cx="55" cy="28" r=".8"/>
        <path fill="none" stroke="#9b7156" strokeWidth="1.5" d="M49 43q5 3 10 0"/>
      </>;
    case 18: // Daemon: bat wings and horns with a readable face inside armor.
      return <>
        <path fill="#54394f" d="M19 29Q8 18 3 5q-1 20 7 30l12 8Zm25 0Q55 16 61 5q1 22-8 31l-12 8Z"/>
        <path fill="#855363" d="M12 25q-4-4-6-11 1 15 13 23Zm38 0q5-5 8-12-1 16-14 25Z"/>
        <path fill="#61384e" d="M17 44q-6 7-6 16h13l6-14Zm22 0q1 9 5 16h13l-9-18Z"/>
        <path fill="#924e50" d="M16 29q8-12 26-8 13 6 13 22l-7 10-29 2-9-14Z"/>
        <path fill="#c27460" d="M21 32q9-6 20-2l7 9-7 10-17-1Z"/>
        <path fill="#6e4052" d="M20 16q8-9 21-7l9 14-3 17-15 9-16-12-2-13Z"/>
        <path fill="#b86660" d="M21 23q10-8 23 0l1 11q-5 9-12 11-9-4-12-14Z"/>
        <path fill="#dfaa7b" d="M20 19Q10 13 11 2q-8 12 3 23l10 2Zm24 0Q54 12 53 2q8 13-2 23l-10 2Z"/>
        <path fill="#e89570" d="M26 26q8-5 16 0l-1 10-8 6-8-7Z"/>
        <path fill="#fff0df" stroke="none" d="M26 27q4-3 8 0v5h-8Zm10 0q4-3 8 0v5h-8Z"/>
        <path fill="#3c303c" stroke="none" d="M30 28h3v4h-3Zm10 0h3v4h-3Z"/>
        <circle fill="#fff" stroke="none" cx="32" cy="28" r=".7"/><circle fill="#fff" stroke="none" cx="42" cy="28" r=".7"/>
        <path fill="none" stroke="#8d4e54" strokeWidth="1.5" d="M29 37q4 3 8 0"/>
        <path fill="none" stroke="#d6b67b" strokeWidth="2.8" d="m57 59 1-43m-5 1 5 6 5-6m-9-7 4 8 4-8"/>
      </>;
    case 19: // Leviathan: coiled serpent, soft fins, whiskers and broad jaw.
      return <>
        <path fill="#367187" d="M4 55Q-2 36 10 26q13-12 27 2l-6 14Q18 30 12 43q-2 8 6 12Z"/>
        <path fill="#65a8b0" d="M9 49q-1-14 9-18 8-3 16 3l-5 5q-9-5-14 1-3 4-1 11Z"/>
        <path fill="#3a7e8d" d="M15 48q13-13 30-5l7 11q-17 13-38 4Z"/>
        <path fill="#86c2bd" d="M19 50q13-7 25-2l4 8q-13 7-28 0Z"/>
        <path fill="#5295a0" d="M22 31Q18 20 17 12q8 3 13 10 3-12 10-18 5 9 5 16 5-8 12-10l-3 20Z"/>
        <path fill="#abd5c5" d="M21 19q6 4 9 10l-5 2Zm15-8q4 7 5 13l-10 3Z"/>
        <path fill="#46899a" d="M38 20Q43 8 53 8q10 3 11 16l-3 17q-9 12-20 8-11-7-8-18Z"/>
        <path fill="#7abcc0" d="M42 23q7-9 14-6 7 6 6 17l-13 7-12-8Z"/>
        <path fill="#b0d7ce" d="M49 34q8-5 15 0l-2 11q-7 8-16 2-6-6 3-13Z"/>
        <path fill="#f2f2dc" d="M46 43q7 4 16-1-3 9-11 12l-9-6Z"/>
        <path fill="#fff9e9" stroke="none" d="M50 23q5-3 9 0v6h-9Z"/>
        <circle fill="#2c4050" stroke="none" cx="55" cy="25" r="2.5"/><circle fill="#fff" stroke="none" cx="56" cy="24" r=".8"/>
        <path fill="none" stroke="#72afb5" strokeWidth="1.8" d="M47 40q-8 1-15 10m20-11q7 1 11-4"/>
        <path fill="#65a2ab" d="M7 48Q1 44 2 36q5 5 11 7Zm13 3q-4-4-4-10 5 2 9 6Z"/>
      </>;
    default: return null;
  }
}

export function BossesEarlySprite({ enemyKey, className }: EnemySpriteProps) {
  const index = bossesEarlyEnemies.findIndex((enemy) => enemy.key === enemyKey);
  if (index < 0) return null;
  return <svg className={['bossesEarly-sprite', className].filter(Boolean).join(' ')} data-enemy-key={enemyKey} viewBox="0 0 32 32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <g className="bossesEarly-sprite__body" stroke="#292d35" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <g transform="scale(.5)"><Figure index={index}/></g>
    </g>
  </svg>;
}
