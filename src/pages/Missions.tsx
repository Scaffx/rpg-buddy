import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMissions, useAttributes, useCreateMission, useCompleteMission } from '@/hooks/useProfile';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Check, Loader2, Swords } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Missions() {
  const [title, setTitle] = useState('');
  const [attrId, setAttrId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const { data: pending, isLoading: pLoading } = useMissions(false);
  const { data: completed } = useMissions(true);
  const { data: attrs } = useAttributes();
  const createMission = useCreateMission();
  const completeMission = useCompleteMission();
  const { toast } = useToast();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !attrId) return;
    try {
      await createMission.mutateAsync({ title: title.trim(), attributeId: attrId });
      setTitle('');
      setAttrId('');
      setShowForm(false);
      toast({ title: '📜 Missão criada!', description: 'Boa sorte, aventureiro!' });
    } catch {
      toast({ title: 'Erro ao criar missão', variant: 'destructive' });
    }
  };

  const handleComplete = async (mission: any) => {
    try {
      await completeMission.mutateAsync({
        missionId: mission.id,
        attributeId: mission.attribute_id,
        xpReward: mission.xp_reward,
      });
      toast({ title: '⚔️ Missão concluída!', description: `+${mission.xp_reward} XP ganhos!` });
    } catch {
      toast({ title: 'Erro', variant: 'destructive' });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-bold text-primary text-glow">
            <Swords className="w-6 h-6 inline mr-2" />
            Missões
          </h1>
          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            Nova Missão
          </Button>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              onSubmit={handleCreate}
              className="rpg-card-glow space-y-3 overflow-hidden"
            >
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título da missão..."
                required
                className="bg-secondary border-border"
              />
              <Select value={attrId} onValueChange={setAttrId}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Escolha o atributo" />
                </SelectTrigger>
                <SelectContent>
                  {attrs?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.icon} {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="submit"
                disabled={createMission.isPending}
                className="w-full bg-primary text-primary-foreground"
              >
                {createMission.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Criar Missão
              </Button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Pending */}
        <div>
          <h2 className="text-lg font-display font-semibold text-foreground mb-3">
            Pendentes ({pending?.length || 0})
          </h2>
          {pLoading ? (
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          ) : pending && pending.length > 0 ? (
            <div className="space-y-2">
              {pending.map((m, i) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rpg-card flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {(m as any).attributes?.icon} {(m as any).attributes?.name} • +{m.xp_reward} XP
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleComplete(m)}
                    disabled={completeMission.isPending}
                    className="bg-success text-success-foreground hover:bg-success/90 shrink-0"
                  >
                    <Check className="w-4 h-4" />
                  </Button>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma missão pendente. Crie uma nova!</p>
          )}
        </div>

        {/* Completed */}
        {completed && completed.length > 0 && (
          <div>
            <h2 className="text-lg font-display font-semibold text-foreground mb-3">
              Concluídas ({completed.length})
            </h2>
            <div className="space-y-2">
              {completed.slice(0, 10).map((m) => (
                <div key={m.id} className="rpg-card opacity-60 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground line-through">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.completed_at && new Date(m.completed_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <span className="text-primary text-sm font-bold">+{m.xp_reward} XP</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
