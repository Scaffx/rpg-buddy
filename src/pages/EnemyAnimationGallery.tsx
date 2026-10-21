import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { AdventureScene, type AdventureSceneAction, type AdventureSceneFrame } from '@/components/adventure/AdventureScene';
import { ENEMY_ANIMATION_GROUPS, ENEMY_ANIMATIONS, ENEMY_PRESENTATIONS } from '@/components/adventure/enemies/registry';
import './SkillAnimationGallery.css';
import './EnemyAnimationGallery.css';

const groupKeys = Object.keys(ENEMY_ANIMATION_GROUPS);
const currentElements = ['physical', 'arcane', 'fire', 'ice', 'lightning', 'nature', 'light'];
const specialCount = ENEMY_ANIMATIONS.filter(animation => animation.kind === 'skill').length;
const bossCount = ENEMY_PRESENTATIONS.filter(enemy => enemy.kind === 'boss').length;
const creatureCount = ENEMY_PRESENTATIONS.length - bossCount;

/** Public visual previews. No player data, mutations or combat simulation. */
export default function EnemyAnimationGallery() {
  const [params, setParams] = useSearchParams();
  const groupKey = groupKeys.find(key => key === params.get('grupo')) ?? 'early';
  const group = ENEMY_ANIMATION_GROUPS[groupKey];
  const enemy = group.enemies.find(item => item.key === params.get('inimigo')) ?? group.enemies[0];
  const animations = group.animations.filter(item => item.enemyKey === enemy.key);
  const animation = animations.find(item => item.id === params.get('habilidade')) ?? animations[0];
  const [serial, setSerial] = useState(0);
  const [repeating, setRepeating] = useState(true);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const autoplay = repeating && !paused && !reduceMotion;
  useEffect(() => {
    if (!autoplay) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') setSerial(value => value + 1);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [autoplay, animation.id]);

  const select = (nextGroup: string, nextEnemy: string, nextAnimation?: string) => {
    setParams({ grupo: nextGroup, inimigo: nextEnemy, ...(nextAnimation ? { habilidade: nextAnimation } : {}) }, { replace: true });
    setSerial(value => value + 1);
  };
  const preview = animation.kind === 'skill';
  const self = animation.target === 'self';
  const frame: AdventureSceneFrame = {
    status: 'fighting', heroHp: self ? 100 : 76, heroMaxHp: 100, heroMp: 40, heroMaxMp: 40,
    enemyHp: 100, enemyMaxHp: 100, animateAction: true,
    action: { id: `enemy-preview-${animation.id}-${serial}`, actor: 'enemy', kind: animation.kind,
      skillId: preview ? animation.id : null, skillName: preview ? animation.name : null,
      damage: self ? 0 : 24, skillType: self ? 'buff' : 'dano',
      effect: currentElements.includes(animation.element) ? animation.element as AdventureSceneAction['effect'] : null },
  };

  return <main className="skill-gallery enemy-gallery">
    <header className="skill-gallery-header">
      <Link to="/previa-habilidades" className="skill-gallery-back">← Habilidades dos personagens</Link>
      <p className="skill-gallery-eyebrow">ATELIÊ DOS INIMIGOS · {ENEMY_ANIMATIONS.length} ANIMAÇÕES</p>
      <h1>Bosses e pequenas criaturas</h1>
      <p>{bossCount} bosses · {specialCount} habilidades especiais · {creatureCount} criaturas pequenas</p>
      <div className="skill-gallery-notice" role="note"><strong>Demonstração visual.</strong> Vida e dano são ilustrativos. Esta galeria não inicia combates nem altera seu personagem. Na aventura automática, os inimigos executam ataques básicos; os especiais apresentados aqui são prévias.</div>
    </header>
    <div className="skill-gallery-toolbar enemy-gallery-toolbar">
      <label>Grupo<select value={groupKey} onChange={event => { const key = event.target.value; select(key, ENEMY_ANIMATION_GROUPS[key].enemies[0].key); }}>
        {groupKeys.map(key => <option key={key} value={key}>{ENEMY_ANIMATION_GROUPS[key].label}</option>)}
      </select></label>
      <label>Inimigo<select value={enemy.key} onChange={event => select(groupKey, event.target.value)}>
        {group.enemies.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}
      </select></label>
    </div>
    <div className="enemy-gallery-layout">
      <aside className="skill-gallery-catalog enemy-gallery-catalog" aria-labelledby="enemy-gallery-actions">
        <h2 id="enemy-gallery-actions">Ações de {enemy.name}</h2>
        <div className="skill-gallery-skill-list">{animations.map(item => <button key={item.id} type="button" aria-pressed={item.id === animation.id} onClick={() => select(groupKey, enemy.key, item.id)}>
          <span>{item.name}</span><small>{item.kind === 'attack' ? 'Ataque da aventura' : 'Especial · prévia'}</small>
        </button>)}</div>
      </aside>
      <section className="skill-gallery-stage" aria-labelledby="enemy-gallery-selection">
        <div className="skill-gallery-selected">
          <span className="skill-gallery-eyebrow">{enemy.name} · {preview ? 'ESPECIAL · PRÉVIA VISUAL' : 'ATAQUE BÁSICO'}</span>
          <h2 id="enemy-gallery-selection">{animation.name}</h2><p>{animation.description}</p>
          {preview && <p className="skill-gallery-variant-note">Esta habilidade especial ainda não é executada na aventura automática. Aqui você está avaliando sua animação.</p>}
        </div>
        <AdventureScene stage={enemy.kind === 'boss' ? 10 : 3} biome={enemy.biome} heroClass="guerreiro" heroName="Herói de treino" enemyName={enemy.name} isBoss={enemy.kind === 'boss'} bossId={enemy.bossId} frame={frame} paused={paused} announceActions={false} />
        <div className="skill-gallery-playback">
          <button type="button" onClick={() => setSerial(value => value + 1)}>Repetir animação</button>
          <button type="button" aria-pressed={repeating} onClick={() => setRepeating(value => !value)}>{repeating ? 'Desligar repetição' : 'Repetir automaticamente'}</button>
          <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'Retomar animação' : 'Pausar animação'}</button>
        </div>
        {reduceMotion && <p role="note">Sua preferência por movimento reduzido está ativa. Os efeitos aparecem sem movimento.</p>}
        <p className="skill-gallery-footnote">Os ataques da aventura acompanham eventos confirmados pelo servidor. Esta entrega não ativa invocações, controle, cura, mudanças de fase ou habilidades especiais de bosses. As rotinas continuam sendo a fonte de XP e atributos.</p>
        <Link className="skill-gallery-back" to="/boss">Ir para a aventura →</Link>
      </section>
    </div>
  </main>;
}
