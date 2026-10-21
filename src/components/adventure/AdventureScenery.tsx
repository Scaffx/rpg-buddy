import type { ReactNode } from 'react';
import type { AdventureBiome } from '@/lib/adventureVisuals';
import './adventureScenery.css';
import { AdventureAmbience } from './AdventureAmbience';

const LANDSCAPES: Record<AdventureBiome, ReactNode> = {
  floresta: <>
    <path fill="#b5d7bd" d="M0 230Q120 80 270 185T570 180T960 175V400H0Z" />
    <path fill="#7faa98" d="M0 250Q130 155 300 240T650 215T960 225V400H0Z" />
    <g fill="#648e79" stroke="#5e7c69" strokeWidth="3"><path d="M65 280V130M842 275V108"/><path d="M15 200Q0 158 48 152Q32 90 87 103Q142 82 139 143Q185 161 148 201Z"/><path d="M790 175Q755 133 802 113Q786 62 841 76Q895 57 902 116Q956 132 922 178Z"/></g>
    <path fill="#a3bf83" d="M0 282Q250 256 470 283T960 272V400H0Z"/>
    <path fill="#d8c697" d="M375 277Q427 316 242 400H675Q520 320 479 279Z"/>
    <g fill="#e7e4bb" stroke="#749773" strokeWidth="2"><ellipse cx="113" cy="323" rx="16" ry="6"/><path d="m87 313 7-16 6 15m677 30 7-20 8 19m56-35 6-17 8 16"/><ellipse cx="865" cy="352" rx="19" ry="6"/></g>
  </>,
  deserto: <>
    <path fill="#d8b38c" d="m0 220 115-42 73-100 52 9 62 132 120-21 58-75 99 8 47 73 177-24 157 58V400H0Z"/>
    <path fill="#edc58c" d="M0 257Q172 140 369 242T690 232T960 208V400H0Z"/>
    <path fill="#d8a76e" d="M0 296Q246 229 433 290T960 260V400H0Z"/>
    <path fill="#f5d6a0" d="M0 328Q239 269 469 324T960 300V400H0Z"/>
    <path fill="none" stroke="#b68760" strokeWidth="3" d="M31 362q100-23 192-7m445 13q114-35 217-16M408 276q58 0 104 13"/>
    <g fill="#6f987d" stroke="#57735e" strokeWidth="3" strokeLinejoin="round"><path d="M117 291V209q0-13 12-13t12 13v33h11v-23q0-13 12-13t12 13v34q0 11-12 11h-23v27ZM813 294v-70q0-12 12-12t12 12v27h11v-36q0-12 11-12t11 12v45q0 11-12 11h-21v23Z"/></g>
    <g fill="#b77c59"><ellipse cx="76" cy="334" rx="14" ry="4"/><ellipse cx="876" cy="321" rx="17" ry="5"/></g>
  </>,
  aquatico: <>
    <path fill="#a7ced0" d="M0 222 56 188 104 199 166 164 221 213 290 201 342 231 960 219V400H0Z"/>
    <path fill="#78b4c5" d="M0 235Q260 222 480 238T960 231V400H0Z"/>
    <path fill="none" stroke="#d2eee8" strokeWidth="4" d="M30 256h110m42-7h78m407 9h106m41-13h108M330 275h152m88-8h54"/>
    <path fill="#f2dcad" d="M0 289Q242 324 449 293T960 302V400H0Z"/>
    <path fill="none" stroke="#fbf1cd" strokeWidth="7" d="M0 289Q242 324 449 293T960 302"/>
    <g fill="#7aa99b" stroke="#598481" strokeWidth="3"><path d="M839 298q-2-67 18-105" fill="none" stroke="#a88a69" strokeWidth="12"/><path d="M858 198q-39-58-77-13 37-7 77 13Zm0 0q15-63 61-33-36 5-61 33Zm0 0q51-30 67 16-34-19-67-16Zm0 0q-58-11-61 29 29-26 61-29Z"/></g>
    <g fill="#bdc8bc" stroke="#8fa99f" strokeWidth="2"><path d="m53 329 14-20 30 1 18 23Z"/><path d="m738 350 16-11 24 9-5 9Z"/></g>
    <path fill="#e9ac9f" stroke="#bd8a80" strokeWidth="2" d="m150 355 7-14 7 15 16 4-14 7-6 15-5-16-16-6Z"/>
  </>,
  gelo: <>
    <path fill="#a6bed8" d="m0 249 142-158 66 78L320 38l145 175 104-98 120 108L820 60l140 185V400H0Z"/>
    <path fill="#edf5f2" d="m98 139 44-48 49 57-26-4-22-18-18 20Zm151-4 71-97 80 96-42-15-30-34-27 39Zm517-3 54-72 60 84-33-16-25-29-23 32Z"/>
    <path fill="#b9d6df" d="M0 280Q205 186 389 267T734 261T960 251V400H0Z"/>
    <path fill="#e3efec" d="M0 306Q259 268 470 299T960 290V400H0Z"/>
    <path fill="#aacddd" d="M332 311Q485 282 617 316L762 400H173Z"/>
    <path fill="none" stroke="#d4eeef" strokeWidth="3" d="m367 324 72 18-36 16 91 20m55-54-18 18 51 22"/>
    <g stroke="#7fabc3" strokeWidth="2" fill="#c9e9ec"><path d="m73 317-17-36 8-49 20 26 17 47Z"/><path d="m871 307-17-24 7-60 21 24 8 55Z"/></g>
    <g fill="#f5faf1"><ellipse cx="76" cy="316" rx="29" ry="7"/><ellipse cx="869" cy="308" rx="28" ry="7"/><ellipse cx="131" cy="348" rx="14" ry="5"/></g>
  </>,
  vulcanico: <>
    <path fill="#a78088" d="m0 250 156-102 101 71L394 63l163 166 117-80 134 76L960 129V400H0Z"/>
    <path fill="#78576d" d="m148 266 180-148 36-60 60 4 43 69 147 140Z"/>
    <path fill="#eea17b" d="m359 100 26-31 28 1 36 42-33-12-15 16-17-15Z"/>
    <path d="M394 103q-16 43 7 61t-8 51" stroke="#f3b66f" strokeWidth="10" fill="none"/>
    <path fill="#a16f73" d="M0 286Q239 216 478 287T960 257V400H0Z"/>
    <path fill="#655361" d="M0 306Q210 270 464 304T960 289V400H0Z"/>
    <path fill="#e78e65" d="m0 357 156-22 172 34-80 31H0Zm960-35-163 17-59 61h222Z"/>
    <path fill="none" stroke="#f8c584" strokeWidth="4" d="m0 361 155-16 123 25m682-35-146 14-44 51"/>
    <g fill="#7c6370" stroke="#514553" strokeWidth="2"><path d="m66 314 14-24 28 1 17 31-36 4Z"/><path d="m835 304 15-33 24 7 17 32Z"/></g>
  </>,
  // Historical battles may still reference the former ruins biome.
  ruinas: <>
    <path fill="#a8b9bc" d="M0 270Q230 165 480 255T960 233V400H0Z"/>
    <g fill="#b4b4a6" stroke="#7f8e8c" strokeWidth="4"><path d="M82 285V139h29v146M149 283V141h31v142M75 135h111v23H75ZM806 287V121h29v166M874 288V115h29v173M801 111h106v25H801Z"/></g>
    <path fill="#9cae96" d="M0 299Q300 262 500 296T960 281V400H0Z"/>
    <path fill="#c5bea3" d="m357 293 136-3 212 110H180Z"/>
  </>,
};

export function AdventureScenery({ biome }: { biome: AdventureBiome }) {
  return <svg className={`adventure-scenery scenery-${biome}`} data-realm-scenery={biome} viewBox="0 0 960 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <rect className="realm-sky" width="960" height="400" />
    <circle className="realm-sun" cx="728" cy="87" r="33" />
    <g className="realm-clouds" fill="none" strokeLinecap="round"><path d="M78 80h81m-61-14h36M480 51h66m-49-13h29"/></g>
    {LANDSCAPES[biome]}
    <AdventureAmbience biome={biome} />
  </svg>;
}
