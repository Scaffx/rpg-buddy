import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { PawPrint, Sparkles, Heart, Swords, Clock, Loader2, Edit2, Check, X, Skull, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useInventory, type InventoryItem } from '@/hooks/useInventory';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAllCompanions,
  useCompanion,
  useSkeletonCompanion,
  useSkeletonBossDefeated,
  useAdoptSkeletonPup,
  useCreateCompanion,
  useInteractCompanion,
  COMPANION_TYPES,
  SKELETON_PUP,
  getMoodTier,
  computeLiveMood,
  isCooldownDone,
  xpForNextLevel,
  isCombatCompanion,
  COMBAT_COMPANION_META,
  getCompanionEffectiveAtk,
  useEquipCompanionGear,
  type CompanionRow,
} from '@/hooks/useCompanion';
import { useHeroStoryChoices } from '@/hooks/useHeroStoryChoices';

const FEED_COOLDOWN_MIN = 180;
const PLAY_COOLDOWN_MIN = 60;

/** Equipar arma (arte/Cinza) + armadura (guarda) no companheiro de combate. */
function CompanionGear({ companion }: { companion: CompanionRow }) {
  const { data: inventory = [] } = useInventory();
  const equip = useEquipCompanionGear();
  const weapons = (inventory as InventoryItem[]).filter((i) => i.game_items?.category === 'weapon');
  const armors = (inventory as InventoryItem[]).filter((i) => i.game_items?.category === 'armor');
  const wId = String((companion as any).equipped_weapon_id ?? '');
  const aId = String((companion as any).equipped_armor_id ?? '');
  const save = (weaponId: string | null, armorId: string | null) =>
    equip.mutate(
      { companionId: companion.id, weaponId, armorId },
      { onSuccess: () => toast.success('Equipamento do companheiro atualizado'), onError: (e: any) => toast.error(e?.message || 'Falha ao equipar') },
    );
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <label className="block text-[10px] text-muted-foreground space-y-1">
        🗡️ Arma (arte/Cinza)
        <select
          className="mt-0.5 w-full rounded bg-muted/40 border border-border/40 text-xs p-1 text-foreground"
          value={wId}
          onChange={(e) => save(e.target.value || null, aId || null)}
        >
          <option value="">— nenhuma —</option>
          {weapons.map((i) => <option key={i.id} value={i.item_id}>{i.game_items?.name}</option>)}
        </select>
      </label>
      <label className="block text-[10px] text-muted-foreground space-y-1">
        🛡️ Armadura (guarda)
        <select
          className="mt-0.5 w-full rounded bg-muted/40 border border-border/40 text-xs p-1 text-foreground"
          value={aId}
          onChange={(e) => save(wId || null, e.target.value || null)}
        >
          <option value="">— nenhuma —</option>
          {armors.map((i) => <option key={i.id} value={i.item_id}>{i.game_items?.name}</option>)}
        </select>
      </label>
    </div>
  );
}

// ─── Level gate ────────────────────────────────────────────────────────────────────────────

function LockedScreen({ level }: { level: number }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen p-4 md:p-6 flex flex-col items-center justify-center gap-6 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="relative">
          <div className="text-7xl">🐾</div>
          <div className="absolute -bottom-1 -right-1 bg-muted border-2 border-background rounded-full p-1">
            <Lock className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold">{t('app.companion.locked_title')}</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            {t('app.companion.locked_desc')}
          </p>
        </div>
        <div className="w-full max-w-xs space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{t('app.companion.locked_current_level')}</span>
            <span className="font-bold text-primary">{t('app.companion.locked_level_progress', { level })}</span>
          </div>
          <Progress value={Math.min(100, (level / 3) * 100)} className="h-2" />
        </div>
      </motion.div>
    </div>
  );
}

// ─── Selection Screen ────────────────────────────────────────────────────────

function SelectionScreen() {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName]     = useState('');
  const createCompanion = useCreateCompanion();

  function handleCreate() {
    if (!picked) { toast.error(t('app.companion.toast_pick_first')); return; }
    if (!name.trim()) { toast.error(t('app.companion.toast_name_required')); return; }
    createCompanion.mutate(
      { type: picked, name: name.trim() },
      {
        onSuccess: () => toast.success(t('app.companion.toast_created', { name })),
        onError: (err: unknown) => {
          const msg = (err as any)?.message ?? '';
          console.error('[CompanionPage] create error:', err);
          toast.error(t('app.companion.toast_create_error'), { description: msg || t('app.companion.toast_try_again') });
        },
      },
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-8">
      <div className="flex items-center gap-3">
        <PawPrint className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">{t('app.companion.select_title')}</h1>
          <p className="text-sm text-muted-foreground">{t('app.companion.select_subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {COMPANION_TYPES.map((ct) => (
          <motion.button
            key={ct.id}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setPicked(ct.id)}
            className={`text-left p-6 rounded-2xl border-2 transition-all ${
              picked === ct.id
                ? 'border-primary bg-primary/10 shadow-md shadow-primary/20'
                : 'border-border bg-card/50 hover:border-primary/40'
            }`}
          >
            <div className="text-6xl mb-4 text-center w-full">{ct.emoji}</div>
            <h3 className="font-bold text-base text-center">{t(`app.companion.type_${ct.id}_name`, { defaultValue: ct.name })}</h3>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed text-center">{t(`app.companion.type_${ct.id}_desc`, { defaultValue: ct.description })}</p>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {picked && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="space-y-3 max-w-sm"
          >
            <p className="text-sm font-medium">{t('app.companion.select_name_prompt')}</p>
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('app.companion.select_name_placeholder')}
                maxLength={32}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <Button onClick={handleCreate} disabled={createCompanion.isPending}>
                {createCompanion.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('app.companion.select_choose')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Companion Card ──────────────────────────────────────────────────────────

function CompanionCard({
  companion,
  queryKey,
  isSkeletonPup = false,
}: {
  companion: CompanionRow;
  queryKey: string;
  isSkeletonPup?: boolean;
}) {
  const { t }     = useTranslation();
  const { user }  = useAuth();
  const qc        = useQueryClient();
  const interact  = useInteractCompanion();

  const [editingName, setEditingName] = useState(false);
  const [nameInput,   setNameInput]   = useState(companion.name);

  const ct       = isSkeletonPup
    ? SKELETON_PUP
    : COMPANION_TYPES.find((c) => c.id === companion.companion_type);
  const combatMeta = COMBAT_COMPANION_META[companion.companion_type] ?? null;
  const isCombat   = isCombatCompanion(companion);
  const liveMood = useMemo(() => computeLiveMood(companion), [companion]);
  const moodTier = getMoodTier(liveMood);
  const moodKey  = liveMood < 20 ? 'deprimido' : liveMood < 40 ? 'triste' : liveMood < 70 ? 'neutro' : liveMood < 90 ? 'feliz' : 'euforico';
  const moodLabel = t(`app.companion.mood_${moodKey}`, { defaultValue: moodTier.label });
  const xpNeeded = xpForNextLevel(companion.level, isCombat);
  const xpPct    = Math.min(100, Math.round((companion.xp / xpNeeded) * 100));
  const canFeed  = isCooldownDone(companion.last_fed_at,    FEED_COOLDOWN_MIN);
  const canPlay  = isCooldownDone(companion.last_played_at, PLAY_COOLDOWN_MIN);

  function cooldownLabel(timestamp: string | null, cooldownMin: number) {
    if (!timestamp) return '';
    const minsLeft = Math.ceil(cooldownMin - (Date.now() - new Date(timestamp).getTime()) / 60000);
    if (minsLeft <= 0) return '';
    const h = Math.floor(minsLeft / 60), m = minsLeft % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  async function saveName() {
    if (!nameInput.trim() || !user) return;
    const { error } = await supabase
      .from('companions')
      .update({ name: nameInput.trim() })
      .eq('id', companion.id);
    if (error) { toast.error(t('app.companion.toast_name_error')); return; }
    qc.invalidateQueries({ queryKey: ['companions_all', user.id] });
    setEditingName(false);
    toast.success(t('app.companion.toast_name_updated'));
  }

  function handleInteract(action: 'feed' | 'play') {
    interact.mutate(
      { companionId: companion.id, action, currentCompanion: companion },
      {
        onSuccess: ({ didLevel, newLevel }) => {
          if (action === 'feed') toast.success(t('app.companion.toast_fed', { name: companion.name }));
          else toast.success(t('app.companion.toast_played', { name: companion.name }));
          if (didLevel) toast(t('app.companion.toast_levelup', { name: companion.name, level: newLevel }), { duration: 4000 });
        },
        onError: () => toast.error(t('app.companion.toast_interact_error')),
      },
    );
  }

  const cardBorder = isSkeletonPup ? 'border-violet-500/40' : 'border-border';
  const cardBg     = isSkeletonPup
    ? 'from-violet-500/10 to-slate-900/60'
    : 'from-card to-card/60';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded-2xl border ${cardBorder} bg-gradient-to-br ${cardBg} p-6 space-y-5`}
    >
      {/* Emoji & name */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          className="text-7xl select-none"
        >
          {ct?.emoji ?? '🐾'}
        </motion.div>

        <div className="flex items-center gap-2">
          {editingName ? (
            <>
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="h-8 text-base font-bold w-36 text-center"
                maxLength={32}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
              />
              <button onClick={saveName}><Check className="w-4 h-4 text-emerald-400" /></button>
              <button onClick={() => setEditingName(false)}><X className="w-4 h-4 text-red-400" /></button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold">{companion.name}</h2>
              <button onClick={() => { setNameInput(companion.name); setEditingName(true); }}>
                <Edit2 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            </>
          )}
        </div>

        <Badge
          variant="outline"
          className={`text-xs ${isSkeletonPup ? 'border-violet-500/40 text-violet-400' : ''}`}
        >
          {ct ? t(`app.companion.type_${ct.id}_name`, { defaultValue: ct.name }) : companion.companion_type}
        </Badge>
        {isCombat && combatMeta && (
          <Badge variant="outline" className={`text-xs border-orange-500/40 ${combatMeta.roleColor}`}>
            ⚔️ {t(`app.companion.role_${combatMeta.role}`, { defaultValue: combatMeta.roleLabel })}
          </Badge>
        )}
      </div>

      {/* Combat stats — only for non-starter combat companions */}
      {isCombat && companion.max_hp > 0 && (
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-orange-400 uppercase tracking-wide">{t('app.companion.combat_stats')}</p>
          <div className="grid grid-cols-3 gap-2 text-xs text-center">
            <div className="space-y-0.5">
              <p className="text-health font-bold">❤️ {companion.current_hp}/{companion.max_hp}</p>
              <p className="text-muted-foreground">HP</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-red-400 font-bold">⚔️ {getCompanionEffectiveAtk(companion)}</p>
              <p className="text-muted-foreground">ATK</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-sky-400 font-bold">🛡️ {companion.def}</p>
              <p className="text-muted-foreground">DEF</p>
            </div>
            {companion.max_mp > 0 && (
              <div className="space-y-0.5 col-span-3">
                <p className="text-blue-400 font-bold">💧 {companion.current_mp}/{companion.max_mp} MP</p>
              </div>
            )}
          </div>
          {combatMeta && combatMeta.skills.length > 0 && (
            <div className="mt-1">
              <p className="text-xs text-muted-foreground mb-1">{t('app.companion.skills_label')}</p>
              <div className="flex flex-wrap gap-1">
                {(t(`app.companion.skills_${companion.companion_type}`, { returnObjects: true, defaultValue: combatMeta.skills }) as string[]).map((s, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/40 border border-border/40 text-muted-foreground">{s}</span>
                ))}
              </div>
            </div>
          )}
          <CompanionGear companion={companion} />
        </div>
      )}

      {/* Mood bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-medium">
          <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> {t('app.companion.mood')}</span>
          <span className={moodTier.color}>{moodLabel} · {liveMood}%</span>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${liveMood}%` }}
            transition={{ duration: 0.7 }}
            className={`h-full rounded-full ${moodTier.bg}`}
          />
        </div>
      </div>

      {/* Level / XP bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-medium">
          <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> {t('app.companion.level', { level: companion.level })}</span>
          <span className="text-muted-foreground">{companion.xp} / {xpNeeded} XP</span>
        </div>
        <Progress value={xpPct} className="h-2" />
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          disabled={!canFeed || interact.isPending}
          onClick={() => handleInteract('feed')}
          variant={canFeed ? 'default' : 'outline'}
          className="text-xs"
        >
          {canFeed ? t('app.companion.feed') : (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {cooldownLabel(companion.last_fed_at, FEED_COOLDOWN_MIN)}
            </span>
          )}
        </Button>
        <Button
          size="sm"
          disabled={!canPlay || interact.isPending}
          onClick={() => handleInteract('play')}
          variant={canPlay ? 'default' : 'outline'}
          className="text-xs"
        >
          {canPlay ? t('app.companion.play') : (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {cooldownLabel(companion.last_played_at, PLAY_COOLDOWN_MIN)}
            </span>
          )}
        </Button>
      </div>

      {/* Tip */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-start gap-2">
          <Swords className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('app.companion.card_tip')}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Skeleton Pup placeholder card (locked / ready-to-adopt) ───────────────

// SkeletonPupSlot só é renderizado quando defeatedBoss=true ou isOrphaned=true
// (o grid pai garante que nunca aparece sem a derrota do boss)
function SkeletonPupSlot({ defeatedBoss, isOrphaned }: { defeatedBoss: boolean; isOrphaned?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const adoptSkeletonPup = useAdoptSkeletonPup();
  const [name, setName] = useState('Ossinho');

  if (!defeatedBoss && !isOrphaned) return null;

  // Estado órfão: escolheu adotar mas o insert falhou. Permite re-adotar diretamente.
  if (isOrphaned) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border bg-gradient-to-br p-6 space-y-4 border-violet-500/40 from-violet-500/15 to-slate-900/60"
      >
        <div className="flex flex-col items-center gap-3 pt-2">
          <div className="text-7xl select-none">{SKELETON_PUP.emoji}</div>
          <h2 className="text-xl font-bold">{t(`app.companion.type_${SKELETON_PUP.id}_name`, { defaultValue: SKELETON_PUP.name })}</h2>
          <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400">
            {t('app.companion.skeleton_awaiting')}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          {t('app.companion.skeleton_orphan_desc')}
        </p>
        <div className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('app.companion.skeleton_name_placeholder')}
            maxLength={32}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          <Button
            onClick={() => adoptSkeletonPup.mutate(name.trim() || 'Ossinho')}
            disabled={adoptSkeletonPup.isPending}
            className="w-full bg-violet-600 hover:bg-violet-700"
          >
            <Skull className="w-4 h-4 mr-2" />
            {adoptSkeletonPup.isPending ? t('app.companion.skeleton_adopting') : t('app.companion.skeleton_confirm_adopt')}
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl border bg-gradient-to-br p-6 space-y-4 border-violet-500/40 from-violet-500/15 to-slate-900/60"
    >
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="relative text-7xl select-none">
          {SKELETON_PUP.emoji}
        </div>
        <h2 className="text-xl font-bold">{t(`app.companion.type_${SKELETON_PUP.id}_name`, { defaultValue: SKELETON_PUP.name })}</h2>
        <Badge variant="outline" className="text-xs border-violet-500/40 text-violet-400">
          {t('app.companion.skeleton_ready')}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground text-center leading-relaxed">
        {t('app.companion.skeleton_ready_desc')}
      </p>

      <Button
        onClick={() => navigate('/boss')}
        className="w-full bg-violet-600 hover:bg-violet-700"
      >
        <Skull className="w-4 h-4 mr-2" />
        {t('app.companion.skeleton_go_adopt')}
      </Button>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompanionPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  // Single query — useCompanion() e useSkeletonCompanion() compartilham o mesmo cache 'companions_all'
  const { isLoading: loadingCompanions, data: _allCompanions } = useAllCompanions();
  const { data: companion }         = useCompanion();
  const { data: skeletonCompanion } = useSkeletonCompanion();
  const { data: defeatedSkeletonBoss = false } = useSkeletonBossDefeated();
  const { data: storyChoices } = useHeroStoryChoices();

  // Estado órfão: escolheu adotar mas o insert do companion falhou
  const isOrphanedAdoption =
    storyChoices?.skeleton_champion === 'adopt' && !skeletonCompanion;

  // Mostrar seção do filhote se: já adotado OU boss recém-derrotado (sem escolha) OU órfão
  const showSkeletonSection =
    !!skeletonCompanion || defeatedSkeletonBoss || isOrphanedAdoption;

  // Show full-screen loader only when there is no cached data yet
  const isLoading = (profileLoading && profile === undefined)
    || (loadingCompanions && _allCompanions === undefined);
  const level     = profile?.level ?? 0;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">{t('app.companion.loading')}</span>
        </div>
      </AppLayout>
    );
  }

  if (level < 3 && !companion && !skeletonCompanion) {
    return <AppLayout><LockedScreen level={level} /></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="min-h-screen p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <PawPrint className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{t('app.companion.page_title')}</h1>
            <p className="text-sm text-muted-foreground">{t('app.companion.page_subtitle')}</p>
          </div>
        </div>

        {/* Selection if lv3+ but no animal companion yet */}
        {!companion && level >= 3 && (
          <SelectionScreen />
        )}

        {/* Companions grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {companion && (
            <CompanionCard companion={companion} queryKey="companion" />
          )}
          {/* Seção do filhote de esqueleto: só aparece se já foi adotado,
              se o boss foi recém-derrotado, ou se há adoção órfã a recuperar. */}
          {showSkeletonSection && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-violet-400 uppercase tracking-wide px-1">
                {t('app.companion.boss_companion')}
              </p>
              {skeletonCompanion ? (
                <CompanionCard
                  companion={skeletonCompanion}
                  queryKey="companion_skeleton"
                  isSkeletonPup
                />
              ) : (
                <SkeletonPupSlot
                  defeatedBoss={defeatedSkeletonBoss}
                  isOrphaned={isOrphanedAdoption}
                />
              )}
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('app.companion.tips_title')}</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>{t('app.companion.tip_1')}</li>
            <li>{t('app.companion.tip_2')}</li>
            <li>{t('app.companion.tip_3')}</li>
            <li>{t('app.companion.tip_4')}</li>
            <li>{t('app.companion.tip_5')}</li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}

