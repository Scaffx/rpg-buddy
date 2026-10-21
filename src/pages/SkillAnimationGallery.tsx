import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { AdventureScene, type AdventureSceneFrame } from '@/components/adventure/AdventureScene';
import { CLASS_ANIMATIONS } from '@/components/adventure/skills/registry';
import type { SkillAnimationClass } from '@/components/adventure/skills/types';
import catalog from '@/components/adventure/skills/catalog.snapshot.json';
import type { AdventureBiome } from '@/lib/adventureVisuals';
import './SkillAnimationGallery.css';

const classKeys = Object.keys(CLASS_ANIMATIONS) as SkillAnimationClass[];
const biomes: { id: AdventureBiome; label: string }[] = [{id:'floresta',label:'Floresta'}, {id:'aquatico',label:'Costa'}, {id:'ruinas',label:'Ruínas'}, {id:'vulcanico',label:'Vulcão'}];
const total = classKeys.reduce((sum, key) => sum + CLASS_ANIMATIONS[key].skills.length, 0);

/** Public visual playground: no player hooks, mutations, battle scheduler or rewards. */
export default function SkillAnimationGallery() {
  const [params, setParams] = useSearchParams();
  const rawClass = params.get('classe');
  const heroClass = classKeys.find(key => key === rawClass) ?? 'mago';
  const group = CLASS_ANIMATIONS[heroClass];
  const skill = group.skills.find(item => item.id === params.get('habilidade')) ?? group.skills[0];
  const [serial, setSerial] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [paused, setPaused] = useState(false);
  const [biome, setBiome] = useState<AdventureBiome>('floresta');
  const reduceMotion = useReducedMotion();
  const autoplay = playing && !paused && !reduceMotion;
  useEffect(() => {
    if (!autoplay) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') setSerial(previous => previous + 1);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [autoplay, skill.id]);
  const node = catalog.find(item => item.id === skill.id);
  const sourceItem = node && 'sourceItem' in node ? node.sourceItem : null;
  const effect = (node?.effect ?? {}) as { mpCost?: number; effectType?: string; transform?: string };
  const mpCost = skill.nodeType === 'skill' && typeof effect.mpCost === 'number' ? effect.mpCost : null;
  const heal = effect.effectType === 'heal' || effect.transform === 'aura_restauradora';
  const support = skill.target === 'self';
  const frame: AdventureSceneFrame = {
    status: 'fighting', heroHp: 90, heroMaxHp: 120, heroMp: 40 - (mpCost ?? 0), heroMaxMp: 40,
    enemyHp: support ? 100 : 76, enemyMaxHp: 100, animateAction: true,
    action: { id: `preview-${skill.id}-${serial}`, actor: 'hero', kind: 'skill', skillId: skill.id,
      skillName: skill.name, effect: skill.element, damage: support ? null : 24, mpCost,
      healing: heal ? 20 : null, skillType: heal ? 'heal' : support ? 'buff' : effect.effectType ?? null },
  };
  const selectClass = (value: SkillAnimationClass) => {
    setParams({classe:value,habilidade:CLASS_ANIMATIONS[value].skills[0].id}, {replace:true});
    setSerial(previous => previous + 1);
  };
  return <main className="skill-gallery">
    <header className="skill-gallery-header">
      <Link to="/habilidades" className="skill-gallery-back">← Habilidades</Link>
      <Link to="/previa-inimigos" className="skill-gallery-back" style={{ marginLeft: 20 }}>Bosses e criaturas →</Link>
      <p className="skill-gallery-eyebrow">ATELIÊ DA AVENTURA · {total} ANIMAÇÕES</p>
      <h1>Animações de habilidades</h1>
      <p>Escolha um personagem e veja como ele prepara, lança e acerta cada habilidade.</p>
      <div className="skill-gallery-notice" role="note"><strong>Demonstração visual.</strong> Vida, mana e dano são ilustrativos. A prévia não equipa habilidades nem altera seu personagem.</div>
    </header>
    <div className="skill-gallery-toolbar">
          <label>Personagem<select value={heroClass} onChange={event => selectClass(event.target.value as SkillAnimationClass)}>{classKeys.map(key => <option key={key} value={key}>{CLASS_ANIMATIONS[key].label}</option>)}</select></label>
          <label>Cenário<select value={biome} onChange={event => setBiome(event.target.value as AdventureBiome)}>{biomes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    </div>
    <div className="skill-gallery-layout">
      <section className="skill-gallery-stage" aria-labelledby="skill-gallery-selection">
        <div className="skill-gallery-selected">
          <span className="skill-gallery-eyebrow">{group.label} · {skill.nodeType === 'variant' ? 'VARIANTE · PRÉVIA VISUAL' : 'HABILIDADE ATIVA'}</span>
          <h2 id="skill-gallery-selection">{skill.name}</h2><p>{skill.description}</p>
          {sourceItem && <p>Habilidade de arma: {sourceItem}</p>}
          {skill.nodeType === 'variant' && <p className="skill-gallery-variant-note">Esta variante ainda não tem efeito na aventura. Aqui você está avaliando a animação.</p>}
        </div>
        <AdventureScene stage={3} biome={biome} heroClass={heroClass} heroName={group.label} enemyName="Alvo de treino" isBoss={false} frame={frame} paused={paused} announceActions={false} />
        <div className="skill-gallery-playback">
          <button type="button" onClick={() => setSerial(previous => previous + 1)}>Repetir animação</button>
          <button type="button" aria-pressed={playing} onClick={() => setPlaying(value => !value)}>{playing ? 'Desligar repetição' : 'Repetir automaticamente'}</button>
          <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? 'Retomar animação' : 'Pausar animação'}</button>
        </div>
        {reduceMotion && <p role="note">Sua preferência por movimento reduzido está ativa. Os efeitos aparecem sem movimento.</p>}
        <p className="skill-gallery-footnote">Na aventura, as animações acompanham os golpes confirmados pelo servidor. Queimadura, congelamento, dano contínuo, área, passivos e variantes continuam sem efeito no combate.</p>
      </section>
      <aside className="skill-gallery-catalog" aria-labelledby="skill-gallery-list">
        <h2 id="skill-gallery-list">Habilidades de {group.label}</h2><p>{group.skills.length} animações · escolha para visualizar</p>
        <div className="skill-gallery-skill-list">{group.skills.map(item => <button key={item.id} type="button" aria-pressed={skill.id === item.id} onClick={() => {setParams({classe:heroClass,habilidade:item.id},{replace:true});setSerial(previous => previous + 1);}}><span>{item.name}</span><small>{item.nodeType === 'variant' ? 'Variante · prévia' : 'Ativa'}</small></button>)}</div>
        <div className="skill-gallery-passive-note"><h3>Sobre os passivos</h3><p>Passivos não são conjurados. Eles não recebem uma animação de ataque e ainda não alteram a aventura automática.</p></div>
      </aside>
    </div>
  </main>;
}
