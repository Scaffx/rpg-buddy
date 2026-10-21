import catalog from './catalog.snapshot.json';
import type { EnemyAnimationDefinition, EnemyAnimationElement, EnemyAnimationMotion, EnemyPresentation } from './types';

type Visual = [EnemyAnimationElement, EnemyAnimationMotion, 'hero' | 'self', string, string];
type BossVisual = { basic: Visual; skills: Visual[]; biome: EnemyPresentation['biome'] };

// Visual instructions follow the catalog's level and skill order. They describe poses only.
const visualByLevel: Record<number, BossVisual> = {
  1: { biome: 'floresta', basic: ['physical', 'lunge', 'hero', 'Adaga serrilhada corta em diagonal diante do goblin.', 'dagger'], skills: [
    ['physical', 'lunge', 'hero', 'Rastro de pegadas e ombro em disparada termina em impacto frontal.', 'charge'],
    ['wind', 'roar', 'hero', 'Ondas dentadas de grito atravessam a arena.', 'shout'],
  ] },
  2: { biome: 'floresta', basic: ['physical', 'lunge', 'hero', 'Mordida lupina fecha sobre o alvo.', 'bite'], skills: [
    ['physical', 'lunge', 'hero', 'Dois cortes de garra em sequência rápida.', 'double-claw'],
    ['wind', 'roar', 'self', 'Uivo crescente e silhuetas de lobos menores cercam o lobo.', 'pack'],
  ] },
  3: { biome: 'floresta', basic: ['physical', 'slam', 'hero', 'Machado pesado desce em arco.', 'axe'], skills: [
    ['physical', 'slam', 'hero', 'Machado enorme racha o chão à frente.', 'crush'],
    ['wind', 'flight', 'hero', 'Orc salta e traça um círculo cortante.', 'spin'],
    ['fire', 'roar', 'self', 'Marcas vermelhas e pulsos agressivos envolvem o orc.', 'rage'],
  ] },
  4: { biome: 'floresta', basic: ['physical', 'lunge', 'hero', 'Presas de aranha avançam em par.', 'fang'], skills: [
    ['poison', 'cast', 'hero', 'Fios verdes formam uma teia radial no alvo.', 'web'],
    ['poison', 'lunge', 'hero', 'Presas deixam duas gotas de veneno.', 'venom-bite'],
    ['earth', 'guard', 'self', 'Pernas fecham e uma carapaça facetada se ilumina.', 'shell'],
  ] },
  5: { biome: 'vulcanico', basic: ['physical', 'lunge', 'hero', 'Garra de dragão risca três trilhas.', 'dragon-claw'], skills: [
    ['fire', 'cast', 'hero', 'Cone de chamas se abre da boca do dragão.', 'flame-cone'],
    ['fire', 'flight', 'self', 'Asas batem; sombra alada sobe sobre brasas.', 'dragon-flight'],
    ['fire', 'slam', 'hero', 'Asas recolhem e um anel flamejante marca o pouso.', 'fire-ring'],
  ] },
  6: { biome: 'ruinas', basic: ['physical', 'slam', 'hero', 'Espada de osso golpeia de cima para baixo.', 'bone-sword'], skills: [
    ['physical', 'slam', 'hero', 'Clava óssea estilhaça uma guarda desenhada.', 'bone-break'],
    ['earth', 'cast', 'hero', 'Fragmentos de ossos explodem em todas as direções.', 'bone-burst'],
    ['light', 'guard', 'self', 'Ossos soltos retornam à caixa torácica.', 'bone-reform'],
  ] },
  7: { biome: 'ruinas', basic: ['physical', 'cast', 'hero', 'Runa escura lança uma pequena chama violeta.', 'shadow-bolt'], skills: [
    ['shadow', 'cast', 'hero', 'Raio escuro rasga a linha entre feiticeira e alvo.', 'dark-ray'],
    ['shadow', 'cast', 'self', 'Três silhuetas translúcidas se separam da feiticeira.', 'clones'],
    ['shadow', 'cast', 'hero', 'Runa de maldição fecha um véu sobre o alvo.', 'curse'],
  ] },
  8: { biome: 'floresta', basic: ['physical', 'lunge', 'hero', 'Casco e ponta de lança avançam juntos.', 'spear'], skills: [
    ['physical', 'lunge', 'hero', 'Lança longa abre trilha reta de galope.', 'spear-charge'],
    ['wind', 'cast', 'hero', 'Flechas descem em leque sobre a área marcada.', 'arrows'],
    ['physical', 'lunge', 'hero', 'Várias marcas de cascos cruzam a arena.', 'gallop'],
  ] },
  9: { biome: 'ruinas', basic: ['physical', 'slam', 'hero', 'Punho de pedra cai com poeira.', 'stone-fist'], skills: [
    ['earth', 'slam', 'hero', 'Punho de rocha maior deixa lascas no impacto.', 'rock-punch'],
    ['earth', 'slam', 'hero', 'Fissuras concêntricas avançam pelo chão.', 'quake'],
    ['earth', 'guard', 'self', 'Placas de pedra se encaixam no torso do golem.', 'stone-skin'],
  ] },
  10: { biome: 'vulcanico', basic: ['physical', 'flight', 'hero', 'Pena incandescente corta o ar.', 'fire-feather'], skills: [
    ['fire', 'cast', 'hero', 'Três chamas carmesins se curvam rumo ao alvo.', 'seeking-flames'],
    ['fire', 'guard', 'self', 'Brasa central acende um contorno novo de ave.', 'rebirth'],
    ['fire', 'cast', 'hero', 'Espiral vertical de fogo atravessa a arena.', 'fire-tornado'],
  ] },
  11: { biome: 'vulcanico', basic: ['physical', 'lunge', 'hero', 'Cauda de salamandra chicoteia com faíscas.', 'ember-tail'], skills: [
    ['fire', 'cast', 'hero', 'Colunas de fogo brotam do chão em sequência.', 'fire-pillars'],
    ['fire', 'guard', 'self', 'Halo de calor ondula ao redor da salamandra.', 'heat-aura'],
    ['fire', 'guard', 'self', 'Chamas entram na pele e brilham entre escamas.', 'absorb-flame'],
  ] },
  12: { biome: 'aquatico', basic: ['physical', 'cast', 'hero', 'Estilhaço de gelo parte da mão da sereia.', 'ice-shard'], skills: [
    ['ice', 'cast', 'hero', 'Jato estreito de cristais termina em floco grande.', 'frost-jet'],
    ['ice', 'cast', 'hero', 'Lâmina de gelo se espalha rente ao chão.', 'ice-slide'],
    ['ice', 'guard', 'self', 'Cristais frios convergem para a sereia.', 'ice-regen'],
  ] },
  13: { biome: 'ruinas', basic: ['physical', 'lunge', 'hero', 'Chifre do minotauro golpeia de baixo para cima.', 'horn'], skills: [
    ['physical', 'lunge', 'hero', 'Dois chifres avançam com trilhas de poeira.', 'horn-charge'],
    ['wind', 'roar', 'self', 'Rugido aparece atrás de um escudo angular.', 'defense-roar'],
    ['physical', 'lunge', 'hero', 'Três trajetórias quebradas mostram cargas sucessivas.', 'multi-charge'],
  ] },
  14: { biome: 'ruinas', basic: ['physical', 'cast', 'hero', 'Garra dourada desenha um arco de luz.', 'gold-claw'], skills: [
    ['arcane', 'cast', 'hero', 'Glifo de interrogação se abre em raios geométricos.', 'riddle'],
    ['light', 'flight', 'hero', 'Asas douradas sobem e raios descem da altura.', 'holy-flight'],
    ['light', 'guard', 'self', 'Anéis com glifos orbitam a esfinge.', 'wisdom-aura'],
  ] },
  15: { biome: 'floresta', basic: ['physical', 'slam', 'hero', 'Braço de tronco golpeia com folhas soltas.', 'branch-fist'], skills: [
    ['nature', 'cast', 'hero', 'Raízes brotam e se cruzam sobre o alvo.', 'roots'],
    ['nature', 'cast', 'hero', 'Espinhos estreitos caem em chuva oblíqua.', 'thorns'],
    ['nature', 'guard', 'self', 'Ramos crescem ao redor do titã; brotos menores surgem.', 'growth'],
  ] },
  16: { biome: 'ruinas', basic: ['physical', 'lunge', 'hero', 'Espada do guerreiro imortal brilha no corte.', 'knight-sword'], skills: [
    ['light', 'lunge', 'hero', 'Espada sagrada deixa cruz luminosa no alvo.', 'holy-sword'],
    ['light', 'guard', 'self', 'Escudo dourado expande um domo luminoso.', 'immortal-shield'],
    ['light', 'guard', 'self', 'Silhueta ajoelhada se reergue entre luzes de altar.', 'resurrection'],
  ] },
  17: { biome: 'ruinas', basic: ['physical', 'lunge', 'hero', 'Mão sombria estende dedos como garras.', 'shadow-hand'], skills: [
    ['shadow', 'lunge', 'hero', 'Mão espectral imprime uma marca escura.', 'doom-touch'],
    ['shadow', 'cast', 'hero', 'Véu circular escurece a área em torno do alvo.', 'dark-field'],
    ['shadow', 'cast', 'hero', 'Sussurros em espiral cercam duas silhuetas.', 'whispers'],
  ] },
  18: { biome: 'floresta', basic: ['physical', 'lunge', 'hero', 'Cauda da manticora estoca com ferrão.', 'stinger'], skills: [
    ['poison', 'lunge', 'hero', 'Ferrão longo deixa gota púrpura no alvo.', 'venom-sting'],
    ['poison', 'cast', 'hero', 'Esporos caem e formam três poças verdes.', 'spores'],
    ['poison', 'guard', 'self', 'Vapores sobem de uma poça em torno da manticora.', 'pool-regen'],
  ] },
  19: { biome: 'vulcanico', basic: ['physical', 'lunge', 'hero', 'Tridente do daemon fere em linha reta.', 'trident'], skills: [
    ['physical', 'lunge', 'hero', 'Tridente estende pontas e gancho de retorno.', 'trident-hook'],
    ['fire', 'cast', 'self', 'Portais acendem pequenas silhuetas demoníacas.', 'summon'],
    ['shadow', 'guard', 'self', 'Anel de sigilos demoníacos pulsa ao redor do lorde.', 'daemon-aura'],
  ] },
  20: { biome: 'aquatico', basic: ['physical', 'lunge', 'hero', 'Mandíbulas do leviatã cortam uma onda.', 'sea-bite'], skills: [
    ['water', 'cast', 'hero', 'Parede de água se ergue e dobra sobre a arena.', 'tsunami'],
    ['physical', 'lunge', 'hero', 'Corpo serpentino envolve mandíbulas abertas.', 'devour'],
    ['water', 'cast', 'hero', 'Anéis abissais comprimem a área em camadas.', 'pressure'],
  ] },
};

const earlyBosses = catalog.bosses.filter((boss) => boss.level >= 1 && boss.level <= 20);

export const bossesEarlyEnemies: EnemyPresentation[] = earlyBosses.map((boss) => ({
  key: `boss:${boss.id}`,
  name: boss.name,
  kind: 'boss',
  bossId: boss.id,
  biome: visualByLevel[boss.level].biome,
}));

export const bossesEarlyAnimations: EnemyAnimationDefinition[] = earlyBosses.flatMap((boss) => {
  const visual = visualByLevel[boss.level];
  const enemyKey = `boss:${boss.id}`;
  const define = (id: string, name: string, kind: 'attack' | 'skill', [element, motion, target, description]: Visual): EnemyAnimationDefinition => ({
    id, enemyKey, name, kind, element, motion, target, description,
  });
  return [
    define(`${enemyKey}:attack`, 'Ataque básico', 'attack', visual.basic),
    ...boss.skills.map((skill, index) => define(`${enemyKey}:skill:${index}`, skill.name, 'skill', visual.skills[index])),
  ];
});

export const bossesEarlyMotifs: Record<string, string> = Object.fromEntries(earlyBosses.flatMap((boss) => {
  const enemyKey = `boss:${boss.id}`;
  const visual = visualByLevel[boss.level];
  return [
    [`${enemyKey}:attack`, visual.basic[4]],
    ...boss.skills.map((_, index) => [`${enemyKey}:skill:${index}`, visual.skills[index][4]]),
  ];
}));
