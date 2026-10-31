import type { AdventurePetSnapshot } from '@/lib/autoAdventurePayload';
import { adventurePetBonusLabel, sustainLabel } from '@/lib/pets';
import './adventurePetCompanion.css';

type Props = {
  pet: AdventurePetSnapshot | null | undefined;
  still?: boolean;
  heroDefeated?: boolean;
};

const PET_TYPES = {
  spirit_fox: 'Raposa espiritual',
  calopsita: 'Calopsita',
  mini_necromante: 'Mini necromante',
  mini_leviata: 'Mini leviatã',
  golem_guardian: 'Golem guardião',
  mini_kraken: 'Mini kraken',
  dog: 'Cachorro',
  mini_dragao_sombrio: 'Mini dragão sombrio',
  mini_demonio_fome: 'Mini demônio da fome',
  mini_relampago: 'Mini relâmpago',
  mini_wyrm_gelo: 'Mini wyrm de gelo',
  cat: 'Gato',
} as const;

type PetType = keyof typeof PET_TYPES;
const ink = '#273447';

function Eyes({ y = 28 }: { y?: number }) {
  return <g fill={ink}><ellipse cx="26" cy={y} rx="1.7" ry="2.4" /><ellipse cx="38" cy={y} rx="1.7" ry="2.4" /></g>;
}

function PawPair({ color }: { color: string }) {
  return <g fill={color} stroke={ink} strokeWidth="1.8"><ellipse cx="24" cy="50" rx="6" ry="4" /><ellipse cx="40" cy="50" rx="6" ry="4" /></g>;
}

function PetArtwork({ type }: { type: PetType }) {
  if (type === 'dog' || type === 'cat' || type === 'spirit_fox') {
    const dog = type === 'dog';
    const cat = type === 'cat';
    const body = dog ? '#b98c63' : cat ? '#77899a' : '#e7a27f';
    const light = dog ? '#f4d8a8' : cat ? '#c8d8d5' : '#fff1d4';
    return <>
      <path className="adventure-pet-tail" d={dog ? 'M45 41Q59 39 55 30' : cat ? 'M45 42Q60 40 54 25Q52 20 48 24' : 'M45 42Q58 39 60 25Q53 30 46 29'} fill="none" stroke={body} strokeWidth={dog ? 8 : 10} strokeLinecap="round" />
      <ellipse cx="32" cy="42" rx="19" ry="13" fill={body} stroke={ink} strokeWidth="2" />
      <PawPair color={body} />
      {dog ? <><path d="M18 19Q6 17 12 34l9-3M46 19q12-2 7 15l-9-4" fill="#815b4d" stroke={ink} strokeWidth="2" /><path d="M15 37q-4-6-5-11" fill="none" stroke="#ab7d59" strokeWidth="2" /></>
        : <><path d="M17 23 16 9l13 9m18 5 1-14-13 9" fill={cat ? '#8c9caa' : '#e7a27f'} stroke={ink} strokeWidth="2" strokeLinejoin="round" /><path d="m19 19-1-6 7 7m20-1 1-6-7 7" fill="#f1b4ad" /></>}
      <ellipse cx="32" cy="29" rx="18" ry="16" fill={body} stroke={ink} strokeWidth="2" />
      <path d="M20 32q12 9 24 0l-3 9q-9 6-18 0Z" fill={light} />
      <Eyes y={27} />
      <path d="m29 34 3 2 3-2q-3-3-6 0Z" fill={dog ? '#5d4b4b' : '#a65d68'} />
      {dog ? <><path className="adventure-pet-dog-mouth" d="M28 38q4 7 8 0Z" fill="#a65064" stroke={ink} strokeWidth="1" /><path d="M32 36v2" stroke={ink} strokeWidth="1.3" /><path d="M18 38q-3 1-4 4m32-4q3 1 4 4" stroke="#f2d6ae" strokeWidth="2" fill="none" /></>
        : <><path d="M29 38q3 3 6 0m-10-3-8-2m8 5-8 1m22-4 8-2m-8 5 8 1" fill="none" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />{!cat && <path d="M12 26q-3-11 5-17m30 0q8 6 5 17" fill="none" stroke="#ffdfaa" strokeWidth="2" />}</>}
      {cat && <path d="M30 43q3 3 6 0" fill="none" stroke="#e4d8ce" strokeWidth="2" />}
      {type === 'spirit_fox' && <><circle cx="9" cy="19" r="2" fill="#a4e7f0" /><circle cx="55" cy="14" r="2.5" fill="#a4e7f0" /><path d="M19 47q13 5 26 0" fill="none" stroke="#a4e7f0" strokeWidth="2" /></>}
    </>;
  }

  if (type === 'calopsita') return <>
    <path d="M31 22 27 5l7 11 7-8-3 16" fill="#f5d36f" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
    <path d="M19 34q-11 2-10 15l13-3m23-12q11 2 10 15l-13-3" fill="#eec76e" stroke={ink} strokeWidth="2" />
    <ellipse cx="32" cy="36" rx="17" ry="19" fill="#f7e2a0" stroke={ink} strokeWidth="2" />
    <path d="M17 37q-6 5-2 14l10-4m22-10q6 5 2 14l-10-4" fill="#e8c66f" stroke={ink} strokeWidth="1.6" />
    <circle cx="19" cy="38" r="4.5" fill="#ee9a7e" /><circle cx="45" cy="38" r="4.5" fill="#ee9a7e" />
    <Eyes y={32} /><path d="m28 39 4 5 4-5Z" fill="#d1805c" stroke={ink} strokeWidth="1.5" />
    <path d="m25 55-2 5m17-5 2 5" stroke={ink} strokeWidth="2" strokeLinecap="round" />
  </>;

  if (type === 'mini_necromante') return <>
    <path d="M19 35q13-7 26 0l8 21q-20 8-42 0Z" fill="#5d4b80" stroke={ink} strokeWidth="2" />
    <path d="M22 39q10 4 20 0l4 14q-13 5-28 0Z" fill="#9175ad" /><path d="m32 40-3 12 3 3 3-3Z" fill="#9cddc3" />
    <path d="M17 34Q15 12 32 10q17 2 15 24l-8 6H25Z" fill="#453d69" stroke={ink} strokeWidth="2" />
    <ellipse cx="32" cy="28" rx="12" ry="11" fill="#e2cfbd" /><Eyes y={27} />
    <path d="M28 33q4 3 8 0" fill="none" stroke={ink} strokeWidth="1.5" />
    <path d="M16 20q7-12 16-13 12 2 16 13l-8-2q-7-7-16 0Z" fill="#76629a" stroke={ink} strokeWidth="1.8" />
    <path d="M51 20v34" stroke="#815f5e" strokeWidth="3" strokeLinecap="round" /><circle cx="51" cy="17" r="6" fill="#a1e4be" stroke={ink} strokeWidth="1.5" />
  </>;

  if (type === 'mini_leviata' || type === 'mini_kraken') {
    const kraken = type === 'mini_kraken';
    return <>
      {kraken ? <><path d="M20 40Q5 43 9 56q4 3 8-3m7-8Q16 52 22 60m19-15q8 10 2 15m3-20q14 3 11 16-5 3-8-2" fill="none" stroke="#7d8db8" strokeWidth="7" strokeLinecap="round" /><path d="M20 40Q5 43 9 56m37-16q14 3 11 16" fill="none" stroke="#b7b5d0" strokeWidth="2" /></>
        : <><path d="M15 36Q3 28 5 19q7 4 14 3m30 14q12-9 10-17-7 4-14 3" fill="#7eb9c2" stroke={ink} strokeWidth="2" /><path d="M24 50q-8 6-16 3m32-3q8 6 16 3" fill="none" stroke="#7298b5" strokeWidth="5" strokeLinecap="round" /><path d="M24 18 17 6l13 9m10 3 7-12-13 9" fill="#a8e5dc" stroke={ink} strokeWidth="1.5" /></>}
      <ellipse cx="32" cy="35" rx={kraken ? 20 : 18} ry="18" fill={kraken ? '#858eb7' : '#81c6ce'} stroke={ink} strokeWidth="2" />
      <path d="M22 40q10 7 20 0" fill="none" stroke={kraken ? '#c8c2d9' : '#d2f2e6'} strokeWidth="3" /><Eyes y={31} />
      <path d="M29 40q3 2 6 0" fill="none" stroke={ink} strokeWidth="1.4" />
      {kraken ? <><circle cx="16" cy="37" r="3" fill="#cbbbd2" /><circle cx="48" cy="37" r="3" fill="#cbbbd2" /></> : <path d="M19 24q13-8 26 0" fill="none" stroke="#b7e5d8" strokeWidth="2" />}
    </>;
  }

  if (type === 'golem_guardian') return <>
    <path d="M16 36 7 39l4 14 10-2m27-15 9 3-4 14-10-2" fill="#839196" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
    <path d="M20 35q12-6 24 0l5 18q-16 7-34 0Z" fill="#9eaaab" stroke={ink} strokeWidth="2" /><path d="m26 39 6 8 6-8" fill="#c6d4c5" stroke={ink} strokeWidth="1.4" />
    <path d="M19 18 28 11 43 13l5 9-2 14-12 7-14-8Z" fill="#aab8b2" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
    <path d="m19 18 10 5 13-10M20 35l10-5 16 6" fill="none" stroke="#718c89" strokeWidth="2" /><path d="m27 26 10 1" stroke="#89e1cb" strokeWidth="4" strokeLinecap="round" />
    <path d="m21 52-3 7h11l2-5m4 0 2 5h11l-4-7" fill="#778988" stroke={ink} strokeWidth="1.8" />
  </>;

  if (type === 'mini_dragao_sombrio' || type === 'mini_wyrm_gelo') {
    const ice = type === 'mini_wyrm_gelo';
    const body = ice ? '#9ac9dc' : '#626082';
    return <>
      <path d="M43 43Q59 46 56 58l-9-3" fill="none" stroke={body} strokeWidth="8" strokeLinecap="round" />
      <path d="M20 36 7 18l3 23 11 5m23-10 13-18-3 23-11 5" fill={ice ? '#c7e8ea' : '#9a87aa'} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="32" cy="42" rx="18" ry="13" fill={body} stroke={ink} strokeWidth="2" />
      <path d="M21 22 17 11l9 5 6-9 6 9 9-5-4 13" fill={body} stroke={ink} strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="32" cy="30" rx="17" ry="15" fill={body} stroke={ink} strokeWidth="2" />
      <path d="M24 36q8 7 16 0l-3 8H27Z" fill={ice ? '#e7f7f0' : '#b8a8b8'} /><Eyes y={28} />
      <path d="m30 37 2 1 2-1" stroke={ink} strokeWidth="1.3" fill="none" />
      <PawPair color={body} />
      {ice ? <path d="m9 16 4-9m42 9-4-9M32 7V2" stroke="#defbfb" strokeWidth="2" strokeLinecap="round" /> : <path d="M32 6V2" stroke="#af9bc8" strokeWidth="2" />}
    </>;
  }

  if (type === 'mini_demonio_fome') return <>
    <path d="M18 20 15 6l13 11m18 3 3-14-13 11" fill="#aa6387" stroke={ink} strokeWidth="2" /><path d="M44 43q14-3 15 8l-7 3" fill="none" stroke="#a75d7e" strokeWidth="6" strokeLinecap="round" />
    <ellipse cx="32" cy="42" rx="18" ry="14" fill="#a85e81" stroke={ink} strokeWidth="2" /><ellipse cx="32" cy="44" rx="11" ry="8" fill="#d895aa" />
    <ellipse cx="32" cy="29" rx="17" ry="15" fill="#b97697" stroke={ink} strokeWidth="2" /><Eyes y={27} />
    <path d="M25 36q7 6 14 0l-3 7h-8Z" fill="#4f3b55" stroke={ink} strokeWidth="1.3" /><path d="m28 37 2 4 2-4m3 0 2 4 1-4" fill="#fff0df" />
    <PawPair color="#a85e81" />
  </>;

  return <>{/* mini_relampago: round storm sprite with a readable bolt silhouette */}
    <path d="M16 34q-6-11 5-16 4-12 16-8 13-3 17 10 8 8 1 16" fill="#b6dce4" stroke={ink} strokeWidth="2" />
    <path d="m31 15-8 19h8l-4 17 16-24h-9l6-12Z" fill="#f8d878" stroke={ink} strokeWidth="2" strokeLinejoin="round" />
    <path d="M18 39q-7 4-3 10m33-10q7 4 3 10" fill="none" stroke="#7fa9c4" strokeWidth="5" strokeLinecap="round" />
    <circle cx="21" cy="38" r="2" fill={ink} /><circle cx="44" cy="38" r="2" fill={ink} />
    <path d="M28 47q4 3 8 0" fill="none" stroke={ink} strokeWidth="1.5" />
    <path d="m14 17-4-5m44 4 4-5" stroke="#f5df93" strokeWidth="2" strokeLinecap="round" />
  </>;
}

function adventureSustainText(pet: AdventurePetSnapshot): string | null {
  if (!pet.sustain || pet.sustain.pct <= 0) return null;
  const label = sustainLabel(pet.sustain);
  // The legacy label says "/turno"; this scene has no pet turn animation.
  if (pet.sustain.kind === 'mp_cost') return label;
  return label?.replace(/^(\+\d+)% (HP|MP)\/turno$/, '$1% de recuperação de $2') ?? null;
}

/** Cosmetic companion for the frozen, server-owned battle pet snapshot. */
export function AdventurePetCompanion({ pet, still = false, heroDefeated = false }: Props) {
  if (!pet || !Object.prototype.hasOwnProperty.call(PET_TYPES, pet.companion_type)) return null;
  const type = pet.companion_type as PetType;
  const bonus = pet.bonus && pet.bonus.pct > 0 ? adventurePetBonusLabel(pet.bonus) : null;
  const sustain = adventureSustainText(pet);
  const description = [`${pet.name || PET_TYPES[type]} · ${PET_TYPES[type]}`, bonus && `Bônus passivo: ${bonus}`, sustain && `Efeito na aventura: ${sustain}`].filter(Boolean).join('. ');
  const inactive = still || heroDefeated;

  return <div className={`adventure-pet-companion${inactive ? ' adventure-pet-companion--still' : ''}`} data-pet-type={type} role="img" aria-label={description}>
    <span className="adventure-pet-companion__motion" aria-hidden="true">
      <svg className="adventure-pet-companion__art" viewBox="0 0 64 64" focusable="false" aria-hidden="true" shapeRendering="geometricPrecision">
        <PetArtwork type={type} />
      </svg>
    </span>
    {bonus && <span className="adventure-pet-companion__bonus" aria-hidden="true">✦</span>}
  </div>;
}
