import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PawPrint, Sparkles, Heart, Swords, Clock, Loader2, Edit2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCompanion,
  useCreateCompanion,
  useInteractCompanion,
  COMPANION_TYPES,
  getMoodTier,
  computeLiveMood,
  isCooldownDone,
  xpForNextLevel,
  type CompanionRow,
} from '@/hooks/useCompanion';

const FEED_COOLDOWN_MIN  = 180; // 3 hours
const PLAY_COOLDOWN_MIN  = 60;  // 1 hour

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
        onError:   () => toast.error('Erro ao criar companheiro. Tente novamente.'),
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
            className={`text-left p-5 rounded-2xl border-2 transition-all ${
              picked === ct.id
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card/50 hover:border-primary/40'
            }`}
          >
            <div className="text-5xl mb-3">{ct.emoji}</div>
            <h3 className="font-bold text-base">{ct.name}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{ct.description}</p>
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
                placeholder="Ex: Frostbite, Cinzas, Ember…"
                maxLength={32}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <Button onClick={handleCreate} disabled={createCompanion.isPending}>
                {createCompanion.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Companion Card ──────────────────────────────────────────────────────────

function CompanionCard({ companion }: { companion: CompanionRow }) {
  const { user } = useAuth();
  const qc       = useQueryClient();
  const interact = useInteractCompanion();

  const [editingName, setEditingName] = useState(false);
  const [nameInput,   setNameInput]   = useState(companion.name);

  const ct       = COMPANION_TYPES.find((c) => c.id === companion.companion_type);
  const liveMood = useMemo(() => computeLiveMood(companion), [companion]);
  const moodTier = getMoodTier(liveMood);
  const xpNeeded = xpForNextLevel(companion.level);
  const xpPct    = Math.min(100, Math.round((companion.xp / xpNeeded) * 100));

  const canFeed = isCooldownDone(companion.last_fed_at,   FEED_COOLDOWN_MIN);
  const canPlay = isCooldownDone(companion.last_played_at, PLAY_COOLDOWN_MIN);

  function feedCooldownLabel() {
    if (!companion.last_fed_at) return '';
    const minsLeft = Math.ceil(FEED_COOLDOWN_MIN - (Date.now() - new Date(companion.last_fed_at).getTime()) / 60000);
    if (minsLeft <= 0) return '';
    const h = Math.floor(minsLeft / 60), m = minsLeft % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function playCooldownLabel() {
    if (!companion.last_played_at) return '';
    const minsLeft = Math.ceil(PLAY_COOLDOWN_MIN - (Date.now() - new Date(companion.last_played_at).getTime()) / 60000);
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
    qc.invalidateQueries({ queryKey: ['companion', user.id] });
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

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <PawPrint className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Meu Companheiro</h1>
          <p className="text-sm text-muted-foreground">Cuide bem do seu familiar</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Companion main card */}
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

            <Badge variant="outline" className="text-xs">
              {ct?.name ?? companion.companion_type}
            </Badge>
          </div>

          {/* Mood */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium">
              <span className="flex items-center gap-1">
                <Heart className="w-3.5 h-3.5" /> Humor
              </span>
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

          {/* Level / XP */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-medium">
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> Nível {companion.level}
              </span>
              <span className="text-muted-foreground">{companion.xp} / {xpNeeded} XP</span>
            </div>
            <Progress value={xpPct} className="h-2" />
          </div>
        </motion.div>

        {/* Interactions */}
        <div className="space-y-4">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Interações</h3>

          {/* Feed */}
          <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="text-2xl">🍖</div>
              <div className="flex-1">
                <p className="font-semibold text-sm">Alimentar</p>
                <p className="text-xs text-muted-foreground">+12 humor · +10 XP · cooldown 3h</p>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!canFeed || interact.isPending}
              onClick={() => handleInteract('feed')}
              variant={canFeed ? 'default' : 'outline'}
            >
              {canFeed ? 'Alimentar agora 🍖' : (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Disponível em {feedCooldownLabel()}
                </span>
              )}
            </Button>
          </div>

          {/* Play */}
          <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="text-2xl">🎮</div>
              <div className="flex-1">
                <p className="font-semibold text-sm">Brincar</p>
                <p className="text-xs text-muted-foreground">+20 humor · +20 XP · cooldown 1h</p>
              </div>
            </div>
            <Button
              className="w-full"
              disabled={!canPlay || interact.isPending}
              onClick={() => handleInteract('play')}
              variant={canPlay ? 'default' : 'outline'}
            >
              {canPlay ? 'Brincar agora 🎮' : (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Disponível em {playCooldownLabel()}
                </span>
              )}
            </Button>
          </div>

          {/* Mission tip */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <Swords className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold">Dica do Familiar</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Completar missões diárias dá +5 humor e +15 XP ao seu companheiro automaticamente!
                </p>
              </div>
            </div>
          </div>

          {/* Last interaction */}
          <div className="text-xs text-muted-foreground space-y-1 px-1">
            {companion.last_fed_at && (
              <p>🍖 Última refeição: {new Date(companion.last_fed_at).toLocaleString('pt-BR')}</p>
            )}
            {companion.last_played_at && (
              <p>🎮 Última brincadeira: {new Date(companion.last_played_at).toLocaleString('pt-BR')}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompanionPage() {
  const { data: companion, isLoading } = useCompanion();

  return (
    <AppLayout>
      {isLoading ? (
        <div className="flex items-center justify-center min-h-screen gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Carregando companheiro…</span>
        </div>
      ) : companion ? (
        <CompanionCard companion={companion} />
      ) : (
        <SelectionScreen />
      )}
    </AppLayout>
  );
}
