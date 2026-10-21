import type { ReactNode } from 'react';
import type { AdventureHeroClass } from '@/lib/adventureVisuals';
import './adventureHeroes.css';

type HeroArtwork = { legs: ReactNode; body: ReactNode; arms: ReactNode; weapon: ReactNode };
type HeroProps = { heroClass: AdventureHeroClass; className?: string };

const ink = '#303448';
const skin = '#f5c9a0';
const skinShade = '#daa57e';

function Eyes({ mood = 'bright' }: { mood?: 'bright' | 'focused' | 'gentle' }) {
  return <g stroke="none">
    <ellipse cx="31" cy="24" rx="2.7" ry={mood === 'focused' ? 3 : 3.5} fill={ink} />
    <ellipse cx="42" cy="23" rx="3" ry={mood === 'focused' ? 3.1 : 3.7} fill={ink} />
    <circle cx="32" cy="22.8" r="1" fill="#fffaf0" /><circle cx="43" cy="21.8" r="1.1" fill="#fffaf0" />
    {mood === 'focused' && <path d="m27 19 7 1m5-1 7-2" fill="none" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />}
    {mood === 'gentle' && <path d="M36 31q4 3 8-1" fill="none" stroke="#9b5e62" strokeWidth="1.5" strokeLinecap="round" />}
  </g>;
}

function Face({ shade = skin, mood = 'bright' }: { shade?: string; mood?: 'bright' | 'focused' | 'gentle' }) {
  return <>
    <path d="M20 17Q24 10 35 11Q49 12 51 22L49 29Q45 36 33 36Q22 35 20 27Z" fill={shade} />
    <path d="M21 26Q31 32 49 25L48 30Q41 37 32 35Q24 34 21 29Z" fill={skinShade} stroke="none" opacity=".55" />
    <ellipse cx="48" cy="27" rx="2.3" ry="2.5" fill={shade} />
    <Eyes mood={mood} />
    {mood !== 'gentle' && <path d="M38 31q3 2 6-1" fill="none" stroke="#9b5e62" strokeWidth="1.3" strokeLinecap="round" />}
    <ellipse cx="27" cy="29" rx="2" ry="1" fill="#eaa99a" stroke="none" opacity=".8" />
  </>;
}

const ART: Record<AdventureHeroClass, HeroArtwork> = {
  guerreiro: {
    legs: <><path d="M22 48 20 59q3 3 10 1l3-11M37 49l2 11q7 3 12-1l-4-12" fill="#435b8d" /><path d="M18 57q5 2 13 0l1 4H18ZM38 57q7 2 13-1l2 5H38Z" fill="#303b57" /><path d="m22 55 7 1m11 0 8-1" stroke="#b3c9d6" fill="none" /></>,
    body: <><path d="M19 35Q31 31 48 35L53 51Q34 57 16 50Z" fill="#416aa6" /><path d="M21 36q12-5 25 0l-3 11-20 1Z" fill="#a8bbc9" /><path d="m23 39 10 4 10-4-2 7-8 5-8-5Z" fill="#d9e6e4" stroke="none" /><path d="M30 37h7l2 11-5 5-5-5Z" fill="#dfb75f" /><path d="M17 46q16 8 35 0l1 6q-19 7-37-1Z" fill="#344c79" /><path d="M22 17Q21 6 35 6q16 0 16 12l-3 11H23Z" fill="#667eaa" /><Face mood="focused" /><path d="M19 19Q17 6 33 5q17-2 20 12l-4 3-3-7q-13-6-24 6Z" fill="#869fb8" /><path d="M20 18q15-5 31 0l-2 4q-14-3-28 1Z" fill="#d6e2de" /><path d="m34 8 1 10" stroke="#f5d27f" strokeWidth="2.5" fill="none" /></>,
    arms: <><path d="M19 36Q11 35 10 46l5 6 9-8-1-7Z" fill="#829bb9" /><path d="M48 35q8 0 10 9l-5 7-10-9Z" fill="#869fb9" /><path d="m13 48 4 2 5-5m29 2 4-4" fill="none" stroke="#e9d18c" strokeWidth="2" /><path d="M6 38q8-4 17 2l2 16Q17 62 8 55Z" fill="#49699b" /><path d="M10 42q5-2 10 1l2 10q-5 5-11 1Z" fill="#c5d6d8" /><path d="m14 45 3 8m-6-3 9-2" stroke="#e4bd70" fill="none" /></>,
    weapon: <><path d="m51 39 6-1 2 6-6 1Z" fill="#e8c28a" /><path d="M55 11 58 5l3 7-1 26-5 1Z" fill="#eaf7f5" /><path d="m58 10 1 24" stroke="#a3c4d4" strokeWidth="2" fill="none" /><path d="m49 38 15-1 1 4-15 2Z" fill="#ddbb68" /><path d="m56 42 4-1 1 14-5 1Z" fill="#705a55" /><circle cx="58" cy="57" r="2.5" fill="#edcf83" /></>,
  },
  mago: {
    legs: <><path d="M24 47v12q4 3 9 0l2-12m7 0v12q5 3 10-1l-2-12" fill="#4f3f78" /><path d="M21 58q5-2 13 0l1 3H20Zm19 0q6-2 13-1l1 4H40Z" fill="#332d51" /></>,
    body: <><path d="M22 34Q34 31 49 36l6 22Q38 63 17 57Z" fill="#654c9a" /><path d="M25 36q11-3 19 1l-2 19q-10 3-20-1Z" fill="#9073bd" /><path d="m20 56 12 3 1-19 2 19 18-2" fill="none" stroke="#b7a2d6" strokeWidth="1.8" /><path d="M30 36q6 7 11 0l-1 10-6 6-6-6Z" fill="#d9c8ee" /><circle cx="34" cy="44" r="2.7" fill="#8fe5e8" /><Face mood="bright" /><path d="M19 18Q22 8 38 9q12 1 14 14l-6-5q-8-5-21 3Z" fill="#694e9d" /><path d="M14 17Q25 6 27 2l7 5 5-4q10 8 12 17l6 4q-20-5-43 1Z" fill="#7355a7" /><path d="M23 17q15-4 28 2l2 3q-20-4-36 2Z" fill="#b49dd3" /><path d="m34 8 3 5-3 4-3-4Z" fill="#a0eaf0" stroke="none" /><path d="M15 24q21-6 42 0" fill="none" stroke="#d7c0ef" strokeWidth="2" /></>,
    arms: <><path d="M21 36q-9-1-11 11l9 4 8-12Z" fill="#765ba5" /><path d="M47 36q8 0 10 10l-8 5-8-13Z" fill="#7259a7" /><path d="M11 47q2 4 8 4l3-3-8-4Zm43-3 5 2q-1 6-8 6l-3-3Z" fill="#ccb5e7" /><circle cx="56" cy="47" r="3" fill={skin} /></>,
    weapon: <><path d="M56 18q1-3 4-2l-1 42-4 1Z" fill="#8a6158" /><path d="m56 25 2 1-1 29" stroke="#c79a77" strokeWidth="1.5" fill="none" /><path d="M56 13q-5-5-1-10 5-5 9 1 3 6-3 11Z" fill="#8bd7e9" /><path d="M58 3q-4 6 0 10 6-2 4-8Z" fill="#d8faff" stroke="none" /><circle cx="59" cy="7" r="2" fill="#fffdf1" stroke="none" /></>,
  },
  gatuno: {
    legs: <><path d="M22 47 18 59q5 3 11 1l5-11m5 0 2 11q6 2 11-2l-5-13" fill="#3a5260" /><path d="m17 57 13 1v3H15Zm24 0 12-1 2 5H40Z" fill="#263b4b" /><path d="m19 56 9 1m15 0 8-1" stroke="#8ca7a1" fill="none" /></>,
    body: <><path d="M18 35q14-6 29 0l10 19q-21 7-44 0Z" fill="#344c56" /><path d="M24 36q13-3 22 1l-1 17q-14 4-26-1Z" fill="#617a75" /><path d="m23 39 18 13-3 3-17-13Z" fill="#ab9473" /><path d="M16 51q18 6 38-1l2 5q-20 7-42 0Z" fill="#30404d" /><path d="M25 7Q40 1 49 14L54 34Q38 31 17 35L18 16Z" fill="#3c5560" /><path d="M19 15Q32 5 45 13l7 14-8-3q-11-5-20 2l-8 8Z" fill="#57716e" /><path d="M23 18q10-7 22 0l3 12q-12 9-26 0Z" fill="#d6a982" /><path d="M22 27Q34 21 48 27l-2 7q-12 6-22 0Z" fill="#546965" /><Eyes mood="focused" /><path d="M36 31q3 1 6-1" stroke="#ad7e70" fill="none" /><path d="M17 17q-3 10-4 18l11-5 1-12Z" fill="#415c62" /></>,
    arms: <><path d="M18 36Q8 35 8 48l8 4 11-12Z" fill="#4b6669" /><path d="M47 36q10 1 11 13l-9 3-9-12Z" fill="#4b6669" /><path d="m10 48 8 3m31-1 7-2" stroke="#8fa79b" strokeWidth="2" fill="none" /><circle cx="12" cy="51" r="3" fill="#d6a982" /><circle cx="54" cy="51" r="3" fill="#d6a982" /></>,
    weapon: <><path d="M4 47 13 36l3 2-5 13Z" fill="#d8e9e6" /><path d="m8 46 6-8" stroke="#ffffff" strokeWidth="1.4" fill="none" /><path d="m6 50 9 3 1-3-8-4Z" fill="#b99a68" /><path d="m10 51-2 8 4 1 4-8Z" fill="#52606a" /><path d="m52 48 8-12 3 2-5 14Z" fill="#d8e9e6" /><path d="m57 44 4-6" stroke="#fff" strokeWidth="1.4" fill="none" /><path d="m49 50 11 3 1-3-9-4Z" fill="#b99a68" /><path d="m52 52-2 8 4 1 3-8Z" fill="#52606a" /></>,
  },
  arqueiro: {
    legs: <><path d="M21 47 19 59q5 3 11 1l3-12m7 0 1 12q6 2 11-1l-4-12" fill="#586849" /><path d="m18 57 13 1 1 3H17Zm23 0 12-1 2 5H40Z" fill="#584b3d" /></>,
    body: <><path d="M14 34 8 22l8-9 8 4-1 23Z" fill="#9a714e" /><path d="m12 20 10 1M12 25l10 1m-9 4 9 1" stroke="#ddbe7c" strokeWidth="1.7" fill="none" /><path d="M16 34q17-5 32 0l8 23q-19 7-43-2Z" fill="#4b795a" /><path d="M25 36q11-4 23 0l2 18q-12 5-27 0Z" fill="#76a070" /><path d="m22 40 25 13-3 4-25-13Z" fill="#bd9c69" /><path d="M14 52q21 8 40-1l2 6q-19 7-43 0Z" fill="#36644e" /><path d="M18 16Q24 5 37 7q15 0 17 17l-6 10-26 1-7-11Z" fill="#3f7154" /><Face mood="focused" /><path d="M17 20Q19 5 38 6q16 2 16 20l-7-4q-6-9-19-6l-9 12-5-2Z" fill="#548864" /><path d="M17 23q3-7 7-10m21 2q5 4 6 8" stroke="#8caf79" strokeWidth="2" fill="none" /><path d="m18 29 5 7-7 1Z" fill="#3b6651" /></>,
    arms: <><path d="M18 36Q8 37 9 48l9 5 9-13Z" fill="#5a8b65" /><path d="M47 36q9 0 11 11l-8 5-9-13Z" fill="#5a8b65" /><path d="M10 47q3 5 9 5l3-4-9-5Zm43-4 6 4q-2 5-9 5l-3-4Z" fill="#a9c291" /><circle cx="53" cy="49" r="3.2" fill={skin} /></>,
    weapon: <><path d="M51 7Q66 30 51 55" stroke="#9d6a47" strokeWidth="4" strokeLinecap="round" fill="none" /><path d="M51 7Q58 31 51 55" stroke="#d7ab6c" strokeWidth="1.8" fill="none" /><path d="M51 7 53 31 51 55" stroke="#f1ead4" strokeWidth="1.2" fill="none" /><path d="m40 29 16 1-3-3m3 3-3 3" stroke="#ebdec1" strokeWidth="1.7" strokeLinecap="round" fill="none" /><path d="M49 27q4-2 5 3-1 3-5 3" fill="#865c44" /></>,
  },
  clerico: {
    legs: <><path d="M19 46 17 59q8 3 15 0l2-11m7 0 2 12q8 2 14-2l-5-12" fill="#c6b6c1" /><path d="m16 57 17 1v3H15Zm26 0 15-1 1 5H41Z" fill="#76667b" /></>,
    body: <><path d="M20 34q14-5 29 0l8 25q-20 7-42-1Z" fill="#e9e0ce" /><path d="M25 35q11-3 20 0l5 22q-12 5-28 0Z" fill="#f7f0dc" /><path d="m33 37-5 19 7 4 7-4-6-19Z" fill="#d9c480" /><path d="M34 42v12m-5-6h11" stroke="#fff8dc" strokeWidth="3" strokeLinecap="round" fill="none" /><path d="M17 54q18 8 38 1l2 5q-19 5-41-1Z" fill="#b2a3b8" /><Face mood="gentle" /><path d="M19 14Q30 4 44 9q8 3 9 13l-5-3q-9-8-20-4l-9 8Z" fill="#bdacc1" /><path d="M17 15q17-13 35 1l4 20-7-3-3-14Q32 12 23 22l-1 12-8 2Z" fill="#e7dddc" /><path d="M19 14q17-12 33 2" fill="none" stroke="#fff6e2" strokeWidth="2" /><path d="m32 8 4-4 4 4-4 4Z" fill="#f4d683" /></>,
    arms: <><path d="M19 35Q9 36 9 49l11 5 9-15Z" fill="#e8dfd0" /><path d="M47 35q11 0 12 13l-10 6-10-15Z" fill="#e8dfd0" /><path d="m11 49 10 4m28 0 8-5" stroke="#c4acc5" strokeWidth="2" fill="none" /><path d="m18 49 4 2m28 0 4-2" stroke="#e4c969" strokeWidth="2" fill="none" /><circle cx="55" cy="49" r="3" fill={skin} /></>,
    weapon: <><path d="M54 20q3-3 5 0l-1 39-4 1Z" fill="#ad865f" /><path d="m56 26 1 29" stroke="#e4c18b" strokeWidth="1.5" fill="none" /><path d="M56 7q9 0 9 8 0 7-8 11-8-5-8-11 0-8 7-8Z" fill="#e8c965" /><path d="M56 10q6 1 5 7l-5 5-4-6Z" fill="#fff0a9" stroke="none" /><path d="M57 2v8m-8 6h15" stroke="#fff6d2" strokeWidth="2" strokeLinecap="round" fill="none" /></>,
  },
  ferreiro: {
    legs: <><path d="M21 47 18 58q4 4 12 2l3-11m8 0 1 11q7 3 12-1l-4-12" fill="#475563" /><path d="M17 56q6 1 13 0l2 5H16Zm25 0q6 2 12 0l2 5H40Z" fill="#57463f" /><path d="m21 57 7 1m17 0 7-1" stroke="#a27d5c" fill="none" /></>,
    body: <><path d="M17 36q17-6 32 0l6 17q-19 7-41-1Z" fill="#a95d47" /><path d="M25 37q12-4 23 0l2 14q-13 5-27 1Z" fill="#cd7955" /><path d="M25 36q11 0 23 0l-2 22q-10 7-23-1Z" fill="#775849" /><path d="m27 37 17 1-2 16q-8 5-17 0Z" fill="#986b4c" /><path d="M34 39v17m-10-3q10 5 21 0" stroke="#d9ad73" strokeWidth="1.8" fill="none" /><path d="m31 47 10 1-1 6-10-1Z" fill="#604c44" /><path d="M20 17Q18 6 35 6q16 0 17 13l-3 9-26 2Z" fill="#493e45" /><Face shade="#d9a47e" mood="focused" /><path d="M18 18Q20 5 36 5q16 0 17 13l-5 1q-13-8-25 1Z" fill="#55474a" /><path d="M18 17q18-5 35 0l-2 5q-14-4-31 1Z" fill="#777075" /><path d="m35 8 2 10" stroke="#ac8b74" strokeWidth="2" fill="none" /><path d="m25 33 9 2 8-1" stroke="#674840" strokeWidth="1.6" fill="none" /></>,
    arms: <><path d="M18 36Q8 37 9 47l8 5 10-11Z" fill="#bd7055" /><path d="M48 36q10 1 11 12l-10 5-9-12Z" fill="#bd7055" /><path d="m10 46 8 5m32 1 7-5" stroke="#79615a" strokeWidth="3" fill="none" /><path d="M12 49q4-1 7 3l-3 5q-5 0-6-4Zm41 0q5-2 7 3l-3 5q-5 0-6-4Z" fill="#d9a47e" /></>,
    weapon: <><path d="m54 27 4-1 2 33-4 1Z" fill="#8c6348" /><path d="m56 28 2 27" stroke="#c49468" strokeWidth="1.5" fill="none" /><path d="M48 14q8-4 16 0l2 12q-8 4-18 1Z" fill="#9fadb5" /><path d="M49 17q7-3 14 0l1 5q-7 3-15 0Z" fill="#d4dfe0" stroke="none" /><path d="m48 24 16-1" stroke="#6d7d8d" strokeWidth="1.7" fill="none" /></>,
  },
  aprendiz: {
    legs: <><path d="M22 47 20 58q5 4 11 2l3-11m6 0 2 11q7 2 11-1l-4-12" fill="#66827b" /><path d="m19 57 13 1 1 3H18Zm23 0 12-1 2 5H41Z" fill="#5b544d" /><path d="m22 57 8 1m14 0 8-1" stroke="#bbb59a" fill="none" /></>,
    body: <><path d="M15 33Q8 36 8 49l4 9 14-2-1-22Z" fill="#a9825e" /><path d="m12 36 11 1m-12 12 13 1" stroke="#dac398" strokeWidth="2" fill="none" /><path d="M22 35q15-5 28 1l6 18q-18 7-42 0Z" fill="#699488" /><path d="M24 38q13-3 24 0l2 15q-13 5-29 1Z" fill="#8bada0" /><path d="m24 39 22 13-3 4-22-13Z" fill="#d7bd8b" /><path d="M15 52q20 7 39 1l2 4q-19 6-41-1Z" fill="#4a766f" /><Face mood="bright" /><path d="M19 16Q18 5 36 5q14 0 16 12l-6 6q-10-9-23-1Z" fill="#6a5145" /><path d="M17 16q15-12 33-3l-3 7q-14-7-26 3Z" fill="#84654f" /><path d="M23 14q13-5 23 1" stroke="#b18b66" strokeWidth="2" fill="none" /><path d="M19 33q-4 0-6 4l8 2Z" fill="#c5a779" /></>,
    arms: <><path d="M19 36Q9 36 9 47l9 5 10-12Z" fill="#83a79a" /><path d="M48 36q9 0 11 12l-10 5-9-13Z" fill="#83a79a" /><path d="m11 48 8 4m30 0 8-4" stroke="#c4d0aa" strokeWidth="2" fill="none" /><circle cx="55" cy="49" r="3" fill={skin} /></>,
    weapon: <><path d="M55 19q3-2 5 1l-1 38-4 1Z" fill="#8d674f" /><path d="m57 27 1 27" stroke="#b99068" strokeWidth="1.7" fill="none" /><path d="M51 8q5-5 11-1l2 8q-4 9-11 8l-5-7Z" fill="#b18a61" /><path d="M52 10q5-4 9-1l1 4q-5 5-11 2Z" fill="#d2aa75" stroke="none" /><path d="m50 18 7 3" stroke="#806049" strokeWidth="1.5" fill="none" /></>,
  },
};

/** Rounded native SVG artwork drawn on a 64-unit grid inside the existing 32-unit scene contract. */
export function AdventureHeroSprite({ heroClass, className }: HeroProps) {
  const art = ART[heroClass];
  return <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false" data-hero-class={heroClass} data-art-version="heroes-2">
    <g className="adventure-hero-legs"><g transform="scale(.5)" stroke={ink} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">{art.legs}</g></g>
    <g className="adventure-hero-body"><g transform="scale(.5)" stroke={ink} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">{art.body}</g></g>
    <g className="adventure-hero-arms"><g transform="scale(.5)" stroke={ink} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">{art.arms}</g></g>
    <g className="adventure-hero-weapon"><g transform="scale(.5)" stroke={ink} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">{art.weapon}</g></g>
  </svg>;
}
