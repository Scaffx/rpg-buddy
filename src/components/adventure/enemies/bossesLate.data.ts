import type { EnemyAnimationDefinition, EnemyPresentation } from './types';

// Presentation metadata only. Skill order, spelling and boss IDs follow catalog.snapshot.json.
export type BossesLateMotif =
  | 'claw' | 'breath' | 'cry' | 'rune' | 'crystal' | 'spiral' | 'mend'
  | 'gravity' | 'fang' | 'flame' | 'rebirth' | 'eclipse' | 'burst'
  | 'ward' | 'summon' | 'spear' | 'raven' | 'hammer' | 'hex'
  | 'tide' | 'quake' | 'beam' | 'scythe' | 'clock' | 'shroud'
  | 'pillar' | 'duel' | 'devour' | 'pressure' | 'mind' | 'dive'
  | 'age' | 'erase' | 'drain' | 'core' | 'reality';

export type BossesLateForm =
  | 'sphinx' | 'dragonGhost' | 'behemoth' | 'serpent' | 'phoenix'
  | 'tiamat' | 'odin' | 'anubis' | 'poseidon' | 'bahamut'
  | 'shinigami' | 'ifrit' | 'valkyrie' | 'leviathan' | 'archlich'
  | 'lucifer' | 'chronos' | 'void' | 'gaia' | 'ragnarok';

type LateSkillSeed = {
  name: string;
  motif: BossesLateMotif;
  description: string;
  target?: 'hero' | 'self';
  element?: EnemyAnimationDefinition['element'];
};

type LateBossSeed = {
  id: string;
  name: string;
  biome: EnemyPresentation['biome'];
  form: BossesLateForm;
  body: string;
  accent: string;
  element: EnemyAnimationDefinition['element'];
  basic: { motif: BossesLateMotif; description: string };
  skills: LateSkillSeed[];
};

const bosses: LateBossSeed[] = [
  {
    id: 'ed95af86-63c1-4fb1-8785-3919590d2314', name: 'Esfinge Guardiã', biome: 'ruinas', form: 'sphinx', body: '#c89655', accent: '#f7d877', element: 'light',
    basic: { motif: 'claw', description: 'Pata leonina dourada risca três arcos diante da guardiã.' },
    skills: [
      { name: 'Enigma da Morte', motif: 'rune', description: 'Glifos de pergunta cercam o alvo e se fecham em um selo sombrio.', element: 'shadow' },
      { name: 'Garras de Ouro', motif: 'claw', description: 'Três garras douradas cruzam um brilho arcano.' },
      { name: 'Sabedoria Ancestral', motif: 'ward', description: 'Olho e anéis dourados se abrem sobre a esfinge, em postura de contra-ataque.', target: 'self' },
    ],
  },
  {
    id: 'd6fca873-8606-4f31-8345-728d64ce725c', name: 'Dragão Espectral', biome: 'ruinas', form: 'dragonGhost', body: '#667aab', accent: '#b3ebf5', element: 'shadow',
    basic: { motif: 'claw', description: 'Garra translúcida atravessa o ar em três rastros frios.' },
    skills: [
      { name: 'Sopro Espectral', motif: 'breath', description: 'Leque de névoa espectral passa por um contorno de escudo.' },
      { name: 'Fase Etérea', motif: 'shroud', description: 'A silhueta do dragão se desfaz em duas camadas fantasmagóricas.', target: 'self' },
      { name: 'Grito do Além', motif: 'cry', description: 'Ondas concêntricas de voz sombria alcançam o alvo.' },
    ],
  },
  {
    id: 'bbaef0c2-92d7-4f9f-b607-b314e1c669f9', name: 'Behemoth de Cristal', biome: 'ruinas', form: 'behemoth', body: '#547887', accent: '#87edf2', element: 'earth',
    basic: { motif: 'claw', description: 'Garra mineral pesada deixa estilhaços no impacto.' },
    skills: [
      { name: 'Fragmentação', motif: 'crystal', description: 'Estilhaços facetados se espalham do corpo até o alvo.' },
      { name: 'Prisma de Dor', motif: 'ward', description: 'Prisma de três faces se arma e devolve um raio luminoso.', target: 'self' },
      { name: 'Regeneração Cristalina', motif: 'mend', description: 'Cristais do chão sobem e se encaixam na carapaça.', target: 'self' },
    ],
  },
  {
    id: '407eef76-3cfd-40b7-8254-0283b95a1577', name: 'Serpente do Caos', biome: 'ruinas', form: 'serpent', body: '#62477c', accent: '#e590e0', element: 'arcane',
    basic: { motif: 'fang', description: 'Presas curvas avançam com um rastro de escamas violetas.' },
    skills: [
      { name: 'Inversão Gravitacional', motif: 'gravity', description: 'Fragmentos e círculos invertem seu eixo sobre o alvo.' },
      { name: 'Mordida do Caos', motif: 'fang', description: 'Presas iridescentes alternam cores elementais no salto.' },
      { name: 'Espiral Dimensional', motif: 'spiral', description: 'Espiral concêntrica dobra o espaço na direção do centro.' },
    ],
  },
  {
    id: 'bc571fd0-f6a3-4ab9-87b0-175a4faeb50d', name: 'Fênix Sombria', biome: 'vulcanico', form: 'phoenix', body: '#3c3151', accent: '#f46889', element: 'shadow',
    basic: { motif: 'claw', description: 'Talões negros cortam o ar com centelhas rubras.' },
    skills: [
      { name: 'Chama Negra', motif: 'flame', description: 'Língua de fogo negro e borda carmesim alcança o alvo.' },
      { name: 'Renascimento Sombrio', motif: 'rebirth', description: 'Cinzas giram e desenham novamente as asas da fênix.', target: 'self' },
      { name: 'Eclipse Total', motif: 'eclipse', description: 'Disco escuro cobre uma auréola vermelha e projeta sombra.' },
    ],
  },
  {
    id: '64d3d822-fc38-41ac-9be6-deb7cf8ffba5', name: 'Tiamat, Mãe dos Dragões', biome: 'vulcanico', form: 'tiamat', body: '#614767', accent: '#ffbc69', element: 'fire',
    basic: { motif: 'claw', description: 'Garra dracônica varre o campo com cinco marcas coloridas.' },
    skills: [
      { name: 'Cinco Sopros', motif: 'breath', description: 'Cinco trilhas de cores elementais se abrem em leque.' },
      { name: 'Escamas Ancestrais', motif: 'ward', description: 'Escamas hexagonais se assentam em uma barreira multicolorida.', target: 'self' },
      { name: 'Fúria Materna', motif: 'summon', description: 'Duas pequenas silhuetas dracônicas saem de um portal protetor.', target: 'self' },
    ],
  },
  {
    id: '9b71e815-8c2b-4262-b1bc-0c96de2b2f36', name: 'Odin, o Pai de Todos', biome: 'ruinas', form: 'odin', body: '#5a6689', accent: '#e5d9a1', element: 'light',
    basic: { motif: 'spear', description: 'A ponta da lança de Odin avança em um golpe curto.' },
    skills: [
      { name: 'Gungnir', motif: 'spear', description: 'Lança rúnica dourada traça uma linha reta até o alvo.' },
      { name: 'Runas Antigas', motif: 'rune', description: 'Três runas se acendem em círculo ao redor de Odin.', target: 'self' },
      { name: 'Corvos de Odin', motif: 'raven', description: 'Dois corvos cruzam a cena e marcam a posição do alvo.' },
      { name: 'Mjölnir de Thor', motif: 'hammer', description: 'Martelo desce em diagonal cercado de raios.', element: 'lightning' },
      { name: 'Trapaça de Loki', motif: 'hex', description: 'Duas imagens ilusórias se sobrepõem a um selo de sombra.', element: 'shadow' },
    ],
  },
  {
    id: '4b94c3dc-c952-4f84-9f86-4bc3949ef681', name: 'Anúbis, Guardião dos Mortos', biome: 'ruinas', form: 'anubis', body: '#423b50', accent: '#d7b36c', element: 'shadow',
    basic: { motif: 'spear', description: 'Cajado funerário golpeia à frente com brilho âmbar.' },
    skills: [
      { name: 'Julgamento da Alma', motif: 'rune', description: 'Balança e coração espectral aparecem em um selo de julgamento.' },
      { name: 'Exército de Múmias', motif: 'summon', description: 'Duas figuras enfaixadas emergem do pó da arena.' },
      { name: 'Maldição do Faraó', motif: 'hex', description: 'Olho funerário e linhas de maldição se prendem ao alvo.' },
    ],
  },
  {
    id: '66981ad9-16af-4374-b309-fe9b7bf23ed1', name: 'Poseidon, Senhor dos Mares', biome: 'aquatico', form: 'poseidon', body: '#34738c', accent: '#9be9ed', element: 'water',
    basic: { motif: 'spear', description: 'Tridente de espuma avança com três pontas.' },
    skills: [
      { name: 'Tridente Divino', motif: 'spear', description: 'Três pontas de água se alinham e atravessam o alvo.' },
      { name: 'Maremoto', motif: 'tide', description: 'Três cristas de onda crescem e cobrem a linha de combate.' },
      { name: 'Terremoto Oceânico', motif: 'quake', description: 'Fenda no fundo do mar lança pedras e espuma.' },
    ],
  },
  {
    id: '752441c6-5307-4855-954a-3587e64d9124', name: 'Bahamut, Rei dos Dragões', biome: 'ruinas', form: 'bahamut', body: '#d0d6df', accent: '#ffe8a2', element: 'light',
    basic: { motif: 'claw', description: 'Garra régia branca cruza o alvo com faísca dourada.' },
    skills: [
      { name: 'Mega Flare', motif: 'beam', description: 'Feixe branco se abre em uma explosão radial de luz.' },
      { name: 'Escamas Divinas', motif: 'ward', description: 'Escamas luminosas formam uma couraça geométrica.', target: 'self' },
      { name: 'Julgamento Final', motif: 'rune', description: 'Selo celeste de julgamento desce sobre o alvo.' },
    ],
  },
  {
    id: 'da4080e6-8fed-412d-9825-daff6b1b8203', name: 'Shinigami', biome: 'ruinas', form: 'shinigami', body: '#252b43', accent: '#b6d0ec', element: 'shadow',
    basic: { motif: 'scythe', description: 'Lâmina curva da foice corta em arco pálido.' },
    skills: [
      { name: 'Foice da Morte', motif: 'scythe', description: 'Grande crescente prateado deixa uma marca sombria.' },
      { name: 'Relógio da Morte', motif: 'clock', description: 'Mostrador e ponteiros surgem sobre o alvo.' },
      { name: 'Mundo dos Mortos', motif: 'shroud', description: 'Um portal escuro envolve a silhueta do alvo.' },
    ],
  },
  {
    id: '93c0c357-84d1-4e5e-ab9a-aa24349cba8b', name: 'Ifrit, Senhor do Fogo', biome: 'vulcanico', form: 'ifrit', body: '#8e3c37', accent: '#ffcb65', element: 'fire',
    basic: { motif: 'claw', description: 'Punho ígneo deixa três riscos de brasas.' },
    skills: [
      { name: 'Inferno Absoluto', motif: 'flame', description: 'Frente de chamas abre uma parede de fogo no alvo.' },
      { name: 'Forma de Magma', motif: 'mend', description: 'Lava sobe em placas pelo corpo do Ifrit.', target: 'self' },
      { name: 'Pilar de Fogo', motif: 'pillar', description: 'Coluna vertical de labaredas nasce sob o alvo.' },
    ],
  },
  {
    id: 'a2453fde-e20e-4563-ba24-5a502284ce5c', name: 'Valquíria Suprema', biome: 'ruinas', form: 'valkyrie', body: '#d8d9e3', accent: '#f5e18a', element: 'light',
    basic: { motif: 'spear', description: 'Ponta da lança alada estoca em direção ao herói.' },
    skills: [
      { name: 'Lança de Luz', motif: 'spear', description: 'Lança de luz deixa um corredor luminoso.' },
      { name: 'Escolha da Valquíria', motif: 'duel', description: 'Duas lanças cruzadas enquadram o alvo escolhido.' },
      { name: 'Bênção de Valhalla', motif: 'summon', description: 'Guerreiros luminosos erguem lanças atrás da valquíria.', target: 'self' },
    ],
  },
  {
    id: 'd9b464e9-0b6f-4b8e-9f49-6400f14fb4d7', name: 'Leviathan Cósmico', biome: 'aquatico', form: 'leviathan', body: '#276c86', accent: '#88d5e9', element: 'water',
    basic: { motif: 'fang', description: 'Mandíbula marinha salta com dentes de espuma.' },
    skills: [
      { name: 'Devorar Continente', motif: 'devour', description: 'Boca imensa fecha sobre uma faixa de chão.' },
      { name: 'Pressão Oceânica', motif: 'pressure', description: 'Anéis de água comprimem o espaço ao redor do alvo.' },
      { name: 'Redemoinho Abissal', motif: 'spiral', description: 'Água em espiral desce em um funil abissal.' },
    ],
  },
  {
    id: '81dfd521-17a7-4209-b8c4-bdc907ca29b9', name: 'Archlich Eterno', biome: 'ruinas', form: 'archlich', body: '#47465a', accent: '#90f0bb', element: 'shadow',
    basic: { motif: 'scythe', description: 'Mão ossuda lança um talho necromântico.' },
    skills: [
      { name: 'Necroapocalipse', motif: 'quake', description: 'Fendas escuras e ossos brotam do solo.' },
      { name: 'Controle Mental', motif: 'mind', description: 'Espiral de linhas mentais se fecha em um olho.' },
      { name: 'Imortalidade Verdadeira', motif: 'ward', description: 'Cinco filactérias orbitam o lich em um escudo ritual.', target: 'self' },
    ],
  },
  {
    id: '59ead268-b0fe-4023-bdc4-a73747b86ea8', name: 'Lúcifer, Anjo Caído', biome: 'ruinas', form: 'lucifer', body: '#63516c', accent: '#edabc1', element: 'shadow',
    basic: { motif: 'spear', description: 'Espada de asa escura avança em uma estocada.' },
    skills: [
      { name: 'Graça Corrompida', motif: 'beam', description: 'Feixes claro e sombrio se cruzam antes do impacto.' },
      { name: 'Tentação', motif: 'hex', description: 'Coroa de luz se fecha em um laço de sombras.' },
      { name: 'Queda Celestial', motif: 'dive', description: 'Asas descem em diagonal e abrem uma cratera visual.' },
    ],
  },
  {
    id: '8791d10c-90aa-4906-b023-47fd59cf58b9', name: 'Chronos, Deus do Tempo', biome: 'ruinas', form: 'chronos', body: '#8b795a', accent: '#f2df95', element: 'light',
    basic: { motif: 'spear', description: 'Lança do titã corta uma trilha de relógio.' },
    skills: [
      { name: 'Parar o Tempo', motif: 'clock', description: 'Ponteiros travam dentro de um mostrador sobre o alvo.' },
      { name: 'Reversão Total', motif: 'clock', description: 'Ponteiros e marcas de tempo giram visualmente em sentido reverso.', target: 'self' },
      { name: 'Envelhecimento', motif: 'age', description: 'Ampulheta derrama areia e deixa uma silhueta esmaecida.' },
    ],
  },
  {
    id: '905c8616-bd83-4697-b0f5-7755cdf6ae96', name: 'Entidade do Vazio Absoluto', biome: 'ruinas', form: 'void', body: '#26213d', accent: '#af97ef', element: 'arcane',
    basic: { motif: 'claw', description: 'Fenda violeta produz três cortes sem matéria.' },
    skills: [
      { name: 'Apagar Existência', motif: 'erase', description: 'Fragmentos de símbolos desaparecem em um retângulo vazio.' },
      { name: 'Vazio Absoluto', motif: 'shroud', description: 'Anel negro abre um vazio imóvel em torno do alvo.' },
      { name: 'Paradoxo Final', motif: 'spiral', description: 'Geometrias incompatíveis se cruzam em uma espiral.' },
    ],
  },
  {
    id: 'fd95d733-d696-4634-b178-f24d34f714a4', name: 'Gaia Corrompida', biome: 'floresta', form: 'gaia', body: '#536b4b', accent: '#db916f', element: 'nature',
    basic: { motif: 'claw', description: 'Raízes em forma de dedos varrem o herói.' },
    skills: [
      { name: 'Cataclismo Global', motif: 'quake', description: 'Fendas, onda e jato vulcânico dividem o quadro.' },
      { name: 'Absorção Planetária', motif: 'drain', description: 'Filamentos verdes recuam do alvo para o núcleo de Gaia.', target: 'self' },
      { name: 'Núcleo Exposto', motif: 'core', description: 'Casca de pedra se abre para revelar um coração luminoso.', target: 'self' },
    ],
  },
  {
    id: '99d55ad6-e29b-4690-b199-d0aa32cdecf5', name: 'Ragnarök, Destruidor de Mundos', biome: 'vulcanico', form: 'ragnarok', body: '#4b3544', accent: '#f5a66a', element: 'fire',
    basic: { motif: 'spear', description: 'Espada partida do colosso atravessa a linha de combate.' },
    skills: [
      { name: 'Fim dos Tempos', motif: 'eclipse', description: 'Sol rachado escurece e lança uma onda final.' },
      { name: 'Consumir Realidade', motif: 'reality', description: 'Ladrilhos do espaço se desprendem e somem.' },
      { name: 'Renascimento Cósmico', motif: 'rebirth', description: 'Fragmentos estelares convergem em nova silhueta.', target: 'self' },
    ],
  },
];

const motionByMotif: Record<BossesLateMotif, EnemyAnimationDefinition['motion']> = {
  claw: 'lunge', breath: 'cast', cry: 'roar', rune: 'cast', crystal: 'cast', spiral: 'cast', mend: 'guard',
  gravity: 'cast', fang: 'lunge', flame: 'cast', rebirth: 'guard', eclipse: 'cast', burst: 'slam',
  ward: 'guard', summon: 'cast', spear: 'lunge', raven: 'flight', hammer: 'slam', hex: 'cast',
  tide: 'cast', quake: 'slam', beam: 'cast', scythe: 'lunge', clock: 'cast', shroud: 'cast',
  pillar: 'cast', duel: 'cast', devour: 'lunge', pressure: 'cast', mind: 'cast', dive: 'flight',
  age: 'cast', erase: 'cast', drain: 'cast', core: 'guard', reality: 'cast',
};

export type BossesLateAnimation = EnemyAnimationDefinition & { motif: BossesLateMotif };
export type BossesLateArtwork = { enemyKey: string; form: BossesLateForm; body: string; accent: string };

export const bossesLateEnemies: EnemyPresentation[] = bosses.map(({ id, name, biome }) => ({
  key: `boss:${id}`, name, kind: 'boss', bossId: id, biome,
}));

export const bossesLateArtwork: BossesLateArtwork[] = bosses.map(({ id, form, body, accent }) => ({
  enemyKey: `boss:${id}`, form, body, accent,
}));

export const bossesLateAnimations: BossesLateAnimation[] = bosses.flatMap(({ id, element, basic, skills }) => {
  const enemyKey = `boss:${id}`;
  return [
    { id: `${enemyKey}:attack`, enemyKey, name: 'Ataque básico', kind: 'attack' as const,
      element: 'physical' as const, motion: motionByMotif[basic.motif], target: 'hero' as const,
      description: basic.description, motif: basic.motif },
    ...skills.map((skill, index) => ({
      id: `${enemyKey}:skill:${index}`, enemyKey, name: skill.name, kind: 'skill' as const,
      element: skill.element ?? element, motion: motionByMotif[skill.motif],
      target: skill.target ?? 'hero', description: skill.description, motif: skill.motif,
    })),
  ];
});
