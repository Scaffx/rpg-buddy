import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useAttributes } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Heart, Shield, Zap, Flame, Droplets, UtensilsCrossed,
  Settings, Plus, Minus, Save, Dumbbell, Brain, Eye,
  Swords, Sparkles, BookOpen, Users, Star, Palette,
  ChevronUp, ChevronDown,
} from "lucide-react";
import { getAttributeColorClass } from "@/lib/attributes";

const ATTRIBUTE_ICONS: Record<string, any> = {
  Agilidade: Zap, Carisma: Users, Criatividade: Palette,
  Disciplina: Sparkles, Força: Dumbbell, Inteligência: Brain,
  Resiliência: Shield, Sabedoria: BookOpen, Vitalidade: Heart,
  Autoaperfeiçoamento: Star, Relacionamento: Users,
};

function useHealthStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["health_stats", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_health_stats" as any)
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!user,
  });
}

function useTodayMeals() {
  const { user } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  return useQuery({
    queryKey: ["meal_log", user?.id, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meal_log" as any)
        .select("*")
        .eq("user_id", user!.id)
        .eq("meal_date", today);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });
}

function useTodayWater() {
  const { user } = useAuth();
  const today = new Date().toISOString().split("T")[0];
  return useQuery({
    queryKey: ["water_log", user?.id, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("water_log" as any)
        .select("*")
        .eq("user_id", user!.id)
        .eq("log_date", today);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: attributes } = useAttributes();
  const { data: healthStats } = useHealthStats();
  const { data: todayMeals } = useTodayMeals();
  const { data: todayWater } = useTodayWater();
  const queryClient = useQueryClient();

  const [showSettings, setShowSettings] = useState(false);
  const [weight, setWeight] = useState(70);
  const [mealsTarget, setMealsTarget] = useState(3);

  useEffect(() => {
    if (healthStats) {
      setWeight(Number(healthStats.weight_kg) || 70);
      setMealsTarget(healthStats.meals_target || 3);
    }
  }, [healthStats]);

  const waterTargetMl = Math.round(weight * 35);
  const totalWaterToday = (todayWater || []).reduce((s: number, w: any) => s + (w.amount_ml || 0), 0);
  const mealsToday = (todayMeals || []).length;

  // HP penalty: if meals < half target, lose 10 HP per missing meal below half
  const mealHalf = Math.ceil(mealsTarget / 2);
  const mealPenalty = mealsToday < mealHalf ? (mealHalf - mealsToday) * 10 : 0;
  const maxHp = healthStats?.max_hp ?? 100;
  const currentHp = Math.max(0, maxHp - mealPenalty);
  const maxMp = healthStats?.max_mp ?? 10;
  const currentMp = healthStats?.current_mp ?? 10;
  const fatigue = healthStats?.fatigue ?? 0;

  const saveSettings = useMutation({
    mutationFn: async () => {
      const wTarget = Math.round(weight * 35);
      if (healthStats) {
        await supabase
          .from("user_health_stats" as any)
          .update({ weight_kg: weight, meals_target: mealsTarget, water_target_ml: wTarget } as any)
          .eq("user_id", user!.id);
      } else {
        await supabase
          .from("user_health_stats" as any)
          .insert({ user_id: user!.id, weight_kg: weight, meals_target: mealsTarget, water_target_ml: wTarget } as any);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health_stats"] });
      toast.success("Configurações salvas!");
      setShowSettings(false);
    },
  });

  const logMeal = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      await supabase
        .from("meal_log" as any)
        .insert({ user_id: user!.id, meal_date: today, meal_number: mealsToday + 1 } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meal_log"] });
      toast.success("Refeição registrada! 🍖");
    },
  });

  const logWater = useMutation({
    mutationFn: async (amount: number) => {
      const today = new Date().toISOString().split("T")[0];
      await supabase
        .from("water_log" as any)
        .insert({ user_id: user!.id, log_date: today, amount_ml: amount } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["water_log"] });
      toast.success("Água registrada! 💧");
    },
  });

  const waterPercent = Math.min(100, Math.round((totalWaterToday / waterTargetMl) * 100));
  const hpPercent = Math.round((currentHp / maxHp) * 100);
  const mpPercent = Math.round((currentMp / maxMp) * 100);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary font-display">⚔️ Meu Perfil</h1>
            <p className="text-sm text-muted-foreground">Status do Herói</p>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
          >
            <Settings className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-4 animate-in slide-in-from-top-2">
            <h3 className="text-sm font-bold text-foreground">⚙️ Configurações do Herói</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Peso (kg)</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setWeight(Math.max(30, weight - 1))} className="p-1 rounded bg-muted hover:bg-muted/80"><Minus className="w-4 h-4" /></button>
                  <span className="text-lg font-bold text-foreground w-16 text-center">{weight}</span>
                  <button onClick={() => setWeight(Math.min(200, weight + 1))} className="p-1 rounded bg-muted hover:bg-muted/80"><Plus className="w-4 h-4" /></button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Meta de água: {Math.round(weight * 35)}ml/dia</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Refeições por dia</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setMealsTarget(Math.max(1, mealsTarget - 1))} className="p-1 rounded bg-muted hover:bg-muted/80"><Minus className="w-4 h-4" /></button>
                  <span className="text-lg font-bold text-foreground w-16 text-center">{mealsTarget}x</span>
                  <button onClick={() => setMealsTarget(Math.min(8, mealsTarget + 1))} className="p-1 rounded bg-muted hover:bg-muted/80"><Plus className="w-4 h-4" /></button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">Mínimo {Math.ceil(mealsTarget / 2)}x para não perder HP</p>
              </div>
            </div>
            <button
              onClick={() => saveSettings.mutate()}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
            >
              <Save className="w-4 h-4" /> Salvar
            </button>
          </div>
        )}

        {/* HP / MP / Fatigue - RPG Style */}
        <div className="bg-card/80 backdrop-blur border border-border rounded-xl p-5 space-y-4">
          {/* HP Bar */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 w-14">
              <Heart className="w-5 h-5 text-red-400" />
              <span className="text-xs font-bold text-red-400">HP</span>
            </div>
            <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden border border-red-900/30">
              <div
                className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-500 rounded-full"
                style={{ width: `${hpPercent}%` }}
              />
            </div>
            <span className="text-sm font-bold text-foreground w-20 text-right">{currentHp}/{maxHp}</span>
          </div>

          {/* MP Bar */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 w-14">
              <Shield className="w-5 h-5 text-blue-400" />
              <span className="text-xs font-bold text-blue-400">MP</span>
            </div>
            <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden border border-blue-900/30">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500 rounded-full"
                style={{ width: `${mpPercent}%` }}
              />
            </div>
            <span className="text-sm font-bold text-foreground w-20 text-right">{currentMp}/{maxMp}</span>
          </div>

          {/* Fatigue */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 w-14">
              <Flame className="w-5 h-5 text-orange-400" />
            </div>
            <span className="text-sm text-muted-foreground">FADIGA:</span>
            <span className="text-xl font-bold text-foreground">{fatigue}</span>
          </div>

          {mealPenalty > 0 && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              ⚠️ Você perdeu {mealPenalty} HP por não comer o suficiente!
            </p>
          )}
        </div>

        {/* Hunger & Thirst */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Hunger/Food */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UtensilsCrossed className="w-5 h-5 text-orange-400" />
                <h3 className="text-sm font-bold text-foreground">FOME</h3>
              </div>
              <span className="text-xs text-muted-foreground">Meta: {mealsTarget}x/dia</span>
            </div>

            <div className="flex items-center gap-2">
              {Array.from({ length: mealsTarget }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 h-8 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${
                    i < mealsToday
                      ? "bg-orange-500/20 border-orange-500/50 text-orange-400"
                      : "bg-muted/30 border-border text-muted-foreground/40"
                  }`}
                >
                  {i < mealsToday ? "🍖" : `${i + 1}`}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{mealsToday}/{mealsTarget} refeições</span>
              <button
                onClick={() => logMeal.mutate()}
                disabled={mealsToday >= mealsTarget}
                className="flex items-center gap-1 px-3 py-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg text-xs font-medium hover:bg-orange-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-3 h-3" /> Refeição
              </button>
            </div>

            {mealsToday < mealHalf && (
              <p className="text-[10px] text-red-400">⚠️ Coma pelo menos {mealHalf}x para não perder HP!</p>
            )}
          </div>

          {/* Thirst/Water */}
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Droplets className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-foreground">SEDE</h3>
              </div>
              <span className="text-xs text-muted-foreground">{waterTargetMl}ml/dia</span>
            </div>

            <div className="relative h-8 bg-muted rounded-full overflow-hidden border border-cyan-900/30">
              <div
                className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-500 rounded-full"
                style={{ width: `${waterPercent}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
                {totalWaterToday}ml / {waterTargetMl}ml
              </span>
            </div>

            <div className="flex items-center gap-2 justify-center">
              {[150, 250, 500].map((ml) => (
                <button
                  key={ml}
                  onClick={() => logWater.mutate(ml)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-medium hover:bg-cyan-500/30 transition-colors"
                >
                  <Droplets className="w-3 h-3" /> {ml}ml
                </button>
              ))}
            </div>

            <p className="text-[10px] text-muted-foreground text-center">
              Base: {weight}kg × 35ml = {waterTargetMl}ml
            </p>
          </div>
        </div>

        {/* Attributes Grid */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-foreground">📊 ATRIBUTOS</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(attributes || []).map((attr: any) => {
              const Icon = ATTRIBUTE_ICONS[attr.name] || Star;
              const colorClass = getAttributeColorClass(attr.name);
              return (
                <div
                  key={attr.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${colorClass}`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{attr.name.substring(0, 3).toUpperCase()}</p>
                    <p className="text-lg font-bold">{attr.xp}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {attributes && attributes.length > 0 && (
            <p className="text-[10px] text-muted-foreground text-center">
              Pontos de Habilidade Disponíveis: 0
            </p>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
