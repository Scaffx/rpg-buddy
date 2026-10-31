import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { AdventureEnemySprite, AdventureHeroSprite } from './AdventureSprites';
import { BIOME_LABELS, enemyVisualVariant, type AdventureBiome, type AdventureHeroClass } from '@/lib/adventureVisuals';
import './adventureScene.css';
import { AdventureScenery } from './AdventureScenery';
import { findSkillAnimation } from './skills/registry';
import { AdventureSkillEffect } from './skills/AdventureSkillEffect';
import { findEnemyAnimation, resolveEnemyPresentation } from './enemies/registry';
import { AdventureEnemyEffect } from './enemies/AdventureEnemyEffect';
import { AdventureEnemyPortrait } from './enemies/AdventureEnemyPortrait';
import { AdventurePetCompanion } from './AdventurePetCompanion';
import { enemyActionMotion } from './enemies/enemyMotion';
import { useDamageReaction } from './useDamageReaction';
import type { HordeEnemy } from '@/lib/adventureHordeContract';
import type { HordeHit as ConfirmedHordeHit } from '@/lib/adventureHordeContract';
import type { AdventurePetSnapshot } from '@/lib/autoAdventurePayload';
import './damageReaction.css';

export type AdventureSceneAction = {
  id: string;
  actor: 'hero' | 'enemy';
  kind?: 'attack' | 'skill';
  skillName?: string | null;
  skillId?: string | null;
  damage?: number | null;
  effect?: 'physical' | 'arcane' | 'fire' | 'ice' | 'lightning' | 'nature' | 'light' | null;
  mpCost?: number | null;
  healing?: number | null;
  mpRestored?: number | null;
  rawDamage?: number | null;
  damageMultiplier?: number | null;
  effectNote?: string | null;
  skillType?: string | null;
  actorSlot?: number | null;
  targetSlot?: number | null;
  targetSlots?: number[];
  hits?: ConfirmedHordeHit[];
};

export type AdventureSceneTimedAction = AdventureSceneAction & { elapsedMs: number };

export type AdventureSceneFrame = {
  status: 'exploring' | 'fighting' | 'defeated' | 'victory' | 'transition' | 'draw';
  heroHp?: number | null;
  heroMaxHp?: number | null;
  heroMp?: number | null;
  heroMaxMp?: number | null;
  enemyHp?: number | null;
  enemyMaxHp?: number | null;
  enemyMp?: number | null;
  enemyMaxMp?: number | null;
  action?: AdventureSceneAction | null;
  animateAction?: boolean;
  actionElapsedMs?: number;
  /** Current values at the visible server event, never terminal battle totals. */
  enemies?: HordeEnemy[];
  actions?: AdventureSceneTimedAction[];
  pet?: AdventurePetSnapshot | null;
};

type Props = {
  stage: number;
  biome: AdventureBiome;
  heroClass: AdventureHeroClass;
  heroName: string;
  enemyName: string;
  isBoss: boolean;
  bossId?: string | null;
  frame: AdventureSceneFrame;
  paused: boolean;
  announceActions?: boolean;
};

const ELEMENT_NAMES: Record<NonNullable<AdventureSceneAction['effect']>, string> = {
  physical: 'Físico', arcane: 'Arcano', fire: 'Fogo', ice: 'Gelo',
  lightning: 'Raio', nature: 'Natureza', light: 'Luz',
};

const SKILL_TYPE_NAMES: Record<string, string> = {
  dano: 'Dano', heal: 'Cura', buff: 'Proteção', debuff: 'Vulnerabilidade', cc: 'Controle',
};

function effectDescription(note: string, heroAttack: boolean, continuous: boolean) {
  if (note === 'heal') return 'Vida recuperada';
  if (note === 'guard') return 'Proteção aplicada ao próximo golpe recebido';
  if (note === 'vulnerable') return continuous ? 'Alvo vulnerável temporariamente' : 'Alvo recebe mais dano por 2 turnos';
  if (note === 'stunned') return continuous ? heroAttack ? 'Ação do alvo interrompida' : 'Ação do inimigo interrompida' : heroAttack ? 'Alvo impedido de atacar no próximo turno' : 'Inimigo impedido de atacar neste turno';
  return note;
}

function ResourceBar({ label, value, max, resource }: { label: string; value?: number | null; max?: number | null; resource: 'HP' | 'MP' }) {
  const known = typeof value === 'number' && Number.isFinite(value) && typeof max === 'number' && Number.isFinite(max) && max >= 0;
  if (!known) return <div className="adventure-resource adventure-resource-unknown"><span className="adventure-resource-name" title={label}>{label}</span><span className="adventure-resource-value">{resource} —</span></div>;
  const width = max === 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return <div className={`adventure-resource adventure-resource-${resource.toLowerCase()}`} role="meter" aria-label={`${label}: ${value} de ${max} ${resource}`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
    <span className="adventure-resource-name" title={label}>{label}</span><span className="adventure-resource-value"><span className="adventure-resource-numbers">{value}/{max}</span><span className="adventure-resource-unit">{resource}</span></span>
    <div className="adventure-resource-track" aria-hidden="true"><div style={{ width: `${width}%` }} /></div>
  </div>;
}

function ActionReadout({ action, heroAttack, announce = true, actorName, continuous = false }: { action: AdventureSceneAction; heroAttack: boolean; announce?: boolean; actorName?: string; continuous?: boolean }) {
  const skill = action.kind === 'skill';
  const multipleHits = (action.hits?.length ?? 0) > 1;
  const rawDamage = multipleHits ? action.hits!.reduce((sum, hit) => sum + hit.raw_damage, 0) : action.rawDamage;
  return <div className="adventure-action-strip" key={action.id} role="status" aria-live={announce ? 'polite' : 'off'}>
    <strong>{skill ? action.skillName || 'Habilidade' : heroAttack ? 'Ataque básico do herói' : actorName ? `Ataque básico de ${actorName}` : 'Ataque básico do inimigo'}</strong>
    <div className="adventure-action-details">
      {skill && action.effect && <span>{ELEMENT_NAMES[action.effect]}</span>}
      {skill && typeof action.mpCost === 'number' && action.mpCost > 0 && <span>−{action.mpCost} MP</span>}
      {multipleHits && <span>{action.hits!.length} alvos</span>}
      {typeof action.damage === 'number' && (action.damage > 0 || (!action.healing && !['heal', 'buff', 'debuff', 'cc'].includes(action.skillType ?? ''))) && <span>{action.damage} de dano</span>}
      {typeof action.healing === 'number' && action.healing > 0 && <span>{heroAttack ? `+${action.healing} HP curado` : `+${action.healing} HP recuperado pelo herói após ${skill ? 'a habilidade' : 'o ataque'} do inimigo`}</span>}
      {typeof action.mpRestored === 'number' && action.mpRestored > 0 && <span>+{action.mpRestored} MP</span>}
      {typeof rawDamage === 'number' && rawDamage > 0 && (multipleHits ? rawDamage !== action.damage : action.damageMultiplier !== 1) && <span>Antes dos efeitos: {rawDamage} de dano</span>}
      {!multipleHits && typeof action.damageMultiplier === 'number' && action.damageMultiplier !== 1 && action.damageMultiplier > 0 && <span>Dano após efeitos: ×{action.damageMultiplier}</span>}
      {action.skillType && SKILL_TYPE_NAMES[action.skillType] && !(action.skillType === 'heal' && action.mpRestored) && <span>{SKILL_TYPE_NAMES[action.skillType]}</span>}
      {action.effectNote && <span className="adventure-effect-note">{effectDescription(action.effectNote, heroAttack, continuous)}</span>}
    </div>
  </div>;
}

function LegacyAdventureScene({ stage, biome, heroClass, heroName, enemyName, isBoss, bossId, frame, paused, announceActions = true }: Props) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [sceneWidth, setSceneWidth] = useState(320);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const update = () => setSceneWidth(scene.getBoundingClientRect().width || 320);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(scene);
    return () => observer.disconnect();
  }, []);
  const reducedMotion = useReducedMotion();
  const still = Boolean(paused || reducedMotion);
  const action = frame.status === 'fighting' ? frame.action : null;
  const blockedEnemy = action?.actor === 'enemy' && (action.effectNote === 'stunned' || action.damageMultiplier === 0);
  const visualAction = frame.animateAction === false || blockedEnemy ? null : action;
  const hit = useDamageReaction(frame.action, frame.status === 'fighting' && frame.animateAction === true, still, frame.actionElapsedMs);
  const heroAttack = visualAction?.actor === 'hero';
  const enemyAttack = visualAction?.actor === 'enemy';
  const specific = heroAttack && visualAction?.kind === 'skill' ? findSkillAnimation(visualAction.skillId, heroClass) : null;
  const enemy = resolveEnemyPresentation({ bossId, isBoss, enemyName, biome });
  const enemyAction = enemyAttack ? { kind: visualAction.kind ?? 'attack', skillId: visualAction.skillId, skillName: visualAction.skillName } : null;
  const enemySpecific = enemy && enemyAction ? findEnemyAnimation(enemy.key, enemyAction) : null;
  const defaultStyle = heroAttack ? visualAction?.kind === 'skill' && (heroClass === 'mago' || heroClass === 'clerico') ? 'cast' : heroClass === 'arqueiro' ? 'bow' : 'melee' : enemyAttack ? 'enemy' : 'idle';
  const actionStyle = enemySpecific ? `enemy-${enemySpecific.definition.motion}` : specific?.definition.motion ?? defaultStyle;
  const cast = actionStyle === 'cast' || actionStyle === 'support';
  const bow = actionStyle === 'bow';
  const melee = heroAttack && ['melee', 'slam', 'lunge'].includes(actionStyle);
  const gap = Math.max(80, sceneWidth * .54);
  const diagonal = ((stage % 3) - 1) * 7;
  const heroMotion = heroAttack ? { x: [0, gap * (melee ? .7 : actionStyle === 'support' ? 0 : .08), 0], y: [0, actionStyle === 'slam' ? -18 : actionStyle === 'lunge' ? diagonal - 9 : melee ? diagonal - 5 : -3, 0] }
    : frame.status === 'exploring' ? { x: [0, gap * .25, 0], y: [0, diagonal, 0] }
    : { x: 0, y: 0 };
  const enemyGesture = enemySpecific?.definition.motion;
  const enemyMotion = enemyAttack ? enemyActionMotion(enemyGesture, enemySpecific?.definition.target, gap) : { x: 0, y: 0 };
  const motionClass = still ? 'adventure-still' : '';
  const actionEffect = visualAction?.effect ?? 'physical';
  const projectile = heroAttack && (cast || bow);
  const selfSupport = heroAttack && !visualAction.damage && (
    (typeof visualAction.healing === 'number' && visualAction.healing > 0)
    || visualAction.skillType === 'heal' || visualAction.skillType === 'buff'
  );
  return <div className="adventure-scene-layout">
    <div ref={sceneRef} role="group" aria-label={`Cena da etapa ${stage}: ${heroName} e ${enemyName}`} className={`adventure-scene adventure-biome-${biome} ${motionClass}`} data-biome={biome} data-hero-class={heroClass} data-enemy-key={enemy?.key} data-status={frame.status} data-stage={stage} data-action-style={actionStyle}>
    <AdventureScenery biome={biome} />
    <div className="adventure-scene-top">
      <span className="adventure-stage-badge">Etapa {stage} · {BIOME_LABELS[biome]}</span>
      {isBoss && <span className="adventure-boss-badge">Chefe</span>}
    </div>
    <div className="adventure-combat-hud" data-scene-resources="true">
      <div className="adventure-combat-hud-hero">
        <ResourceBar label={heroName} value={frame.heroHp} max={frame.heroMaxHp} resource="HP" />
        {frame.heroMaxMp != null && <ResourceBar label="Mana" value={frame.heroMp} max={frame.heroMaxMp} resource="MP" />}
      </div>
      <div className="adventure-combat-hud-enemy">
        <ResourceBar label={enemyName} value={frame.enemyHp} max={frame.enemyMaxHp} resource="HP" />
        {typeof frame.enemyMaxMp === 'number' && Number.isFinite(frame.enemyMaxMp) && frame.enemyMaxMp > 0 && <ResourceBar label={`Mana de ${enemyName}`} value={frame.enemyMp} max={frame.enemyMaxMp} resource="MP" />}
      </div>
    </div>
    <div className="adventure-scene-fighters">
      <div className="adventure-fighter adventure-fighter-hero">
        <motion.div key={heroAttack ? visualAction.id : 'hero-idle'} className={`adventure-sprite-track ${frame.status === 'exploring' ? 'adventure-exploring' : ''} ${frame.status === 'fighting' ? 'adventure-walking' : ''} ${heroAttack ? `adventure-${actionStyle}` : ''} ${frame.status === 'defeated' ? 'adventure-defeated' : ''}`}
            animate={still ? { x: 0, y: 0 } : heroMotion}
          transition={still ? { duration: 0 } : { duration: heroAttack ? 1.2 : frame.status === 'exploring' ? 4 : 1.5, ease: 'easeInOut', repeat: frame.status === 'exploring' ? Infinity : 0 }}>
          <div className="adventure-damage-shell" data-hit-target={hit?.target === 'hero' ? 'hero' : undefined} data-hit-id={hit?.target === 'hero' ? hit.id : undefined} style={hit?.target === 'hero' ? { animationDelay: `${-hit.elapsedMs}ms` } : undefined}>
            <AdventureHeroSprite heroClass={heroClass} className="adventure-hero-svg" />
            {hit?.target === 'hero' && <span className="adventure-damage-marks" aria-hidden="true" />}
          </div>
        </motion.div>
        <div className="adventure-hero-pet-anchor"><AdventurePetCompanion pet={frame.pet} still={still} heroDefeated={frame.status === 'defeated'} /></div>
      </div>
      <div className="adventure-fighter adventure-fighter-enemy">
        <motion.div key={enemyAttack ? visualAction.id : 'enemy-idle'} className={`adventure-sprite-track ${enemyAttack ? `adventure-enemy-attack adventure-${actionStyle}` : ''} ${frame.status === 'defeated' ? 'adventure-enemy-victory' : ''}`}
            animate={still ? { x: 0, y: 0 } : enemyMotion}
          transition={still ? { duration: 0 } : { duration: 1.1, ease: 'easeInOut', repeat: 0 }}>
          <div className="adventure-damage-shell" data-hit-target={hit?.target === 'enemy' ? 'enemy' : undefined} data-hit-id={hit?.target === 'enemy' ? hit.id : undefined} style={hit?.target === 'enemy' ? { animationDelay: `${-hit.elapsedMs}ms` } : undefined}>
            {enemy ? <AdventureEnemyPortrait enemyKey={enemy.key} className="adventure-enemy-svg" /> : <AdventureEnemySprite biome={biome} variant={enemyVisualVariant(stage, isBoss)} className="adventure-enemy-svg" />}
            {hit?.target === 'enemy' && <span className="adventure-damage-marks" aria-hidden="true" />}
          </div>
        </motion.div>
      </div>
    </div>
    {visualAction && enemySpecific && enemy && enemyAction ? <AdventureEnemyEffect key={visualAction.id} enemyKey={enemy.key} {...enemyAction} /> : visualAction && specific ? <AdventureSkillEffect key={visualAction.id} skillId={visualAction.skillId!} heroClass={heroClass} target={selfSupport ? 'self' : specific.definition.target} /> : visualAction && <div key={visualAction.id} className={`adventure-effect-sequence adventure-effect-${actionEffect} adventure-vfx-${actionEffect} adventure-effect-${actionStyle} ${selfSupport ? 'adventure-effect-self-support' : ''}`} aria-hidden="true">
      {cast && <><span className="adventure-cast-particles" /><span className="adventure-cast-orb" /></>}
      {projectile && !selfSupport && <span className="adventure-projectile" />}
      <span className="adventure-impact" />
    </div>}
    {frame.status === 'transition' && <div className="adventure-transition-banner">Nova etapa</div>}
    {frame.status === 'defeated' && <div className="adventure-transition-banner">Herói derrotado</div>}
    {frame.status === 'victory' && <div className="adventure-transition-banner">Vitória</div>}
    {frame.status === 'draw' && <div className="adventure-transition-banner">Sem vencedor · nova tentativa</div>}
    </div>
    {action && <ActionReadout action={action} heroAttack={action.actor === 'hero'} announce={announceActions} />}
  </div>;
}

function HordeHit({ action, still, target }: { action: AdventureSceneTimedAction; still: boolean; target: 'hero' | 'enemy' }) {
  const hit = useDamageReaction({ ...action, actor: target === 'hero' ? 'enemy' : 'hero' }, true, still, action.elapsedMs);
  return hit ? <div className="adventure-damage-shell adventure-horde-hit-overlay" data-hit-target={hit.target} data-hit-id={hit.id} style={{ animationDelay: `${-hit.elapsedMs}ms` }}>
    <span className="adventure-damage-marks" aria-hidden="true" />
    {target === 'enemy' && <span className="adventure-horde-damage-number" aria-label={`${action.damage} de dano neste alvo`} style={{ animationDelay: `${-hit.elapsedMs}ms` }}>−{action.damage}</span>}
  </div> : null;
}

function HordeMotionTrack({ action, className, children, frozen = false }: { action?: AdventureSceneTimedAction; className: string; children: ReactNode; frozen?: boolean }) {
  const [initialElapsedMs] = useState(() => action?.elapsedMs ?? 0);
  return <div className={className} style={frozen ? { animation: 'none' } : action ? { animationDelay: `${-initialElapsedMs}ms`, '--horde-action-elapsed': `${-initialElapsedMs}ms` } as CSSProperties : undefined}>{children}</div>;
}

type IndexedActionId = { battleId: string; index: number };

function indexedActionId(id: string): IndexedActionId | null {
  const match = /^(.*)-(\d+)$/.exec(id);
  return match ? { battleId: match[1], index: Number(match[2]) } : null;
}

/** Event indices only advance within a battle; a small recent-battle cache covers transient view switches. */
export class HordeConsumedActions {
  private battleId: string | null = null;
  private consumedThrough = new Map<string, number>();
  private unindexed = new Set<string>();

  get retainedIdCount() { return this.unindexed.size; }
  get trackedBattles() { return this.consumedThrough.size; }

  observe(actions: AdventureSceneTimedAction[], still: boolean) {
    const incomingBattle = actions.map(item => indexedActionId(item.id)?.battleId).find(Boolean);
    if (incomingBattle && incomingBattle !== this.battleId) {
      this.battleId = incomingBattle;
      this.unindexed.clear();
      const through = this.consumedThrough.get(incomingBattle) ?? -1;
      this.consumedThrough.delete(incomingBattle);
      this.consumedThrough.set(incomingBattle, through);
      if (this.consumedThrough.size > 8) this.consumedThrough.delete(this.consumedThrough.keys().next().value!);
    }
    const present = new Set(actions.map(item => item.id));
    for (const id of this.unindexed) if (!present.has(id)) this.unindexed.delete(id);
    for (const item of actions) {
      if (!still && Number.isFinite(item.elapsedMs) && item.elapsedMs >= 0 && item.elapsedMs < 1200) continue;
      const indexed = indexedActionId(item.id);
      if (indexed && indexed.battleId === this.battleId) this.consumedThrough.set(indexed.battleId, Math.max(this.consumedThrough.get(indexed.battleId) ?? -1, indexed.index));
      else this.unindexed.add(item.id);
    }
  }

  has(id: string) {
    const indexed = indexedActionId(id);
    return indexed != null && indexed.index <= (this.consumedThrough.get(indexed.battleId) ?? -1) || this.unindexed.has(id);
  }
}

function HordeHero({ heroClass, heroName, frame, actions, still, actionStyle }: {
  heroClass: AdventureHeroClass; heroName: string; frame: AdventureSceneFrame;
  actions: AdventureSceneTimedAction[]; still: boolean; actionStyle: string;
}) {
  const action = actions.filter(item => item.actor === 'hero').at(-1);
  return <div className="adventure-horde-actor adventure-horde-hero adventure-fighter-hero" data-actor="hero">
    <div className="adventure-horde-resources">
      <ResourceBar label={heroName} value={frame.heroHp} max={frame.heroMaxHp} resource="HP" />
      {frame.heroMaxMp != null && <ResourceBar label={`Mana de ${heroName}`} value={frame.heroMp} max={frame.heroMaxMp} resource="MP" />}
    </div>
    <div className="adventure-horde-hero-visual">
      <HordeMotionTrack key={action?.id ?? 'hero-idle'} action={action} frozen={frame.status === 'defeated'} className={`adventure-sprite-track ${action ? `adventure-${actionStyle} adventure-horde-action` : ''} ${frame.status === 'exploring' ? 'adventure-exploring' : ''} ${frame.status === 'defeated' ? 'adventure-defeated' : ''}`}>
        <div className="adventure-damage-shell">
          <AdventureHeroSprite heroClass={heroClass} className="adventure-hero-svg" />
        </div>
        {actions.filter(item => item.actor === 'enemy' && item.targetSlot == null).map(item => <HordeHit key={item.id} action={item} still={still} target="hero" />)}
      </HordeMotionTrack>
      <AdventurePetCompanion pet={frame.pet} still={still} heroDefeated={frame.status === 'defeated'} />
    </div>
  </div>;
}

function HordeEnemyActor({ enemy, biome, stage, actions, still }: {
  enemy: HordeEnemy; biome: AdventureBiome; stage: number;
  actions: AdventureSceneTimedAction[]; still: boolean;
}) {
  const action = actions.filter(item => item.actor === 'enemy' && item.actorSlot === enemy.slot).at(-1);
  const incoming = actions.filter(item => item.targetSlots?.includes(enemy.slot) ?? item.targetSlot === enemy.slot);
  const presentation = resolveEnemyPresentation({ bossId: enemy.boss_id, isBoss: enemy.boss_id != null, enemyName: enemy.name, biome });
  const specific = action && presentation ? findEnemyAnimation(presentation.key, {
    kind: action.kind ?? 'attack', skillId: action.skillId, skillName: action.skillName,
  }) : null;
  const motionStyle = specific ? `adventure-enemy-${specific.definition.motion}` : 'adventure-enemy-attack';
  return <div className={`adventure-horde-actor adventure-horde-enemy adventure-fighter-enemy ${enemy.hp <= 0 ? 'adventure-horde-dead' : ''}`} data-actor="enemy" data-enemy-slot={enemy.slot} data-enemy-id={enemy.id} data-dead={enemy.hp <= 0}>
    <div className="adventure-horde-resources">
      <ResourceBar label={enemy.name} value={enemy.hp} max={enemy.max_hp} resource="HP" />
      {enemy.max_mp > 0 && <ResourceBar label={`Mana de ${enemy.name}`} value={enemy.mp} max={enemy.max_mp} resource="MP" />}
    </div>
    <HordeMotionTrack key={action?.id ?? `${enemy.id}-idle`} action={action} frozen={enemy.hp <= 0} className={`adventure-sprite-track ${action ? `${motionStyle} adventure-horde-action` : ''}`}>
      <div className="adventure-damage-shell">
        {presentation ? <AdventureEnemyPortrait enemyKey={presentation.key} className="adventure-enemy-svg" /> : <AdventureEnemySprite biome={biome} variant={enemyVisualVariant(stage + enemy.slot, false)} className="adventure-enemy-svg" />}
      </div>
      {incoming.map(item => <HordeHit key={item.id} action={{ ...item, damage: item.hits?.find(hit => hit.target_slot === enemy.slot)?.damage ?? item.damage }} still={still} target="enemy" />)}
    </HordeMotionTrack>
  </div>;
}

function HordeActionEffect({ action, heroClass, biome, enemies }: { action: AdventureSceneTimedAction; heroClass: AdventureHeroClass; biome: AdventureBiome; enemies: HordeEnemy[] }) {
  const [initialElapsedMs] = useState(action.elapsedMs);
  const heroAttack = action.actor === 'hero';
  const actorEnemy = heroAttack ? null : enemies.find(enemy => enemy.slot === action.actorSlot);
  const skill = heroAttack && action.kind === 'skill' ? findSkillAnimation(action.skillId, heroClass) : null;
  const selfSupport = heroAttack && !action.damage && ((action.healing ?? 0) > 0 || action.skillType === 'heal' || action.skillType === 'buff');
  const heroStyle = skill?.definition.motion ?? (heroAttack ? action.kind === 'skill' && (heroClass === 'mago' || heroClass === 'clerico') ? 'cast' : heroClass === 'arqueiro' ? 'bow' : 'melee' : 'enemy');
  const presentation = actorEnemy ? resolveEnemyPresentation({ bossId: actorEnemy.boss_id, isBoss: actorEnemy.boss_id != null, enemyName: actorEnemy.name, biome }) : null;
  const enemyEffect = presentation ? findEnemyAnimation(presentation.key, { kind: action.kind ?? 'attack', skillId: action.skillId, skillName: action.skillName }) : null;
  const mageArea = heroClass === 'mago' && heroAttack && action.kind === 'skill' &&
    (action.skillId === 'm_fogo_var' || action.skillId === 'm_gelo_var' || action.skillId === 'm_raio_var') &&
    action.targetSlots && action.targetSlots.length > 0;
  return <div className="adventure-horde-event-layer" data-horde-action-id={action.id} data-actor={action.actor} data-actor-slot={action.actorSlot ?? undefined} data-target-slot={action.targetSlot ?? undefined} style={{ '--horde-elapsed': `${-initialElapsedMs}ms` } as CSSProperties}>
    {mageArea ? <div className={`vfx-mago-area vfx-mago-area--${action.skillId}`} data-area-skill={action.skillId} aria-hidden="true">
      <span className="vfx-mago-area__caster" />
      {action.targetSlots!.map(slot => <span key={slot} className="vfx-mago-area__impact" data-area-target-slot={slot}><i /><i /><i /></span>)}
    </div> : enemyEffect && presentation ? <AdventureEnemyEffect enemyKey={presentation.key} kind={action.kind ?? 'attack'} skillId={action.skillId} skillName={action.skillName} /> : skill ? <AdventureSkillEffect skillId={action.skillId!} heroClass={heroClass} target={selfSupport ? 'self' : skill.definition.target} /> : <div className={`adventure-effect-sequence adventure-effect-${action.effect ?? 'physical'} adventure-vfx-${action.effect ?? 'physical'} adventure-effect-${heroStyle} ${selfSupport ? 'adventure-effect-self-support' : ''}`} aria-hidden="true">
      {(action.kind === 'skill' || heroStyle === 'cast' || heroStyle === 'support') && <><span className="adventure-cast-particles" /><span className="adventure-cast-orb" /></>}
      {heroAttack && !selfSupport && (heroStyle === 'cast' || heroStyle === 'bow') && <span className="adventure-projectile" />}
      <span className="adventure-impact" />
    </div>}
  </div>;
}

function HordeAdventureScene({ stage, biome, heroClass, heroName, isBoss, frame, paused, announceActions = true }: Props) {
  const enemies = frame.enemies ?? [];
  const reducedMotion = useReducedMotion();
  const still = Boolean(paused || reducedMotion);
  const consumedWhileStill = useRef(new HordeConsumedActions());
  const terminal = frame.status === 'victory' || frame.status === 'defeated' || frame.status === 'draw';
  const recentFinalAction = terminal && typeof frame.actionElapsedMs === 'number' &&
    Number.isFinite(frame.actionElapsedMs) && frame.actionElapsedMs >= 0 && frame.actionElapsedMs < 1200;
  const action = frame.status === 'fighting' || recentFinalAction ? frame.action ?? null : null;
  const sourceActions = useMemo(() => frame.actions ?? (action && frame.animateAction && typeof frame.actionElapsedMs === 'number' ? [{ ...action, elapsedMs: frame.actionElapsedMs }] : []), [frame.actions, action, frame.animateAction, frame.actionElapsedMs]);
  useEffect(() => {
    consumedWhileStill.current.observe(sourceActions, still);
  }, [sourceActions, still]);
  const visibleActions = terminal ? sourceActions.filter(item => item.id === action?.id) : sourceActions;
  const visualActions = (frame.status === 'fighting' || terminal) ? visibleActions.filter(item => {
    const validActor = item.actor === 'hero' || enemies.some(enemy => enemy.slot === item.actorSlot);
    const validTarget = (item.targetSlot == null || enemies.some(enemy => enemy.slot === item.targetSlot)) &&
      (!item.targetSlots || item.targetSlots.every(slot => enemies.some(enemy => enemy.slot === slot)));
    const blocked = item.actor === 'enemy' && (item.effectNote === 'stunned' || item.damageMultiplier === 0);
    return !still && Number.isFinite(item.elapsedMs) && item.elapsedMs >= 0 && item.elapsedMs < 1200 && !blocked && validActor && validTarget && !consumedWhileStill.current.has(item.id);
  }) : [];
  const heroAction = visualActions.filter(item => item.actor === 'hero').at(-1);
  const heroSkill = heroAction?.kind === 'skill' ? findSkillAnimation(heroAction.skillId, heroClass) : null;
  const heroStyle = heroSkill?.definition.motion ?? (heroAction ? heroAction.kind === 'skill' && (heroClass === 'mago' || heroClass === 'clerico') ? 'cast' : heroClass === 'arqueiro' ? 'bow' : 'melee' : 'idle');
  return <div className="adventure-scene-layout">
    <div role="group" aria-label={`Cena da etapa ${stage}: ${heroName} enfrenta ${enemies.length} ${enemies.length === 1 ? 'inimigo' : 'inimigos'}`} className={`adventure-scene adventure-horde adventure-biome-${biome} ${still ? 'adventure-still' : ''}`} data-biome={biome} data-hero-class={heroClass} data-status={frame.status} data-stage={stage} data-enemy-count={enemies.length}>
      <AdventureScenery biome={biome} />
      <div className="adventure-scene-top"><span className="adventure-stage-badge">Etapa {stage} · {BIOME_LABELS[biome]}</span>{isBoss && <span className="adventure-boss-badge">Chefe</span>}</div>
      <div className="adventure-horde-fighters">
        <HordeHero heroClass={heroClass} heroName={heroName} frame={frame} actions={visualActions} still={still} actionStyle={heroStyle} />
        {enemies.map(enemy => <HordeEnemyActor key={enemy.id} enemy={enemy} biome={biome} stage={stage} actions={visualActions} still={still} />)}
      </div>
      {visualActions.map(item => <HordeActionEffect key={item.id} action={item} heroClass={heroClass} biome={biome} enemies={enemies} />)}
      {frame.status === 'transition' && <div className="adventure-transition-banner">Nova etapa</div>}
      {frame.status === 'defeated' && <div className="adventure-transition-banner">Herói derrotado</div>}
      {frame.status === 'victory' && <div className="adventure-transition-banner">Vitória</div>}
      {frame.status === 'draw' && <div className="adventure-transition-banner">Sem vencedor · nova tentativa</div>}
    </div>
    {action && <ActionReadout action={action} heroAttack={action.actor === 'hero'} actorName={enemies.find(enemy => enemy.slot === action.actorSlot)?.name} continuous announce={announceActions} />}
  </div>;
}

export function AdventureScene(props: Props) {
  return props.frame.enemies?.length ? <HordeAdventureScene {...props} /> : <LegacyAdventureScene {...props} />;
}
