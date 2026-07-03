import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { PawPrint, Sparkles, Heart, Clock, Loader2, Edit2, Check, X, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAllCompanions,
  useCreateCompanion,
  useInteractCompanion,
  COMPANION_TYPES,
  COMBAT_COMPANION_META,
  getMoodTier,
  computeLiveMood,
  isCooldownDone,
  xpForNextLevel,
  type CompanionRow,
} from '@/hooks/useCompanion';
import { useActivePet } from '@/hooks/useActivePet';
import { getPetBonus, petBonusLabel, getSustainEffect, sustainLabel } from '@/lib/pets';

// Companheiros são puramente COSMÉTICOS / de companhia (spec "Rotina é a
// Torneira" §4): não têm stats de combate, não equipam itens e não lutam.
// A página deixa o herói nomear, alimentar e brincar (humor + nível).

const FEED_COOLDOWN_MIN = 180;
const PLAY_COOLDOWN_MIN = 60;

/** Resolve emoji/nome de exibição de qualquer companheiro (animal de nível 3 ou pet de loja). */
function companionDisplay(companion: CompanionRow): { emoji: string; label: string } {
  const animal = COMPANION_TYPES.find((c) => c.id === companion.companion_type);
  if (animal) return { emoji: animal.emoji, label: animal.name };
  const pet = COMBAT_COMPANION_META[companion.companion_type];
  if (pet) return { emoji: pet.emoji, label: pet.name };
  return { emoji: '🐾', label: companion.companion_type };
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

// ─── Selection Screen (animal companion de nível 3) ────────────────────────────

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
    <div className="space-y-6">
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

// ─── Companion Card (cosmético) ────────────────────────────────────────────────

function CompanionCard({
  companion,
  activeType,
  onToggleActive,
}: {
  companion: CompanionRow;
  activeType: string | null;
  onToggleActive: (companionType: string) => void;
}) {
  const { t }     = useTranslation();
  const { user }  = useAuth();
  const qc        = useQueryClient();
  const interact  = useInteractCompanion();

  const bonus     = getPetBonus(companion.companion_type);
  const isActive  = activeType === companion.companion_type;
  const sustain   = getSustainEffect(companion.companion_type);

  const [editingName, setEditingName] = useState(false);
  const [nameInput,   setNameInput]   = useState(companion.name);

  const { emoji, label } = companionDisplay(companion);
  const liveMood = useMemo(() => computeLiveMood(companion), [companion]);
  const moodTier = getMoodTier(liveMood);
  const moodKey  = liveMood < 20 ? 'deprimido' : liveMood < 40 ? 'triste' : liveMood < 70 ? 'neutro' : liveMood < 90 ? 'feliz' : 'euforico';
  const moodLabel = t(`app.companion.mood_${moodKey}`, { defaultValue: moodTier.label });
  const xpNeeded = xpForNextLevel(companion.level);
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

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-2xl border border-border bg-gradient-to-br from-card to-card/60 p-6 space-y-5"
    >
      {/* Emoji & name */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          className="text-7xl select-none"
        >
          {emoji}
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

        <Badge variant="outline" className="text-xs">{label}</Badge>
      </div>

      {/* Bônus passivo + ativar (Fase 1: 1 pet ativo por vez) */}
      {bonus && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Sparkles className="w-3.5 h-3.5" /> {petBonusLabel(bonus)}
          </span>
          <Button
            size="sm"
            variant={isActive ? 'default' : 'outline'}
            className="h-7 text-xs"
            onClick={() => onToggleActive(companion.companion_type)}
          >
            {isActive
              ? t('app.companion.bonus_active', { defaultValue: 'Ativo' })
              : t('app.companion.bonus_activate', { defaultValue: 'Ativar' })}
          </Button>
        </div>
      )}

      {/* Sustain em combate (Fase 2): efeito por turno quando este pet está ativo */}
      {sustain && (
        <div className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-1.5 text-xs font-medium text-cyan-300">
          ⚔️ {t('app.companion.sustain_prefix', { defaultValue: 'Em combate' })}: {sustainLabel(sustain)}
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
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompanionPage() {
  const { t } = useTranslation();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { isLoading: loadingCompanions, data: allCompanions } = useAllCompanions();
  const { activeType, setActive } = useActivePet();

  const companions = (allCompanions ?? []) as CompanionRow[];
  // Animal de nível 3 (escolha única) — controla a tela de seleção.
  const animalCompanion = companions.find((c) => c.origin === 'lvl3_choice') ?? null;

  const isLoading = (profileLoading && profile === undefined)
    || (loadingCompanions && allCompanions === undefined);
  const level = profile?.level ?? 0;

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

  if (level < 3 && companions.length === 0) {
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
        {!animalCompanion && level >= 3 && (
          <SelectionScreen />
        )}

        {/* Companions grid (animal + pets) — todos cosméticos */}
        {companions.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {companions.map((c) => (
              <CompanionCard key={c.id} companion={c} activeType={activeType} onToggleActive={setActive} />
            ))}
          </div>
        )}

        {/* Tips */}
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('app.companion.tips_title')}</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>{t('app.companion.tip_1')}</li>
            <li>{t('app.companion.tip_2')}</li>
            <li>{t('app.companion.tip_3')}</li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}
