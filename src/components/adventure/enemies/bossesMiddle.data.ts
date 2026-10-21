import catalog from './catalog.snapshot.json';
import type { EnemyAnimationDefinition, EnemyAnimationElement, EnemyAnimationMotion, EnemyPresentation } from './types';
import type { AdventureBiome } from '@/lib/adventureVisuals';

type Visual = {
  element: EnemyAnimationElement;
  motion: EnemyAnimationMotion;
  target: 'hero' | 'self';
  motif: string;
  description: string;
};
type BossVisual = {
  id: string;
  biome: AdventureBiome;
  sprite: string;
  color: string;
  attack: Visual;
  skills: [Visual, Visual, Visual];
};

// The snapshot supplies public names and skill order. These rows describe presentation only.
const visuals: BossVisual[] = [
  {
    id: '546c3ca9-55ec-4b5f-9053-23bfed06edeb', biome: 'aquatico', sprite: 'hydra', color: '#4cc9bc',
    attack: { element: 'physical', motion: 'lunge', target: 'hero', motif: 'fang', description: 'Uma cabeça avança com presas e respingo abissal.' },
    skills: [
      { element: 'water', motion: 'lunge', target: 'hero', motif: 'triple-fang', description: 'Três pescoços mergulham juntos e deixam três marcas de mordida.' },
      { element: 'nature', motion: 'guard', target: 'self', motif: 'regrow', description: 'Brotos luminosos recompõem a silhueta das cabeças.' },
      { element: 'poison', motion: 'cast', target: 'hero', motif: 'puddle', description: 'Gotas tóxicas caem e abrem poças na linha do herói.' },
    ],
  },
  {
    id: 'b378b916-088e-485a-b647-d425f62ba76a', biome: 'ruinas', sprite: 'knight', color: '#9f8ed8',
    attack: { element: 'physical', motion: 'lunge', target: 'hero', motif: 'slash', description: 'Espada espectral corta em arco curto.' },
    skills: [
      { element: 'shadow', motion: 'lunge', target: 'hero', motif: 'rift-slash', description: 'Lâmina atravessa uma fissura violeta.' },
      { element: 'shadow', motion: 'flight', target: 'hero', motif: 'blink', description: 'Elmo some em fragmentos e reaparece junto ao alvo.' },
      { element: 'arcane', motion: 'cast', target: 'hero', motif: 'clock-rift', description: 'Anéis de relógio rachado pairam sobre uma fenda.' },
    ],
  },
  {
    id: '4d2ee5e0-6077-4cb4-9f3e-a2bfe30d44e5', biome: 'vulcanico', sprite: 'wyvern', color: '#e8d35e',
    attack: { element: 'physical', motion: 'flight', target: 'hero', motif: 'claw', description: 'Garra alada risca o ar com faíscas.' },
    skills: [
      { element: 'lightning', motion: 'flight', target: 'hero', motif: 'dive-bolt', description: 'Asas descem em mergulho com raio ramificado.' },
      { element: 'lightning', motion: 'cast', target: 'hero', motif: 'storm', description: 'Arcos elétricos pulam entre pontos da arena.' },
      { element: 'lightning', motion: 'guard', target: 'self', motif: 'speed', description: 'Três rastros elétricos circundam o wyvern.' },
    ],
  },
  {
    id: 'ebc7c507-4a1b-43d9-9d4b-715f456416e1', biome: 'ruinas', sprite: 'necromancer', color: '#a3d27b',
    attack: { element: 'physical', motion: 'cast', target: 'hero', motif: 'skull', description: 'Crânio etéreo atravessa a linha de combate.' },
    skills: [
      { element: 'shadow', motion: 'cast', target: 'hero', motif: 'skeletons', description: 'Ossos e pequenos crânios erguem uma marcha espectral.' },
      { element: 'shadow', motion: 'cast', target: 'hero', motif: 'drain', description: 'Fio de essência vai do alvo até o conjurador.' },
      { element: 'shadow', motion: 'cast', target: 'hero', motif: 'death-mark', description: 'Selo de caveira aparece sobre a sombra do herói.' },
    ],
  },
  {
    id: '56ed20e1-c3d8-4806-866e-8562c4f13b1a', biome: 'vulcanico', sprite: 'chimera', color: '#ec9a5d',
    attack: { element: 'physical', motion: 'lunge', target: 'hero', motif: 'claw', description: 'Pata leonina deixa riscos largos.' },
    skills: [
      { element: 'fire', motion: 'roar', target: 'hero', motif: 'triple-breath', description: 'Três sopros, chama, bruma e faísca, cruzam o mesmo cone.' },
      { element: 'fire', motion: 'roar', target: 'self', motif: 'three-heads', description: 'As três cabeças se acendem antes do ataque conjunto.' },
      { element: 'wind', motion: 'flight', target: 'hero', motif: 'bombard', description: 'Asas projetam três estilhaços elementais de cima.' },
    ],
  },
  {
    id: '19eedb7c-4c7a-4ab1-8b6b-85e6747b02f0', biome: 'vulcanico', sprite: 'elemental', color: '#e7b86e',
    attack: { element: 'physical', motion: 'cast', target: 'hero', motif: 'element-shard', description: 'Fragmento de quatro cores gira rumo ao alvo.' },
    skills: [
      { element: 'arcane', motion: 'guard', target: 'self', motif: 'cycle', description: 'Fogo, água, terra e ar alternam ao redor do núcleo.' },
      { element: 'arcane', motion: 'cast', target: 'hero', motif: 'converge', description: 'Dois fluxos elementais se unem numa só onda.' },
      { element: 'arcane', motion: 'slam', target: 'hero', motif: 'unstable', description: 'Núcleo instável racha e solta estilhaços coloridos.' },
    ],
  },
  {
    id: '8e85d753-ba1b-4102-832b-2b679b2f6a7d', biome: 'ruinas', sprite: 'dragon', color: '#765d9e',
    attack: { element: 'physical', motion: 'lunge', target: 'hero', motif: 'claw', description: 'Garra negra arranha em diagonal.' },
    skills: [
      { element: 'shadow', motion: 'roar', target: 'hero', motif: 'dark-breath', description: 'Cone de fumaça escura sai das mandíbulas.' },
      { element: 'shadow', motion: 'guard', target: 'self', motif: 'night-wings', description: 'Asas se abrem e projetam uma cortina de trevas.' },
      { element: 'shadow', motion: 'lunge', target: 'hero', motif: 'shadow-claws', description: 'Três garras de sombra atravessam a cortina.' },
    ],
  },
  {
    id: '95cb0311-078f-4321-ac5c-df179c882cb0', biome: 'ruinas', sprite: 'angel', color: '#f5d889',
    attack: { element: 'physical', motion: 'lunge', target: 'hero', motif: 'spear', description: 'Lança luminosa avança em linha reta.' },
    skills: [
      { element: 'light', motion: 'cast', target: 'hero', motif: 'judgment', description: 'Coluna de luz desce sobre o alvo.' },
      { element: 'light', motion: 'guard', target: 'self', motif: 'barrier', description: 'Escudo alado cobre o guardião.' },
      { element: 'light', motion: 'guard', target: 'self', motif: 'heal', description: 'Cruz dourada e penas ascendentes iluminam o corpo.' },
    ],
  },
  {
    id: '276b7306-0a0f-4843-acfd-87932f185e6d', biome: 'aquatico', sprite: 'kraken', color: '#6298c6',
    attack: { element: 'physical', motion: 'lunge', target: 'hero', motif: 'tentacle', description: 'Tentáculo chicoteia pela água.' },
    skills: [
      { element: 'water', motion: 'slam', target: 'hero', motif: 'tentacles', description: 'Vários tentáculos surgem e se fecham sobre o alvo.' },
      { element: 'shadow', motion: 'cast', target: 'hero', motif: 'ink', description: 'Nuvem de tinta azul escura cobre a área.' },
      { element: 'water', motion: 'cast', target: 'hero', motif: 'maelstrom', description: 'Anéis de água giram em redemoinho.' },
    ],
  },
  {
    id: 'e9d872a2-6549-4463-b1c2-9ef613d2a13c', biome: 'vulcanico', sprite: 'emperor', color: '#e4a858',
    attack: { element: 'physical', motion: 'lunge', target: 'hero', motif: 'claw', description: 'Garra coroada deixa brasa no ar.' },
    skills: [
      { element: 'fire', motion: 'roar', target: 'hero', motif: 'imperial-roar', description: 'Círculos de rugido partem da coroa dracônica.' },
      { element: 'fire', motion: 'roar', target: 'hero', motif: 'blue-fire', description: 'Língua de fogo azul se estende até o alvo.' },
      { element: 'arcane', motion: 'guard', target: 'self', motif: 'ancestral', description: 'Contorno de dragão colossal cresce atrás da coroa.' },
    ],
  },
  {
    id: 'feb99014-c70d-4261-9403-5bcac31f890f', biome: 'ruinas', sprite: 'lich', color: '#9acdc1',
    attack: { element: 'physical', motion: 'cast', target: 'hero', motif: 'skull', description: 'Crânio verde pálido desliza sobre o chão.' },
    skills: [
      { element: 'shadow', motion: 'slam', target: 'hero', motif: 'necro-burst', description: 'Explosão necrótica irradia ossos e sombras.' },
      { element: 'shadow', motion: 'cast', target: 'hero', motif: 'mass-summon', description: 'Silhuetas de mortos diversos se erguem em fileira.' },
      { element: 'arcane', motion: 'guard', target: 'self', motif: 'phylactery', description: 'Pequena urna arcana pulsa atrás do lich.' },
    ],
  },
  {
    id: '4da38fc9-542a-4625-9270-46fb0a178aff', biome: 'aquatico', sprite: 'wyrm', color: '#a6e6f3',
    attack: { element: 'physical', motion: 'lunge', target: 'hero', motif: 'fang', description: 'Presas geladas cortam o ar frio.' },
    skills: [
      { element: 'ice', motion: 'cast', target: 'hero', motif: 'blizzard', description: 'Flocos e lascas atravessam a arena.' },
      { element: 'ice', motion: 'cast', target: 'hero', motif: 'ice-prison', description: 'Cristais crescem em jaula ao redor do alvo.' },
      { element: 'ice', motion: 'guard', target: 'self', motif: 'ice-scales', description: 'Escamas cristalinas se alinham como armadura.' },
    ],
  },
  {
    id: '77cc0fc5-136d-498a-b06b-c2c728f0a87e', biome: 'vulcanico', sprite: 'demon', color: '#e2706b',
    attack: { element: 'physical', motion: 'lunge', target: 'hero', motif: 'claw', description: 'Unhas incandescentes deixam três riscos.' },
    skills: [
      { element: 'shadow', motion: 'cast', target: 'hero', motif: 'soul', description: 'Forma de alma é puxada para a boca demoníaca.' },
      { element: 'fire', motion: 'guard', target: 'self', motif: 'growth', description: 'Sombra de chifres cresce atrás da criatura.' },
      { element: 'fire', motion: 'cast', target: 'hero', motif: 'hell-portal', description: 'Aro infernal abre e lança chamas.' },
    ],
  },
  {
    id: '1a05cebb-528f-4691-a046-6e85e83d8253', biome: 'ruinas', sprite: 'golem', color: '#a8b4bf',
    attack: { element: 'physical', motion: 'slam', target: 'hero', motif: 'fist', description: 'Punho metálico cai com fragmentos de pedra.' },
    skills: [
      { element: 'earth', motion: 'slam', target: 'hero', motif: 'quake-fist', description: 'Punho abre rachaduras concêntricas no piso.' },
      { element: 'earth', motion: 'guard', target: 'self', motif: 'adamant-armor', description: 'Placas de adamantina se fecham ao redor do núcleo.' },
      { element: 'fire', motion: 'guard', target: 'self', motif: 'overload', description: 'Núcleo avermelha e expele faíscas entre as placas.' },
    ],
  },
  {
    id: 'c9da0e9a-e939-4a02-b32c-c283d1ee2332', biome: 'floresta', sprite: 'tree', color: '#7da86f',
    attack: { element: 'physical', motion: 'lunge', target: 'hero', motif: 'branch', description: 'Galho retorcido golpeia a linha do herói.' },
    skills: [
      { element: 'shadow', motion: 'cast', target: 'hero', motif: 'roots', description: 'Raízes negras emergem sob o alvo.' },
      { element: 'poison', motion: 'cast', target: 'hero', motif: 'spores', description: 'Esporos corrompidos se espalham como nuvem.' },
      { element: 'nature', motion: 'guard', target: 'self', motif: 'deep-regen', description: 'Raízes luminosas sobem pelo tronco.' },
    ],
  },
  {
    id: '6463f1ff-f523-492c-9db0-5721292d1688', biome: 'ruinas', sprite: 'chrononaut', color: '#9ce0df',
    attack: { element: 'physical', motion: 'cast', target: 'hero', motif: 'clock-hand', description: 'Ponteiro arcano se lança como dardo.' },
    skills: [
      { element: 'arcane', motion: 'guard', target: 'self', motif: 'rewind', description: 'Ponteiros recuam ao redor de uma silhueta refeita.' },
      { element: 'arcane', motion: 'guard', target: 'self', motif: 'accelerate', description: 'Mostradores repetidos deixam rastros rápidos.' },
      { element: 'arcane', motion: 'guard', target: 'self', motif: 'paradox', description: 'Duas silhuetas do crononauta se sobrepõem.' },
    ],
  },
  {
    id: 'ce4a9c05-13b8-4cde-8681-8039bedd72b7', biome: 'ruinas', sprite: 'basilisk', color: '#a6ab79',
    attack: { element: 'physical', motion: 'lunge', target: 'hero', motif: 'fang', description: 'Mandíbula reptiliana se fecha.' },
    skills: [
      { element: 'earth', motion: 'cast', target: 'hero', motif: 'petrify-gaze', description: 'Feixe do olho termina em fragmentos de pedra.' },
      { element: 'poison', motion: 'lunge', target: 'hero', motif: 'venom-fang', description: 'Presas gotejam veneno verde.' },
      { element: 'earth', motion: 'slam', target: 'hero', motif: 'tail-sweep', description: 'Cauda varre o chão e levanta entulho.' },
    ],
  },
  {
    id: 'd2cd2ae6-7b6f-4cee-8b8c-685073e553e9', biome: 'ruinas', sprite: 'wolf', color: '#9c9db1',
    attack: { element: 'physical', motion: 'lunge', target: 'hero', motif: 'fang', description: 'Focinho avançado fecha presas grandes.' },
    skills: [
      { element: 'shadow', motion: 'lunge', target: 'hero', motif: 'end-bite', description: 'Mandíbula sombria se fecha sobre o alvo.' },
      { element: 'shadow', motion: 'roar', target: 'hero', motif: 'wolf-howl', description: 'Ondas de uivo partem da cabeça erguida.' },
      { element: 'shadow', motion: 'guard', target: 'self', motif: 'broken-chain', description: 'Elos partidos giram em torno do lobo.' },
    ],
  },
  {
    id: 'afed68a1-72df-4cff-8f68-419addfdde6c', biome: 'vulcanico', sprite: 'djinn', color: '#e6bf85',
    attack: { element: 'physical', motion: 'cast', target: 'hero', motif: 'sand-blade', description: 'Lâmina de areia se curva até o alvo.' },
    skills: [
      { element: 'arcane', motion: 'cast', target: 'hero', motif: 'inverted-wish', description: 'Estrela de desejo gira e se inverte.' },
      { element: 'wind', motion: 'cast', target: 'hero', motif: 'sandstorm', description: 'Espirais de areia ocultam o horizonte.' },
      { element: 'arcane', motion: 'guard', target: 'self', motif: 'mirages', description: 'Quatro miragens translúcidas circundam o djinn.' },
    ],
  },
  {
    id: 'bb94dc2d-9ca4-4994-bd0a-d3255e6eea38', biome: 'vulcanico', sprite: 'titan', color: '#f07848',
    attack: { element: 'physical', motion: 'slam', target: 'hero', motif: 'stone-fist', description: 'Braço de obsidiana cai e racha o chão.' },
    skills: [
      { element: 'fire', motion: 'slam', target: 'hero', motif: 'magma-eruption', description: 'Jatos de magma escapam do corpo em todas as direções.' },
      { element: 'earth', motion: 'slam', target: 'hero', motif: 'seismic-step', description: 'Pé colossal pisa e envia ondas pelo piso.' },
      { element: 'fire', motion: 'guard', target: 'self', motif: 'volcanic-core', description: 'Núcleo vulcânico incandesce entre placas de obsidiana.' },
    ],
  },
];

export const bossesMiddleVisuals = new Map(visuals.map(visual => [`boss:${visual.id}`, visual]));
export const bossesMiddleEnemies: EnemyPresentation[] = visuals.map(visual => {
  const boss = catalog.bosses.find(entry => entry.id === visual.id);
  if (!boss) throw new Error(`Missing middle boss ${visual.id} in snapshot`);
  return { key: `boss:${boss.id}`, name: boss.name, kind: 'boss', bossId: boss.id, biome: visual.biome };
});

export const bossesMiddleAnimations: EnemyAnimationDefinition[] = visuals.flatMap(visual => {
  const boss = catalog.bosses.find(entry => entry.id === visual.id);
  if (!boss || boss.skills.length !== visual.skills.length) throw new Error(`Middle boss skill drift: ${visual.id}`);
  const enemyKey = `boss:${visual.id}`;
  return [
    { id: `${enemyKey}:attack`, enemyKey, name: 'Ataque básico', kind: 'attack', element: 'physical', motion: visual.attack.motion, target: visual.attack.target, description: visual.attack.description },
    ...boss.skills.map((skill, index) => ({ id: `${enemyKey}:skill:${index}`, enemyKey, name: skill.name, kind: 'skill' as const, element: visual.skills[index].element, motion: visual.skills[index].motion, target: visual.skills[index].target, description: visual.skills[index].description })),
  ];
});

export const bossesMiddleMotifs: Map<string, string> = new Map(visuals.flatMap(visual => [
  [`boss:${visual.id}:attack`, visual.attack.motif] as const,
  ...visual.skills.map((skill, index) => [`boss:${visual.id}:skill:${index}`, skill.motif] as const),
]));
