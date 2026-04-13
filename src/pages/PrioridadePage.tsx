
import { useState } from "react";
import { usePlans, useCreatePlan, useDeletePlan } from "@/hooks/usePlans";
import { useMissions } from "@/hooks/useProfile";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

function ProgressBar({ value, max }: { value: number; max: number }) {
  const percent = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="w-full bg-muted rounded-full h-3 overflow-hidden border border-border/40">
      <div
        className="bg-primary h-3 rounded-full transition-all"
        style={{ width: percent + "%" }}
      />
    </div>
  );
}

export default function PrioridadePage() {
  const { data: plans, isLoading } = usePlans();
  const { data: missions } = useMissions();
  const createPlan = useCreatePlan();
  const deletePlan = useDeletePlan();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    target_value: 0,
    missions: [] as { mission_id: string; value_per_completion: number }[],
  });

  function handleMissionChange(mission_id: string, value: number) {
    setForm((f) => {
      const exists = f.missions.find((m) => m.mission_id === mission_id);
      if (exists) {
        return {
          ...f,
          missions: f.missions.map((m) =>
            m.mission_id === mission_id ? { ...m, value_per_completion: value } : m
          ),
        };
      } else {
        return {
          ...f,
          missions: [...f.missions, { mission_id, value_per_completion: value }],
        };
      }
    });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createPlan.mutate(form, {
      onSuccess: () => {
        setModalOpen(false);
        setForm({ title: "", description: "", target_value: 0, missions: [] });
      },
    });
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-bold text-primary">Planos & Metas</h1>
        <Button onClick={() => setModalOpen(true)}>Novo Plano/Meta</Button>
      </div>

      {/* Modal de criação */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <form className="space-y-4" onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Novo Plano/Meta</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="plan-title">Título</Label>
              <Input
                id="plan-title"
                placeholder="Ex: Viajar para a praia"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-desc">Descrição</Label>
              <Textarea
                id="plan-desc"
                placeholder="Descreva sua meta ou plano de longo prazo..."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-target">Valor Meta</Label>
              <Input
                id="plan-target"
                type="number"
                min={1}
                placeholder="Ex: 1200 (reais, pontos, horas...)"
                value={form.target_value}
                onChange={(e) => setForm((f) => ({ ...f, target_value: Number(e.target.value) }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Missões que contribuem</Label>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {missions?.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      className="w-20"
                      placeholder="Valor"
                      value={
                        form.missions.find((x) => x.mission_id === m.id)?.value_per_completion || ""
                      }
                      onChange={(e) =>
                        handleMissionChange(m.id, Number(e.target.value))
                      }
                    />
                    <span className="text-sm">{m.title}</span>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createPlan.isPending}>
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Cards dos planos/metas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div>Carregando...</div>
        ) : plans?.length === 0 ? (
          <div className="text-muted-foreground">Nenhum plano cadastrado.</div>
        ) : (
          plans?.map((plan: any) => {
            const percent = Math.min(100, Math.round((plan.current_value / plan.target_value) * 100));
            return (
              <div key={plan.id} className="rpg-card-glow p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg text-foreground">{plan.title}</h3>
                  <Button size="sm" variant="destructive" onClick={() => deletePlan.mutate(plan.id)}>
                    Excluir
                  </Button>
                </div>
                <p className="text-muted-foreground text-sm">{plan.description}</p>
                <ProgressBar value={plan.current_value} max={plan.target_value} />
                <div className="flex justify-between text-xs mt-1">
                  <span>
                    {plan.current_value} / {plan.target_value}
                  </span>
                  <span>{percent}%</span>
                </div>
                <div className="mt-2">
                  <p className="font-semibold text-xs mb-1">Missões vinculadas:</p>
                  <ul className="list-disc ml-4 text-xs text-muted-foreground">
                    {plan.plan_missions?.map((pm: any) => (
                      <li key={pm.id}>
                        {pm.missions?.title} (+{pm.value_per_completion} por conclusão)
                      </li>
                    ))}
                  </ul>
                </div>
                {percent >= 100 && (
                  <div className="text-success font-bold mt-2">Plano Concluído!</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </AppLayout>
  );
}
