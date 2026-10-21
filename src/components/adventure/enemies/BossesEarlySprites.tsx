import type { ReactNode } from 'react';
import type { EnemySpriteProps } from './types';
import { bossesEarlyEnemies } from './bossesEarly.data';
import './bossesEarly.css';

// Keep the public 32-unit viewBox while drawing each figure on a 64-unit grid.
function Figure({ index }: { index: number }): ReactNode {
  switch (index) {
    case 0: // Goblin: hooked ears, stitched jerkin, serrated dagger.
      return <>
        <path fill="#405c3c" d="M13 42q-6 6-3 16h9l5-12 10 1 4 11h9q1-12-8-18Z"/>
        <path fill="#a1754c" d="M15 32q10-8 25 0l5 15-13 8-20-7Z"/>
        <path fill="#c6955c" d="m17 36 12 1-2 15-11-4Zm17 1 7-4 3 13-10 5Z"/>
        <path fill="#659247" d="M13 22Q5 13 2 11q1 14 12 22l4 8q14 8 26-2l5-12 12-15q-12 2-20 12-16-12-28-2Z"/>
        <path fill="#a0bf6a" d="M13 23 7 16l10 12Zm31 3 12-10-9 14Z"/>
        <path fill="#4c7641" d="M21 19q1-12 11-14l-2 12 8 4-13 4Z"/>
        <path fill="#d1a66d" d="M19 35q5 7 12 7 10-1 13-11l-9-3Z"/>
        <path fill="#f2dec1" d="m38 35 7-3-2 7Z"/>
        <path fill="#27362d" stroke="none" d="M33 27q4-4 8 0l-2 4h-5Z"/>
        <path fill="none" stroke="#547447" d="m18 31 8-2m-7 16 6 2m7-9 4 2"/>
        <path fill="#78513c" d="m37 44 7-6 5 5-9 8Z"/>
        <path fill="#cbd4cb" d="m46 41 14-15-4 17-12 8-4-5Z"/>
        <path fill="#f3edd7" d="m47 42 9-11-3 10-7 6Z"/>
      </>;
    case 1: // Wolf: quadruped, bushy ruff, long muzzle.
      return <>
        <path fill="#596372" d="M13 38Q5 33 3 22q-2 19 12 24Z"/>
        <path fill="#7f8996" d="M8 34q8-15 28-10l12 8 4 14-13 6-27-3-8-8Z"/>
        <path fill="#a5abb0" d="M13 28q11-6 21 0l-8 13-17-1Z"/>
        <path fill="#596575" d="m13 45-5 14h8l8-12Zm23 1-1 14h8l1-16Z"/>
        <path fill="#8494a1" d="m23 46-2 14h8l3-12Zm21-3 4 16h9l-6-19Z"/>
        <path fill="#c5c5bc" d="m15 34 5-5 1 9 6-6 4 9 6-8-2 14-14 4Z"/>
        <path fill="#667282" d="M37 27q-2-12 3-20l8 12q3-9 9-11l1 17 4 12-11 10-17-7Z"/>
        <path fill="#b4b7b4" d="m41 13 4 9-6 3Zm13 1-5 11 8 1Z"/>
        <path fill="#d1d0c6" d="M46 37q8-4 16 1l-1 10-14 2-8-7Z"/>
        <path fill="#f0e7d3" d="M47 45q8 4 13 1l-8 7-9-5Z"/>
        <path fill="#2e333b" stroke="none" d="M52 29q4-3 6 1l-1 4-5 1Zm8 9q4 0 4 4l-5 2-3-4Z"/>
      </>;
    case 2: // Orc: mohawk, tusks, asymmetrical armor and broad axe.
      return <>
        <path fill="#385340" d="m17 44-4 15h9l5-13Zm19 0 3 16h10l-5-19Z"/>
        <path fill="#79563e" d="M10 30q6-9 19-9 15 0 21 11l-5 19-26 2-11-12Z"/>
        <path fill="#a8784c" d="m14 33 13 1-3 14-12-3Zm22-1 10 1 2 14-13 2Z"/>
        <path fill="#789854" d="M12 19Q13 5 29 5q18 0 20 16l2 12q-2 17-23 17Q7 45 6 30Z"/>
        <path fill="#adc27b" d="M14 20q8-11 24-5l-4 10-22 5Z"/>
        <path fill="#425d3d" d="M18 12q1-12 8-11l2 12 7-12 5 4-3 14Z"/>
        <path fill="#c4a27a" d="M16 37q6 7 16 7 10-1 13-10l-6-6-19 3Z"/>
        <path fill="#eee0ba" d="m18 37 1 10 7-6Zm22-2 4 10-7-6Z"/>
        <path fill="#293b31" stroke="none" d="M16 26q5-3 9 0l-1 4-8 1Zm17 0q6-4 10 0l-1 5-8-1Z"/>
        <path fill="#5c7949" d="M6 32q-5 1-5 12l11 3 8-11Zm43-1q10 1 11 11l-10 5-9-11Z"/>
        <path fill="#74513b" d="m51 23 5-2 1 34-5 1Z"/>
        <path fill="#b5c0b9" d="M48 18q-8-8-16-5l-5 13 12 4 8-8 8 9Z"/>
        <path fill="#e6e8d9" d="M47 17q-7-4-12-1l-4 8 8 2Z"/>
      </>;
    case 3: // Spider: eight curved legs, striped abdomen and paired fangs.
      return <>
        <path fill="none" stroke="#493b4a" strokeWidth="4.5" d="M22 30 13 14 4 20m16 16L8 29 3 40m18 2L9 46 5 58m18-28L21 8l-8-5m25 26L48 13l12 5M41 35l15-6 6 12M40 43l14 6 4 10m-18-30 2-21 8-5"/>
        <path fill="none" stroke="#ae8498" strokeWidth="1.8" d="m14 17-6 4M9 31l-4 9m6 8-4 9m41-43 9 4m0 13 4 9m-8 10 5 8"/>
        <ellipse fill="#5b4358" cx="21" cy="38" rx="18" ry="15"/>
        <path fill="#916579" d="M8 35q4-13 16-10 9 2 13 12l-9 2-6-4-8 6Z"/>
        <path fill="#c2949c" d="M15 29q5-5 11 0l-4 4-5-1Zm-2 14 6-5 5 5 5-4 4 5-6 7-11-2Z"/>
        <ellipse fill="#6b4b61" cx="44" cy="37" rx="12" ry="11"/>
        <path fill="#a36d7c" d="M36 34q8-9 17-2l-3 5-11-1Z"/>
        <path fill="#f8c0a6" stroke="none" d="M42 33a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"/>
        <path fill="#eee8d5" d="m43 45 2 10 4-7 4 7 1-11-5 3Z"/>
      </>;
    case 4: // Young dragon: jointed wings, curled tail and two horns.
      return <>
        <path fill="#85423e" d="M17 44Q5 41 5 55q6-7 12-2l8-3Z"/>
        <path fill="#b9503c" d="M13 38Q5 30 4 13l12 10 5-16 12 14 11-8-2 31-13 8Z"/>
        <path fill="#e58751" d="M16 38Q8 29 7 19l16 17Zm10-7-5-17 12 13 10-11-4 21Z"/>
        <path fill="none" stroke="#924540" d="M8 20q11 10 13 18m0-24q8 11 12 13m10-11q-10 11-12 20"/>
        <path fill="#9e493e" d="M16 36q11-9 21-7l10 9-6 14-23 1-8-10Z"/>
        <path fill="#dd975a" d="M21 42q10 4 20-2l-3 9-17 2Z"/>
        <path fill="#ab4d3e" d="m19 48-6 12h9l5-10Zm16 0-1 12h10l1-14Z"/>
        <path fill="#d46a45" d="M36 27q1-10 10-15l10 7 3 12-6 9-17-3Z"/>
        <path fill="#f0ce98" d="m42 18 2-14 7 11Zm9 0 9-9-1 15Z"/>
        <path fill="#f3bb79" d="M47 31q8-5 15 1l-3 8-12 2-7-7Z"/>
        <path fill="#f7e9c4" d="M48 40q8 3 13-1l-7 7-9-4Z"/>
        <path fill="#303039" stroke="none" d="M47 23q5-3 8 1l-1 4-6 1Z"/>
      </>;
    case 5: // Skeleton champion: crested helm, ribs, shield and sword.
      return <>
        <path fill="#5d6b78" d="m16 42-3 18h10l6-17Zm19 0 4 18h10l-4-19Z"/>
        <path fill="#aab2ab" d="M16 21q13-7 28 1l4 23-14 8-20-9Z"/>
        <path fill="#e3dbc0" d="M21 26q11-6 20 0l-3 18-7 5-11-9Z"/>
        <path fill="none" stroke="#969990" strokeWidth="2.2" d="m21 30 18 2m-19 4 18 2m-16 5 16 1m-8-17 1 21"/>
        <path fill="#808c93" d="M11 22Q3 23 2 32l10 7 9-11Zm34 0 9 4 1 11-10 4-5-13Z"/>
        <path fill="#d3c8aa" d="M18 9q3-8 14-8 12 0 14 8l-1 14-8 9-16-1-6-9Z"/>
        <path fill="#f1e6ca" d="M20 14q11-9 22 0l-2 10-8 5-10-5Z"/>
        <path fill="#68798c" d="M15 11q2-11 17-10 17 1 18 12l-5 3-4-6-18-1-5 7Z"/>
        <path fill="#bf6e60" d="M24 4Q17-2 9 3l10 4-5 5 13-4Z"/>
        <path fill="#37414a" stroke="none" d="M23 18h8l-2 6h-6Zm12 0h8l-2 6h-6Z"/>
        <path fill="#a0998a" d="m29 25 5-1 4 5H27Z"/>
        <path fill="none" stroke="#51515a" strokeWidth="1.5" d="m27 20 3 1m8-1 3 1m-7 11-5 2m4-2 5 2"/>
        <path fill="#baa97f" d="M3 32q4-6 11-4l3 19-10 9-6-9Z"/>
        <path fill="#e5d4a5" d="m4 35 7-4 3 13-7 8-4-6Z"/>
        <path fill="#b8c3c1" d="m51 30 7-18 4 3-3 36-6 1Z"/>
      </>;
    case 6: // Shadow witch: bent hat, hair, layered gown and staff orb.
      return <>
        <path fill="#392f4f" d="M13 33Q5 42 4 60h48q-2-17-13-28Z"/>
        <path fill="#70587d" d="M17 34q-5 8-6 22l13 3 9-17 10 17 8-1-9-24Z"/>
        <path fill="#a2869d" d="m20 40 10 8-11 8-8-3Z"/>
        <path fill="#312940" d="m9 54-5 6h20l6-10 6 10h16l-7-9-7 5-9-9-10 9Z"/>
        <path fill="#493a53" d="M14 24q-1-12 12-16l19 8-2 21-10 8-17-8Z"/>
        <path fill="#d4aaad" d="M21 22q9-7 18 1l-2 14-7 6-10-7Z"/>
        <path fill="#f1c9c6" d="M22 26q7-5 15 0l-1 7-7 5-7-5Z"/>
        <path fill="#292737" stroke="none" d="M31 27q4-2 6 1l-1 4-5 1Z"/>
        <path fill="#604975" d="M13 23Q18 7 25 3q6-5 13 0l-4 9q11-1 16 10Q31 27 8 26Z"/>
        <path fill="#9476a0" d="M12 22q20-5 35-1l3 3Q29 28 8 25Z"/>
        <path fill="#b5a0b7" d="M25 4q5-4 10-1l-4 6-13 9Z"/>
        <path fill="#3a3047" stroke="none" d="M31 29q3-2 5 0l-1 3h-4Z"/>
        <path fill="none" stroke="#a66d86" strokeWidth="1.4" d="m28 35 4 1"/>
        <path fill="none" stroke="#745282" strokeWidth="2.4" d="M45 36q12-5 12-18"/>
        <path fill="#caaee0" d="M55 12q7 0 6 7-2 5-8 5l-3-6Z"/>
        <path fill="#f3dbfa" stroke="none" d="M56 14q3 2 1 5l-4 1-1-3Z"/>
      </>;
    case 7: // Wounded centaur: horse body, bandaged foreleg and spear.
      return <>
        <path fill="#6b4c3c" d="M9 37Q3 32 2 22q-2 18 8 23Z"/>
        <path fill="#9e7050" d="M7 32q6-12 24-11l13 10-4 16-29 1-7-8Z"/>
        <path fill="#c69567" d="M11 29q14-9 27 3l-8 9-21-1Z"/>
        <path fill="#805b43" d="M9 44Q6 52 8 60h8l4-16Zm26-1q2 10 0 17h8l2-17Z"/>
        <path fill="#ae7d55" d="m21 44 2 16h8l-3-16Zm21-3q6 7 6 19h9l-7-22Z"/>
        <path fill="#e8d5b2" d="m47 42 7-3 4 14-8 2Z"/>
        <path fill="none" stroke="#9a6a51" strokeWidth="2" d="m49 45 7-2m-6 7 7-2"/>
        <path fill="#b4845e" d="M28 13q6-4 13 0l6 16-3 16-17-2-3-17Z"/>
        <path fill="#6d866d" d="M26 25q7-7 19-2l-2 11-15 2Z"/>
        <path fill="#d6ab80" d="M29 8q3-7 11-7 9 2 10 11l-5 10-13-1Z"/>
        <path fill="#604a3d" d="M27 8Q33-1 44 2l7 7-3 4-7-7-10 9Z"/>
        <path fill="#edc096" d="M34 12q6-5 11 1l-3 9-7-1Z"/>
        <path fill="#333941" stroke="none" d="M41 12q3-1 4 2l-2 3h-2Z"/>
        <path fill="none" stroke="#805d4a" strokeWidth="1.4" d="m36 18 4 1"/>
        <path fill="#aa7959" d="M39 25q7-4 11 2l3 12-7 2-6-10Z"/>
        <path fill="none" stroke="#e0dbca" strokeWidth="2.3" d="m54 57 7-49"/>
        <path fill="#e8e3d2" d="m59 11 3-9 1 12-4 2Z"/>
      </>;
    case 8: // Stone golem: asymmetric boulders and mossy seams.
      return <>
        <path fill="#617064" d="M11 43Q7 49 7 60h17l3-14Zm26 0 2 17h18l-7-19Z"/>
        <path fill="#818a7d" d="M13 12q13-9 31 0l10 29-9 11-27-3-11-14Z"/>
        <path fill="#a8aa9b" d="m17 16 16-8 4 17-16 7-10-6Zm25-4 10 4 1 17-13-5Z"/>
        <path fill="#687b6b" d="M17 35q9-4 18 3l13-4 5 12-9 8-29-5Z"/>
        <path fill="#a5ad96" d="m20 36 11 4-3 10-12-3Zm17 6 11-5 2 8-10 6Z"/>
        <path fill="#758878" d="M8 20Q2 21 1 31l5 19 10 2 8-14-7-12Zm42-4q9-1 12 12l-2 22-13 3-8-15Z"/>
        <path fill="#b4b6a5" d="M2 31q5-5 12-2l3 9-7 6-7-3Zm48-2q6-5 12 0l-2 13-10 5-5-7Z"/>
        <path fill="#66815e" d="M11 14q0-8 8-9l8 6-3 6-12 5Zm29-3q9-9 16-3l-6 7Z"/>
        <path fill="#dcc780" d="M23 23q5-3 8 1l-2 5-6 1Zm18-1q5-3 7 1l-2 5-6 1Z"/>
        <path fill="none" stroke="#5b7565" strokeWidth="2" d="m34 10-1 14 6 6-9 9m-14-8 8 4m31-17-5 11"/>
      </>;
    case 9: // Phoenix: swept feather wings, crest and ribbon tail.
      return <>
        <path fill="#bd4c38" d="M27 41Q6 51 7 60q8-6 18-4 6-1 9-8Z"/>
        <path fill="#ea7938" d="M31 44Q13 46 19 62q5-8 17-8Z"/>
        <path fill="#f3b554" d="M35 46Q28 52 31 62q4-9 12-12Z"/>
        <path fill="#c95138" d="M27 30Q11 27 3 9q1 20 9 32l14 7 13-9Z"/>
        <path fill="#f19440" d="M23 31Q9 24 6 16q4 20 19 27l11-6Z"/>
        <path fill="#ffd274" d="M23 35 11 30q7 10 18 10Z"/>
        <path fill="#b9473d" d="M36 31Q48 23 57 7q-2 23-12 35l-13 5Z"/>
        <path fill="#ed7939" d="M39 32q13-9 16-17-1 18-14 29l-10-5Z"/>
        <path fill="#ffcf70" d="m40 36 10-8q-4 13-13 15Z"/>
        <path fill="#e76c35" d="M27 31q7-13 17-10l9 9-3 17-11 8-17-9Z"/>
        <path fill="#ffb750" d="M30 35q7-9 15-7l3 11-8 13-12-8Z"/>
        <path fill="#fce4a5" d="M39 42q7 0 10-5l-4 11-8 4Z"/>
        <path fill="#e76c38" d="M43 23q-2-8 1-14l7 8q0-9 6-13l-1 17 5 8-8 7Z"/>
        <path fill="#ffe39a" d="m54 31 9 4-10 5-6-3Z"/>
        <path fill="#38323a" stroke="none" d="M50 26q4-2 5 2l-2 3h-3Z"/>
      </>;
    case 10: // Fire salamander: low lizard stance, curled tail and dorsal flames.
      return <>
        <path fill="#8c3d3b" d="M14 35Q4 37 3 56q6-9 17-9l6-8Z"/>
        <path fill="#b34f38" d="M9 30q9-11 31-10l12 7 9 9-7 12-26 4-21-11Z"/>
        <path fill="#ec8946" d="M11 27q5-8 12-10l1-11 7 13 5-14 5 16 8-10 2 16Z"/>
        <path fill="#ffd374" d="m20 22 3-10 5 11Zm16-1 2-10 4 12Z"/>
        <path fill="#d46a3b" d="M13 36q13-12 31-5l8 8-8 7-27-2Z"/>
        <path fill="#f2b462" d="M19 42q13 4 27-2l4 5-19 7-17-5Z"/>
        <path fill="#a8483d" d="M16 44q-8 2-12 12l8 2 12-10Zm21 3q-2 8 4 11l8-3-6-9Z"/>
        <path fill="#b74f3c" d="M45 25q9-5 16 2l2 12-8 8-15-6Z"/>
        <path fill="#efaa61" d="M52 36q6-2 11 2l-5 8-10-2Z"/>
        <path fill="#2d3338" stroke="none" d="M53 28q4-2 6 1l-1 4-5 1Z"/>
        <path fill="none" stroke="#a94b39" strokeWidth="2" d="m15 34 5 3m12-9 3 4m-23 13-6 8"/>
      </>;
    case 11: // Ice mermaid: floating hair, human face, scaled tail and forked fin.
      return <>
        <path fill="#87bdc4" d="M25 40q-13 1-14 12L3 48l4 13 11-5 9 6 3-12Z"/>
        <path fill="#4b95ae" d="M26 33q15-5 19 5 0 10-9 14-12 2-21-5l11-4Z"/>
        <path fill="#a4d8d9" d="M24 43q10 6 19-2l-4 8q-11 7-21-1Z"/>
        <path fill="none" stroke="#5a9db5" d="m22 46 4 4m1-8 5 5m2-8 5 5"/>
        <path fill="#94ccd2" d="M17 12q5-10 15-8 12 3 14 17l-5 20-12 4-16-15Z"/>
        <path fill="#c7e7e4" d="M19 25q6-7 20-3l2 13-11 8-13-10Z"/>
        <path fill="#e3d6ca" d="M23 16q10-6 18 2l-2 17-9 5-9-8Z"/>
        <path fill="#f5ece4" d="M24 20q9-6 14 2l-2 10-7 4-6-6Z"/>
        <path fill="#6caab9" d="M15 25q-5-17 4-23 12-7 24 4l4 20-7-7-4-10-13 7-4 16Z"/>
        <path fill="#d5f0ea" d="m18 7 4-7 8 4 8-4 6 8-13 4Z"/>
        <path fill="#37809d" stroke="none" d="M33 22q4-2 5 1l-1 4-4 1Z"/>
        <path fill="#264755" stroke="none" d="M32 24q4-2 6 1l-1 3-4 1Z"/>
        <path fill="none" stroke="#ac7f89" strokeWidth="1.4" d="m29 32 4 1"/>
        <path fill="#e7e7ec" d="m19 31-9 2-6 16 6 3 13-15Z"/>
        <path fill="none" stroke="#e9fbfa" strokeWidth="2.2" d="M48 10 57 3m-7 12 11-1"/>
      </>;
    case 12: // Minotaur: broad bull shoulders, massive curled horns and maze shield.
      return <>
        <path fill="#594537" d="m17 44-6 16h12l5-12Zm22 0 1 16h12l-5-19Z"/>
        <path fill="#81543d" d="M13 23q7-12 23-8 14 3 18 16l-6 20-30 2-11-17Z"/>
        <path fill="#ac7955" d="M13 26q9-8 21-5l-3 17-17 9Zm27-3q11 1 13 11l-8 12-11-10Z"/>
        <path fill="#b27e57" d="M18 13q2-10 17-11 16 0 20 17l-4 18-14 10-18-9Z"/>
        <path fill="#e6d8b0" d="M19 16Q7 15 6 3q-3 17 8 23l9-5Zm30 0Q59 15 58 3q8 17-4 24l-9-5Z"/>
        <path fill="#80543c" d="M18 9Q25-1 35 2q13-1 19 10l-8 5-10-6-11 6Z"/>
        <path fill="#d2a477" d="M35 29q12-6 20 2l-2 12-14 3-12-8Z"/>
        <path fill="#edbf8b" d="M37 31q10-4 16 0l-3 9-10 2Z"/>
        <path fill="#3d3835" stroke="none" d="M43 20q4-2 6 1l-1 4-5 1Zm2 15h3v4h-3Z"/>
        <path fill="#a89770" d="M5 33q5-7 14-3l2 18-9 10-10-8Z"/>
        <path fill="#d5c295" d="m7 34 10-1 1 13-7 8-7-5Z"/>
        <path fill="none" stroke="#846a4d" strokeWidth="2" d="m8 39 7-1-1 7-6 1 1-7m1 3 5 1"/>
      </>;
    case 13: // Desert sphinx: feline body, feathered wings and pharaonic face.
      return <>
        <path fill="#9f744b" d="M11 42Q3 36 3 22q-4 21 10 28Z"/>
        <path fill="#b88b59" d="M9 33q12-9 32-3l11 13-9 12-29-4-7-9Z"/>
        <path fill="#e2bd78" d="M15 37q14-8 29 1l-7 9-22-3Z"/>
        <path fill="#9e734d" d="m12 47-2 13h10l5-11Zm27 0 1 13h12l-5-16Z"/>
        <path fill="#c29c62" d="M16 33Q7 21 6 5l26 20 2 14Z"/>
        <path fill="#f1d793" d="M17 28 10 12l19 17-2 5Z"/>
        <path fill="none" stroke="#9d754e" d="m10 16 15 17m-13-10 12 12m-9-6 8 8"/>
        <path fill="#d3aa70" d="M31 13q5-10 15-9 12 3 13 17l-5 18-18 2-9-15Z"/>
        <path fill="#f0d19a" d="M37 18q9-5 17 2l-2 15-10 4-9-8Z"/>
        <path fill="#7c5f4d" d="M31 17q-2-9 5-14 8-5 15 1l8 8-6 5-6-8-11 12Z"/>
        <path fill="#e3bb73" d="M33 7q10-7 21 2l-3 5-16 1Z"/>
        <path fill="#303b43" stroke="none" d="M46 23q4-2 6 1l-1 4-5 1Z"/>
        <path fill="none" stroke="#ae8059" strokeWidth="1.5" d="m46 33 4 1"/>
        <path fill="#e7c899" d="m50 35 12 2-7 8-14-3Z"/>
      </>;
    case 14: // Forest titan: trunk torso, root feet and branching crown.
      return <>
        <path fill="#5b543e" d="M18 41Q8 46 4 61h15l10-15Zm21 1 5 19h16L46 43Z"/>
        <path fill="#796a48" d="M17 13q13-7 28 1l10 25-10 16-28-2-10-20Z"/>
        <path fill="#a18a59" d="M20 19q11-7 22 1l5 21-10 8-17-8Z"/>
        <path fill="#5f5038" d="M11 24Q3 22 2 34l2 18 11 2 8-18Zm39 0q8-3 12 8l-2 18-11 6-10-18Z"/>
        <path fill="#8b754d" d="m3 34 11-3 4 10-7 7-8-2Zm47-3 10 2-1 14-10 4-5-11Z"/>
        <path fill="#5f763f" d="M18 17Q7 9 10 4q7 0 14 6Q25 1 32 1q6 4 5 11 8-10 17-9 2 9-7 17Z"/>
        <path fill="#82a14e" d="M12 10q5 0 10 5l-9 5-7-4Zm23-3q7-6 15-2l-8 13-8-2Z"/>
        <path fill="none" stroke="#6f5e3e" strokeWidth="2.4" d="m30 8-3 24-8 12m8-12 12 14m-6-28 8 10"/>
        <path fill="#e3c777" d="M24 27q4-2 7 1l-2 4-5 1Zm16-1q4-2 7 1l-2 4-5 1Z"/>
        <path fill="#b49b62" d="m26 37 11-1-5 7-8-1Z"/>
        <path fill="#d5a470" d="M4 53q4-7 9-2l-1 7-9 1Z"/>
        <path fill="#f2ded0" d="M2 52q3-6 8-5l4 5Z"/>
      </>;
    case 15: // Immortal warrior: full plate, tall plume, kite shield and sword.
      return <>
        <path fill="#536678" d="m17 43-4 17h12l5-16Zm22 0 1 17h12l-5-17Z"/>
        <path fill="#a5b0b2" d="M16 19q13-8 29 0l5 26-17 10-19-10Z"/>
        <path fill="#d2d6c9" d="M21 25q11-5 21 0l-1 21-9 5-12-7Z"/>
        <path fill="#c5a55b" d="m30 26 5 1v22l-5 1Z"/>
        <path fill="#6c8191" d="M12 20Q4 22 3 33l10 7 9-17Zm36 0q10 3 12 13l-9 8-10-18Z"/>
        <path fill="#b7c1bd" d="M23 6q8-8 18-2l6 10-2 15-10 8-14-7-3-15Z"/>
        <path fill="#e1ded0" d="M25 12q8-8 16-2l2 14-9 8-12-7Z"/>
        <path fill="#637789" d="M19 14Q18 3 31 2q15-2 17 11l-5 4-5-7-13 8Z"/>
        <path fill="#c8a95e" d="M29 4Q26-2 18 1l7 4-5 6 12-4Z"/>
        <path fill="#2d3c47" stroke="none" d="M31 20h12l-3 5-10-1Z"/>
        <path fill="#bba568" d="M5 32q5-7 13-4l2 20-9 12-9-12Z"/>
        <path fill="#e3d18e" d="m6 34 9-2 2 14-7 10-6-9Z"/>
        <path fill="#d0d8d0" d="m52 33 7-19 4 3-3 40-5 1Z"/>
      </>;
    case 16: // Shadow wraith: hollow mask, torn floating cloak and reaching hands.
      return <>
        <path fill="#493d61" d="M20 7Q34-1 45 10l11 22-5 13 8 15-14-6-10 8-9-9-11 7 2-16L7 39Z"/>
        <path fill="#746286" d="M22 12q13-11 22 0l5 21-9 14-19-6-7-13Z"/>
        <path fill="#342d4c" d="M15 38q14 12 28 0l10 15-8-4-9 12-9-10-11 8 3-14-11 5Z"/>
        <path fill="#cbb3d6" d="M25 14q9-6 18 1l2 16-11 11-11-8Z"/>
        <path fill="#eee1e5" d="M27 17q6-3 13 1l1 12-7 8-8-7Z"/>
        <path fill="#77518c" stroke="none" d="M27 24q4-3 7 0l-2 5-5 1Zm9 0q4-3 7 1l-3 5-4-1Z"/>
        <path fill="#ad96b4" d="M33 31q3-2 5 0l-2 5h-4Z"/>
        <path fill="#4b3c63" d="M17 29Q8 26 2 34l1 11 11 4 8-14Zm32 0q9-4 13 4l1 12-13 4-8-14Z"/>
        <path fill="#a889b7" d="m3 43-2 9 6-4 3 8 4-10Zm55 0 5 9-7-4-2 8-5-10Z"/>
        <path fill="none" stroke="#857098" strokeWidth="2" d="m19 9-8 13m39 6 9-9"/>
      </>;
    case 17: // Manticore: leonine quadruped, feathered wings and hooked scorpion tail.
      return <>
        <path fill="none" stroke="#6e654f" strokeWidth="5" d="M12 34Q2 21 7 11q5-8 14-4"/>
        <path fill="#9d6d4b" d="m17 5 8-4-2 11-6 3Z"/>
        <path fill="#c79b69" d="M20 5q7-2 8 4l-5 6-5-3Z"/>
        <path fill="#ede0b6" d="m25 11-3 10-4-10 4 2Z"/>
        <path fill="#a97350" d="M8 31q10-12 29-8l13 8 2 18-13 5-25-4-9-11Z"/>
        <path fill="#d49d62" d="M12 33q10-7 27-3l3 13-25 2Z"/>
        <path fill="#78523e" d="m13 46-4 14h9l6-12Zm30-1 2 15h10l-5-18Z"/>
        <path fill="#bd8762" d="M18 30Q10 17 14 4l17 20-3 17Z"/>
        <path fill="#e2b18a" d="M20 27 17 11l12 17-4 6Z"/>
        <path fill="#a47a65" d="M25 30q6-18 18-21l-1 20-10 11Z"/>
        <path fill="#d0a289" d="m31 29 9-14-2 16-7 5Z"/>
        <path fill="#8b6045" d="M42 22q7-6 14 1l6 12-6 11-13-2-7-13Z"/>
        <path fill="#e5c392" d="M50 34q7-3 12 2l-3 9-10 1-6-7Z"/>
        <path fill="#f4dbb0" d="M49 42q7 4 11 1l-6 6-9-5Z"/>
        <path fill="#323139" stroke="none" d="M51 27q4-2 6 1l-1 4-5 1Z"/>
        <path fill="none" stroke="#986d52" strokeWidth="1.6" d="m50 40 6 1"/>
        <path fill="#6e7655" d="m16 7 8-6 4 8-6 5Z"/>
      </>;
    case 18: // Daemon lord: swept horns, bat wings, robe armor and trident.
      return <>
        <path fill="#4e344b" d="M17 20Q8 10 3 5l2 25 14 13 7-18Zm27 0Q54 10 60 4l-2 27-13 13-7-18Z"/>
        <path fill="#80505d" d="M13 23 8 15l2 15 12 10Zm34 1 9-10-1 17-13 9Z"/>
        <path fill="#592f48" d="m16 43-6 17h13l7-16Zm23 0 4 17h13l-8-19Z"/>
        <path fill="#8f454b" d="M16 27q8-10 25-6l11 13-5 19-28 2-9-16Z"/>
        <path fill="#bc6b58" d="m21 31 16-6 9 9-4 13-18 2Z"/>
        <path fill="#65374b" d="M20 12q9-8 21-4l8 14-4 17-14 9-17-12-2-14Z"/>
        <path fill="#ae5c57" d="M21 19q10-8 22 0l3 13-11 11-13-8Z"/>
        <path fill="#dba274" d="M20 17Q9 11 11 1q-8 11 2 23l10 2Zm23 0Q54 10 52 1q9 11 1 23l-10 2Z"/>
        <path fill="#e28865" d="M26 23q8-4 15 0l1 11-8 6-9-7Z"/>
        <path fill="#342a39" stroke="none" d="M27 25q4-2 6 1l-1 4-5 1Zm10 0q4-2 6 1l-1 4-5 1Z"/>
        <path fill="#753d4b" d="M46 34q8-2 10 8l-6 5-8-9Z"/>
        <path fill="none" stroke="#d4b178" strokeWidth="2.6" d="m56 59 2-44m-5 1 5 5 5-5m-8-6 3 8 4-8"/>
      </>;
    case 19: // Ancient leviathan: coiled aquatic body, fins, barbels and jaws.
      return <>
        <path fill="#316579" d="M3 53Q-1 31 16 24q14-5 24 8l-8 10Q21 31 13 43q-4 8 3 13Z"/>
        <path fill="#5a9ba7" d="M8 49q-3-14 8-18 8-4 17 2l-5 5q-9-5-14 1-4 4-1 12Z"/>
        <path fill="#397689" d="M14 49q14-13 29-5l6 10-15 7-22-2Z"/>
        <path fill="#7ab4b5" d="M17 50q11-7 24-2l4 8-14 4-16-4Z"/>
        <path fill="#4c8e9c" d="M20 29 15 12l13 9 4-16 9 13 7-10 3 18Z"/>
        <path fill="#a4cebf" d="m18 18 9 8-3 4Zm15-9 5 12-9 6Z"/>
        <path fill="#438495" d="M35 19q6-13 18-11l9 13-1 18-13 11-14-11Z"/>
        <path fill="#78b5bb" d="M41 20q8-9 15-5l6 9-4 13-15 3-8-10Z"/>
        <path fill="#a5d0c8" d="M49 32q8-3 14 1l-2 11-11 4-10-7Z"/>
        <path fill="#ebebd6" d="m45 39 5 6 4-6 4 5 3-6 2 6-10 11-12-8Z"/>
        <path fill="#263744" stroke="none" d="M51 23q4-3 7 1l-1 4-6 1Z"/>
        <path fill="none" stroke="#75aeb6" strokeWidth="2" d="M43 38Q33 41 27 52m22-16q9 2 13-3"/>
        <path fill="#558e9a" d="M6 47 2 36l10 7Zm13 4-4-10 10 5Z"/>
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
