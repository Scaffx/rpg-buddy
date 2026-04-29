
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePlans, useCreatePlan, useDeletePlan, type PlanView } from "@/hooks/usePlans";
import { useMissions } from "@/hooks/useProfile";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";

type MissionOption = {
  id: string;
  title: string;
};

function toMissionOption(value: unknown): MissionOption | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string") {
    return null;
  }

  return {
    id: record.id,
    title: typeof record.title === "string" ? record.title : record.id,
  };
}

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
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: plans, isLoading } = usePlans();
  const { data: missions } = useMissions();
  const createPlan = useCreatePlan();
  const deletePlan = useDeletePlan();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    missions: [] as { mission_id: string; value_per_completion: number }[],
  });

  function handleMissionValueChange(mission_id: string, value: number) {
    setForm((f) => ({
      ...f,
      missions: f.missions.map((m) =>
        m.mission_id === mission_id ? { ...m, value_per_completion: value } : m
      ),
    }));
  }

  function handleAddMission(mission_id: string, value: number) {
    setForm((f) => ({
      ...f,
      missions: [...f.missions, { mission_id, value_per_completion: value }],
    }));
    setMissionToAdd("");
    setMissionValue(0);
  }

  function handleRemoveMission(mission_id: string) {
    setForm((f) => ({
      ...f,
      missions: f.missions.filter((m) => m.mission_id !== mission_id),
    }));
  }

  const [missionToAdd, setMissionToAdd] = useState("");
  const [missionValue, setMissionValue] = useState(0);
  const missionOptions = (missions ?? [])
    .map(toMissionOption)
    .filter((mission): mission is MissionOption => mission !== null);

  const calculatedTargetValue = form.missions.reduce(
    (total, mission) => total + Number(mission.value_per_completion || 0),
    0,
  );

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (form.missions.length === 0 || calculatedTargetValue <= 0) {
      toast({
        title: "Adicione ao menos uma missão",
        description: "Selecione uma missão e defina a quantidade antes de salvar.",
        variant: "destructive",
      });
      return;
    }

    createPlan.mutate({ ...form, target_value: calculatedTargetValue }, {
      onSuccess: () => {
        setModalOpen(false);
        setForm({ title: "", description: "", missions: [] });
        toast({ title: "Plano criado!", description: form.title });
      },
      onError: (err) => {
        toast({
          title: "Erro ao salvar plano",
          description: err instanceof Error ? err.message : "Tente novamente.",
          variant: "destructive",
        });
      },
    });
  }

  const TEMPLATES = [
    { title: "Viagem dos Sonhos", description: "Juntar dinheiro para uma viagem inesquecível." },
    { title: "Comprar PC Gamer", description: "Economizar para o setup ideal." },
    { title: "Ler 12 livros no ano", description: "Cultivar o hábito de leitura." },
    { title: "100h de Estudo", description: "Dominar uma nova habilidade ou idioma." },
    { title: "Perder 10kg", description: "Meta de transformação física." },
    { title: "Correr 100km", description: "Distância acumulada de corridas." },
  ];

  function applyTemplate(t: typeof TEMPLATES[number]) {
    setForm((f) => ({ ...f, title: t.title, description: t.description }));
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-display font-bold text-primary">{t('app.priority.page_title')}</h1>
        <Button onClick={() => setModalOpen(true)}>{t('app.priority.new_plan_button')}</Button>
      </div>

      <div className="mb-6 p-4 rounded-lg bg-muted/30 border border-border/40">
        <p className="text-sm text-foreground font-semibold mb-1">🎯 {t('app.priority.how_it_works_title')}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('app.priority.how_it_works_body')}
        </p>
      </div>

      {/* Modal de criação */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="bg-gradient-to-br from-background via-secondary/60 to-background border border-border/60 shadow-2xl max-h-[90vh] overflow-y-auto">
          <form className="space-y-4" onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle className="text-2xl font-extrabold text-primary drop-shadow">{t('app.priority.modal_title')}</DialogTitle>
            </DialogHeader>

            <div className="space-y-2">
              <Label className="text-xs">⚡ {t('app.priority.quick_templates')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.title}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="text-[11px] px-2 py-1 rounded-md bg-muted/50 border border-border/60 hover:bg-primary/10 hover:border-primary/40 transition-colors"
                    title={t.description}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
            <Label htmlFor="plan-title">{t('app.priority.label_title')}</Label>
              <Input
                id="plan-title"
                placeholder="Ex: Viagem dos Sonhos, Novo PC Gamer, Curso de Inglês..."
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
                className="bg-muted/60 border-border/60 placeholder:text-muted-foreground/80"
              />
            </div>
            <div className="space-y-2">
            <Label htmlFor="plan-desc">{t('app.priority.label_description')}</Label>
              <Textarea
                id="plan-desc"
                placeholder="Ex: Juntar dinheiro para viajar, comprar um item caro, conquistar uma certificação, etc."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="bg-muted/60 border-border/60 placeholder:text-muted-foreground/80"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('app.priority.label_missions')}</Label>
              <p className="text-xs text-muted-foreground">
                Cada missão concluída soma 1 no progresso. O total do plano é a soma das quantidades definidas abaixo.
              </p>
              <div className="space-y-2">
                {form.missions.length === 0 && (
                  <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2 border border-dashed border-border/40 text-center">{t('app.priority.no_missions')}</div>
                )}
                {form.missions.map((m) => {
                  const mission = missionOptions.find((missionItem) => missionItem.id === m.mission_id);
                  return (
                    <div key={m.mission_id} className="flex items-center gap-2 bg-muted/40 rounded p-2 border border-border/40">
                      <span className="text-sm flex-1 font-semibold text-primary">{mission?.title || m.mission_id}</span>
                      <Input
                        type="number"
                        min={1}
                        className="w-20 bg-background/80 border-border/60"
                        value={m.value_per_completion}
                        onChange={(e) => handleMissionValueChange(m.mission_id, Number(e.target.value))}
                      />
                      <Button type="button" size="sm" variant="destructive" onClick={() => handleRemoveMission(m.mission_id)}>
                        {t('app.priority.button_remove')}
                      </Button>
                    </div>
                  );
                })}
                <div className="flex items-center gap-2 mt-2 bg-muted/30 rounded p-2 border border-dashed border-border/40">
                  <select
                    className="h-10 w-full rounded-md border border-primary/40 bg-slate-900/90 px-3 text-sm text-slate-100 shadow-inner outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                    value={missionToAdd}
                    onChange={(e) => setMissionToAdd(e.target.value)}
                  >
                    <option value="" className="bg-slate-900 text-slate-100">{t('app.priority.select_mission')}</option>
                    {missionOptions
                      .filter((mission) => !form.missions.some((fm) => fm.mission_id === mission.id))
                      .map((mission) => (
                      <option key={mission.id} value={mission.id} className="bg-slate-900 text-slate-100">{mission.title}</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min={1}
                    className="w-20 bg-background/80 border-border/60"
                    placeholder="Qtd"
                    value={missionValue || ""}
                    onChange={(e) => setMissionValue(Number(e.target.value))}
                    disabled={!missionToAdd}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => missionToAdd && missionValue > 0 && handleAddMission(missionToAdd, missionValue)}
                    disabled={!missionToAdd || missionValue <= 0}
                  >
                    {t('app.priority.button_add_mission')}
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                {t('app.priority.button_cancel')}
              </Button>
              <Button type="submit" disabled={createPlan.isPending}>
                {t('app.priority.button_save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Cards dos planos/metas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div>{t('app.priority.loading')}</div>
        ) : plans?.length === 0 ? (
          <div className="text-muted-foreground">{t('app.priority.empty')}</div>
        ) : (
          plans?.map((plan: PlanView) => {
            const safeTargetValue = Math.max(1, Number(plan.target_value || 1));
            const percent = Math.min(100, Math.round((Number(plan.current_value || 0) / safeTargetValue) * 100));
            return (
              <div key={plan.id} className="rpg-card-glow p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg text-foreground">{plan.title}</h3>
                  <Button size="sm" variant="destructive" onClick={() => deletePlan.mutate(plan.id)}>
                    {t('app.priority.button_delete')}
                  </Button>
                </div>
                <p className="text-muted-foreground text-sm">{plan.description}</p>
                <ProgressBar value={Number(plan.current_value || 0)} max={safeTargetValue} />
                <div className="flex justify-between text-xs mt-1">
                  <span>
                    {Number(plan.current_value || 0)} / {safeTargetValue}
                  </span>
                  <span>{percent}%</span>
                </div>
                <div className="mt-2">
                  <p className="font-semibold text-xs mb-1">{t('app.priority.linked_missions')}:</p>
                  <ul className="list-disc ml-4 text-xs text-muted-foreground">
                    {plan.plan_missions?.map((pm) => (
                      <li key={pm.id}>
                        {pm.missions?.title} ({pm.value_per_completion} conclusoes necessarias)
                      </li>
                    ))}
                  </ul>
                </div>
                {percent >= 100 && (
                  <div className="text-success font-bold mt-2">{t('app.priority.plan_complete')}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </AppLayout>
  );
}
