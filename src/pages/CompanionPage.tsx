import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PawPrint, Sparkles, Heart, Swords, Clock, Loader2, Edit2, Check, X, Lock } from 'lucide-react';
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
  useCompanion,
  useSkeletonCompanion,
  useCreateCompanion,
  useInteractCompanion,
  COMPANION_TYPES,
  SKELETON_PUP,
  getMoodTier,
  computeLiveMood,
  isCooldownDone,
  xpForNextLevel,
  type CompanionRow,
} from '@/hooks/useCompanion';

const FEED_COOLDOWN_MIN = 180;
const PLAY_COOLDOWN_MIN = 60;

// ─── Level gate ────────────────────────────────────────────────────────────────────────────

function LockedScreen({ level }: { level: number }) {
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
          <h2 className="text-xl font-bold">Companheiro — Bloqueado</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Ao alcançar o <span className="font-bold text-primary">Nível 3</span>, você poderá escolher um
            companheiro fiel que crescerá junto com sua jornada.
          </p>
        </div>
        <div className="w-full max-w-xs space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Seu nível atual</span>
            <span className="font-bold text-primary">Nv. {level} / 3</span>
          </div>
          <Progress value={Math.min(100, (level / 3) * 100)} className="h-2" />
        </div>
      </motion.div>
    </div>
  );
}

// ─── Selection Screen ────────────────────────────────────────────────────────

function SelectionScreen() {
  const [picked, setPicked] = useState<string | null>(null);
  const [name, setName]     = useState('');
  const createCompanion = useCreateCompanion();

  function handleCreate() {
    if (!picked) { toast.error('Escolha um companheiro antes de continuar.'); return; }
    if (!name.trim()) { toast.error('Dê um nome ao seu companheiro!'); return; }
    createCompanion.mutate(
      { type: picked, name: name.trim() },
      {
        onSuccess: () => toast.success(`${name} acordou e está pronto para aventuras! 🎉`),
        onError: (err: unknown) => {
          const msg = (err as any)?.message ?? '';
          console.error('[CompanionPage] create error:', err);
          toast.error('Erro ao criar companheiro.', { description: msg || 'Tente novamente.' });
        },
      },
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-8">
      <div className="flex items-center gap-3">
        <PawPrint className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Escolha seu Companheiro</h1>
          <p className="text-sm text-muted-foreground">Seu familiar irá crescer junto com você</p>
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
            <h3 className="font-bold text-base text-center">{ct.name}</h3>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed text-center">{ct.description}</p>
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
            <p className="text-sm font-medium">Qual é o nome do seu companheiro?</p>
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Bolinha, Faísca, Pipoca…"
                maxLength={32}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <Button onClick={handleCreate} disabled={createCompanion.isPending}>
                {createCompanion.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Escolher'}
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
  const { user }  = useAuth();
  const qc        = useQueryClient();
  const interact  = useInteractCompanion();

  const [editingName, setEditingName] = useState(false);
  const [nameInput,   setNameInput]   = useState(companion.name);

  const ct       = isSkeletonPup
    ? SKELETON_PUP
    : COMPANION_TYPES.find((c) => c.id === companion.companion_type);
  const liveMood = useMemo(() => computeLiveMood(companion), [companion]);
  const moodTier = getMoodTier(liveMood);
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
      .from('companions' as never)
      .update({ name: nameInput.trim() } as never)
      .eq('id' as never, companion.id as never);
    if (error) { toast.error('Erro ao salvar nome.'); return; }
    qc.invalidateQueries({ queryKey: ['companions_all', user.id] });
    setEditingName(false);
    toast.success('Nome atualizado!');
  }

  function handleInteract(action: 'feed' | 'play') {
    interact.mutate(
      { companionId: companion.id, action, currentCompanion: companion },
      {
        onSuccess: ({ didLevel, newLevel }) => {
          if (action === 'feed') toast.success(`${companion.name} comeu e ganhou energia! +12 humor, +10 XP 🍖`);
          else toast.success(`${companion.name} adorou brincar! +20 humor, +20 XP 🎮`);
          if (didLevel) toast(`🎉 ${companion.name} subiu para o nível ${newLevel}!`, { duration: 4000 });
        },
        onError: () => toast.error('Algo deu errado. Tente novamente.'),
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
          {ct?.name ?? companion.companion_type}
        </Badge>
      </div>

      {/* Mood bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-medium">
          <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> Humor</span>
          <span className={moodTier.color}>{moodTier.label} · {liveMood}%</span>
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
          <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Nível {companion.level}</span>
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
          {canFeed ? '🍖 Alimentar' : (
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
          {canPlay ? '🎮 Brincar' : (
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
            Completar missões diárias dá +5 humor e +15 XP automaticamente!
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompanionPage() {
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  // Single query — useCompanion() e useSkeletonCompanion() compartilham o mesmo cache 'companions_all'
  const { isLoading: loadingCompanions, data: _allCompanions } = useAllCompanions();
  const { data: companion }         = useCompanion();
  const { data: skeletonCompanion } = useSkeletonCompanion();

  // Show full-screen loader only when there is no cached data yet
  const isLoading = (profileLoading && profile === undefined)
    || (loadingCompanions && _allCompanions === undefined);
  const level     = (profile as any)?.level ?? 0;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Carregando companheiro…</span>
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
            <h1 className="text-2xl font-bold">Meus Companheiros</h1>
            <p className="text-sm text-muted-foreground">Cuide bem dos seus fiéis aliados</p>
          </div>
        </div>

        {/* Selection if lv3+ but no animal companion yet */}
        {!companion && level >= 3 && (
          <SelectionScreen />
        )}

        {/* Companions grid */}
        {(companion || skeletonCompanion) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {companion && (
              <CompanionCard companion={companion} queryKey="companion" />
            )}
            {skeletonCompanion && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-violet-400 uppercase tracking-wide px-1">
                  💀 Companheiro do Chefe
                </p>
                <CompanionCard
                  companion={skeletonCompanion}
                  queryKey="companion_skeleton"
                  isSkeletonPup
                />
              </div>
            )}
          </div>
        )}

        {/* Tips */}
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dicas</p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li>Humor cai ~1% por hora sem interação</li>
            <li>Alimentar: cooldown 3h · +12 humor, +10 XP</li>
            <li>Brincar: cooldown 1h · +20 humor, +20 XP</li>
            <li>Missões diárias: +5 humor, +15 XP automático</li>
            <li>A cada 50×nível XP, seu companheiro sobe de nível</li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}

