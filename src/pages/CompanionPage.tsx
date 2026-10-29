import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { PawPrint, Sparkles, Loader2, Edit2, Check, X, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import TranslatedGuidedTour from '@/components/TranslatedGuidedTour';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAllCompanions,
  useCreateCompanion,
  COMPANION_TYPES,
  COMBAT_COMPANION_META,
  xpForNextLevel,
  type CompanionRow,
} from '@/hooks/useCompanion';
import { usePetCareInteraction, usePetCareState, type PetCarePet } from '@/hooks/usePetCare';
import { useActivePet, petErrorMessage, type AdventurePet } from '@/hooks/useActivePet';
import { adventurePetBonusLabel, sustainLabel, isForagePet, forageRarityCap, hasForagedToday } from '@/lib/pets';
import { getLocalDateString } from '@/lib/streakUtils';

// O estado de cuidado e a participação vêm apenas dos RPCs de cuidado.

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
        data-tour="companion-locked"
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
      <TranslatedGuidedTour
        tourKey="companion_locked"
        targets={[{ target: 'companion-locked', key: 'unlock' }]}
      />
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
  pet,
  activeId,
  selectionEnabled,
  isSetting,
  onToggleActive,
  care,
  careUnavailable,
}: {
  companion: CompanionRow;
  pet: AdventurePet | null;
  activeId: string | null;
  selectionEnabled: boolean;
  isSetting: boolean;
  onToggleActive: (companionId: string | null) => void;
  care: PetCarePet | null;
  careUnavailable: boolean;
}) {
  const { t }     = useTranslation();
  const { user }  = useAuth();
  const qc        = useQueryClient();
  const interact  = usePetCareInteraction();

  const bonus       = selectionEnabled ? pet?.bonus ?? null : null;
  const isActive    = selectionEnabled && activeId === companion.id;
  const sustain     = selectionEnabled ? pet?.sustain ?? null : null;
  const forages     = isForagePet(companion.companion_type);
  const affinity    = Number(companion.affinity ?? 0);
  const foragedToday = hasForagedToday(companion.last_forage_at, getLocalDateString());

  const [editingName, setEditingName] = useState(false);
  const [nameInput,   setNameInput]   = useState(companion.name);

  const { emoji, label } = companionDisplay(companion);
  const xpNeeded = xpForNextLevel(companion.level);
  const xpPct    = Math.min(100, Math.round((companion.xp / xpNeeded) * 100));
  const careReady = Boolean(care && new Date(care.next_care_at).getTime() <= Date.now());
  const formatDate = (value: string | null) => value ? new Date(value).toLocaleString() : t('app.companion.care_none', { defaultValue: 'Ainda não houve' });

  async function saveName() {
    if (!nameInput.trim() || !user) return;
    const { error } = await supabase
      .from('companions')
      .update({ name: nameInput.trim() })
      .eq('id', companion.id);
    if (error) { toast.error(t('app.companion.toast_name_error')); return; }
    qc.invalidateQueries({ queryKey: ['companions_all', user.id] });
    qc.invalidateQueries({ queryKey: ['adventure-pet-state', user.id] });
    setEditingName(false);
    toast.success(t('app.companion.toast_name_updated'));
  }

  function handleInteract(action: 'care' | 'play') {
    interact.mutate(
      { companionId: companion.id, action },
      {
        onSuccess: (result) => {
          if (result.effective) toast.success(t('app.companion.care_confirmed', { defaultValue: 'Cuidado registrado pelo servidor.' }));
          else toast(t('app.companion.care_cooldown', { defaultValue: 'Cuidado em espera. Consulte o próximo horário.' }));
        },
        onError: (error) => {
          if (error instanceof Error && error.message.startsWith('Conta alterada')) return;
          toast.error(t('app.companion.care_unavailable', { defaultValue: 'Cuidado indisponível. Tente novamente mais tarde.' }));
        },
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

      {/* Seleção confirmada pelo servidor; só vale em lutas iniciadas depois. */}
      {bonus && (
        <div className="space-y-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Sparkles className="w-3.5 h-3.5" /> {adventurePetBonusLabel(bonus)}
          </span>
          <Button
            size="sm"
            variant={isActive ? 'default' : 'outline'}
            className="h-7 text-xs"
            disabled={isSetting}
            onClick={() => onToggleActive(isActive ? null : companion.id)}
          >
            {isActive
              ? 'Selecionado · desativar'
              : 'Selecionar'}
          </Button>
          </div>
          {isActive && <p className="text-[11px] text-muted-foreground">Selecionado para a próxima luta. A luta em andamento mantém o pet com que começou.</p>}
        </div>
      )}

      {/* Efeito confirmado pelo catálogo remoto; não implica skill ou ataque próprio. */}
      {sustain && (
        <div className="flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-1.5 text-xs font-medium text-cyan-300">
          ⚔️ {t('app.companion.sustain_prefix', { defaultValue: 'Em combate' })}: {sustainLabel(sustain)}
        </div>
      )}

      {/* Forrageio (Fase 1.5): afinidade + teto de raridade + status do dia */}
      {forages && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-amber-400">
              🎒 {t('app.companion.forage_title', { defaultValue: 'Forrageio' })}
            </span>
            <span className={foragedToday ? 'text-emerald-400' : 'text-muted-foreground'}>
              {foragedToday
                ? t('app.companion.forage_done', { defaultValue: '✓ hoje' })
                : isActive
                  ? t('app.companion.forage_ready', { defaultValue: 'pronto hoje' })
                  : t('app.companion.forage_inactive', { defaultValue: 'selecione p/ caçar' })}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{t('app.companion.affinity', { defaultValue: 'Afinidade' })}: {affinity}</span>
            <span>{t('app.companion.forage_cap', { defaultValue: 'até' })} {forageRarityCap(affinity)}</span>
          </div>
        </div>
      )}

      {/* Apenas o último estado confirmado, sem projetar participação no navegador. */}
      {care ? <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1 text-xs" data-testid={`pet-care-${companion.id}`}>
        <p>{t('app.companion.food_stock', { defaultValue: 'Ração em estoque' })}: <strong>{care.stock}</strong></p>
        <p>{t('app.companion.next_meal', { defaultValue: 'Próxima refeição automática' })}: <time dateTime={care.next_feed_at}>{formatDate(care.next_feed_at)}</time></p>
        <p>{t('app.companion.last_meal', { defaultValue: 'Última refeição' })}: {formatDate(care.last_feed_at)}</p>
        <p>{t('app.companion.participation', { defaultValue: 'Participação confirmada agora' })}: <strong>{Math.round(care.participation * 100)}%</strong></p>
        <p>{t('app.companion.next_care', { defaultValue: 'Próximo carinho ou brincadeira' })}: <time dateTime={care.next_care_at}>{formatDate(care.next_care_at)}</time></p>
      </div> : <p role="status" className="text-xs text-muted-foreground">{careUnavailable ? t('app.companion.care_unavailable', { defaultValue: 'Cuidado indisponível. Tente novamente mais tarde.' }) : t('app.companion.care_loading', { defaultValue: 'Consultando cuidado...' })}</p>}

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
          disabled={!careReady || interact.isPending}
          onClick={() => handleInteract('care')}
          variant={careReady ? 'default' : 'outline'}
          className="text-xs"
        >
          {t('app.companion.care', { defaultValue: 'Fazer carinho' })}
        </Button>
        <Button
          size="sm"
          disabled={!careReady || interact.isPending}
          onClick={() => handleInteract('play')}
          variant={careReady ? 'default' : 'outline'}
          className="text-xs"
        >
          {t('app.companion.play')}
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
  const petSelection = useActivePet();
  const careState = usePetCareState();
  const { state: petState, activeId, setActive, isSetting } = petSelection;

  const companions = (allCompanions ?? []) as CompanionRow[];
  // Animal de nível 3 (escolha única) — controla a tela de seleção.
  const animalCompanion = companions.find((c) => c.origin === 'lvl3_choice') ?? null;

  const isLoading = (profileLoading && profile === undefined)
    || (loadingCompanions && allCompanions === undefined);
  const level = profile?.level ?? 0;
  const selectPet = (companionId: string | null) => {
    petSelection.resetSetError();
    void setActive(companionId).catch(() => { /* erro persistente exibido abaixo */ });
  };

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
        <div data-tour="companion-header" className="flex items-center gap-3">
          <PawPrint className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">{t('app.companion.page_title')}</h1>
            <p className="text-sm text-muted-foreground">{t('app.companion.page_subtitle')}</p>
          </div>
        </div>

        {petSelection.isLoading && <p role="status" className="text-sm text-muted-foreground">Consultando os pets disponíveis para combate...</p>}
        {careState.error && <div role="alert" className="rounded-lg border border-amber-500/40 p-3 text-sm">{t('app.companion.care_unavailable', { defaultValue: 'Cuidado indisponível. Tente novamente mais tarde.' })} <Button variant="outline" size="sm" onClick={() => void careState.refetch()}>{t('app.companion.care_retry', { defaultValue: 'Tentar novamente' })}</Button></div>}
        {petSelection.error && <div role="alert" className="rounded-lg border border-amber-500/40 p-3 text-sm">Não foi possível consultar a seleção de pets: {petErrorMessage(petSelection.error)} <Button variant="outline" size="sm" onClick={() => void petSelection.refetch()}>Tentar novamente</Button></div>}
        {petSelection.setError && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm">Seleção não aplicada: {petErrorMessage(petSelection.setError)}</p>}
        {petState && !petState.enabled && <p role="status" className="rounded-lg border border-amber-500/40 p-3 text-sm">O combate com pets aguarda liberação para esta conta. Seus companheiros continuam disponíveis aqui.</p>}
        {petState?.enabled && petState.pets.length === 0 && <p role="status" className="rounded-lg border border-border p-3 text-sm">Nenhum pet elegível para a aventura automática foi confirmado nesta conta.</p>}
        {petState?.enabled && petState.pets.length > 0 && !activeId && <p className="text-sm text-muted-foreground">Nenhum pet selecionado para as próximas lutas.</p>}

        {/* Selection if lv3+ but no animal companion yet */}
        <div data-tour="companion-roster">
          {!animalCompanion && level >= 3 && (
            <SelectionScreen />
          )}

          {/* Companions grid (animal + pets); elegibilidade de combate vem do RPC. */}
          {companions.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {companions.map((c) => (
                <CompanionCard key={c.id} companion={c} pet={petState?.pets.find(pet => pet.id === c.id) ?? null} activeId={activeId} selectionEnabled={Boolean(petState?.enabled && !petSelection.error)} isSetting={isSetting} onToggleActive={selectPet} care={careState.data?.pets.find(pet => pet.companion_id === c.id) ?? null} careUnavailable={Boolean(careState.error)} />
              ))}
            </div>
          )}
        </div>

        {/* Tips */}
        <div data-tour="companion-tips" className="rounded-xl border border-border bg-card/40 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('app.companion.tips_title')}</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>{t('app.companion.tip_1')}</li>
            <li>{t('app.companion.tip_2')}</li>
            <li>{t('app.companion.tip_3')}</li>
          </ul>
        </div>
      </div>
      <TranslatedGuidedTour
        tourKey="companion"
        targets={[
          { target: 'companion-header', key: 'overview' },
          { target: 'companion-roster', key: 'roster' },
          { target: 'companion-tips', key: 'tips' },
        ]}
      />
    </AppLayout>
  );
}
