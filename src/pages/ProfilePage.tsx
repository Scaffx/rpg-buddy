import { useState, useEffect, useRef, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useAttributes } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Heart, Shield, Zap, Flame, Droplets, UtensilsCrossed,
  Settings, Plus, Minus, Save, Dumbbell, Brain, Eye,
  Swords, Sparkles, BookOpen, Users, Star, Palette,
  ChevronUp, ChevronDown, Camera, Ruler, TrendingUp,
  Calendar, Upload, Trash2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { getAttributeColorClass } from "@/lib/attributes";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

function useBodyMeasurements() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["body_measurements", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("body_measurements" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("measured_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!user,
  });
}

const MEASUREMENT_FIELDS = [
  { key: "weight_kg", label: "Peso", unit: "kg", icon: "⚖️" },
  { key: "body_fat_percent", label: "Gordura", unit: "%", icon: "🔥" },
  { key: "chest_cm", label: "Peito", unit: "cm", icon: "💪" },
  { key: "waist_cm", label: "Cintura", unit: "cm", icon: "📏" },
  { key: "hip_cm", label: "Quadril", unit: "cm", icon: "🦴" },
  { key: "arm_cm", label: "Braço", unit: "cm", icon: "💪" },
  { key: "thigh_cm", label: "Coxa", unit: "cm", icon: "🦵" },
  { key: "calf_cm", label: "Panturrilha", unit: "cm", icon: "🦶" },
];

function BodyEvolutionSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: measurements } = useBodyMeasurements();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const saveMeasurement = useMutation({
    mutationFn: async () => {
      setUploading(true);
      let photoUrl: string | null = null;

      if (photoFile && user) {
        const ext = photoFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("body-photos")
          .upload(path, photoFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("body-photos").getPublicUrl(path);
        photoUrl = urlData.publicUrl;
      }

      const record: any = {
        user_id: user!.id,
        measured_at: new Date().toISOString().split("T")[0],
        notes: notes || null,
        photo_url: photoUrl,
      };

      for (const f of MEASUREMENT_FIELDS) {
        const val = formData[f.key];
        record[f.key] = val ? parseFloat(val) : null;
      }

      const { error } = await supabase.from("body_measurements" as any).insert(record as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["body_measurements"] });
      toast.success("Medidas registradas! 📐");
      setShowForm(false);
      setFormData({});
      setNotes("");
      setPhotoFile(null);
      setPhotoPreview(null);
      setUploading(false);
    },
    onError: () => {
      setUploading(false);
      toast.error("Erro ao salvar medidas");
    },
  });

  const photosWithUrl = (measurements || []).filter((m: any) => m.photo_url);
  const latest = measurements?.[0];
  const previous = measurements?.[1];

  const getDiff = (key: string) => {
    if (!latest || !previous) return null;
    const curr = Number(latest[key]);
    const prev = Number(previous[key]);
    if (!curr || !prev) return null;
    const diff = curr - prev;
    return diff;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Ruler className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-bold text-foreground">🏋️ EVOLUÇÃO FÍSICA</h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium hover:bg-emerald-500/30 transition-colors"
        >
          <Plus className="w-3 h-3" /> Nova Medição
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-card border border-emerald-500/20 rounded-xl p-4 space-y-4 animate-in slide-in-from-top-2">
          <h4 className="text-xs font-bold text-emerald-400">📐 Registrar Medidas</h4>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {MEASUREMENT_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="text-[10px] text-muted-foreground mb-0.5 block">
                  {f.icon} {f.label} ({f.unit})
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData[f.key] || ""}
                  onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                  className="w-full px-2 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:border-emerald-500/50 outline-none"
                  placeholder="0"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="text-[10px] text-muted-foreground mb-0.5 block">📝 Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-2 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:border-emerald-500/50 outline-none resize-none h-16"
              placeholder="Como você está se sentindo?"
            />
          </div>

          {/* Photo Upload */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">📷 Foto de Progresso</label>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            <div className="flex items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-3 py-2 bg-muted border border-border rounded-lg text-xs text-muted-foreground hover:border-emerald-500/50 transition-colors"
              >
                <Upload className="w-3 h-3" /> Escolher foto
              </button>
              {photoPreview && (
                <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-emerald-500/30">
                  <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                    className="absolute top-0.5 right-0.5 p-0.5 bg-background/80 rounded-full"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => saveMeasurement.mutate()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-foreground rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" /> {uploading ? "Salvando..." : "Salvar Medidas"}
          </button>
        </div>
      )}

      {/* Latest Measurements */}
      {latest && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              📅 Última medição: {format(new Date(latest.measured_at), "dd MMM yyyy", { locale: ptBR })}
            </span>
            {measurements && measurements.length > 1 && (
              <span className="text-[10px] text-emerald-400">{measurements.length} registros</span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MEASUREMENT_FIELDS.map((f) => {
              const value = latest[f.key];
              if (!value) return null;
              const diff = getDiff(f.key);
              return (
                <div key={f.key} className="bg-muted/30 border border-border rounded-lg p-2">
                  <p className="text-[10px] text-muted-foreground">{f.icon} {f.label}</p>
                  <div className="flex items-end gap-1">
                    <span className="text-lg font-bold text-foreground">{Number(value).toFixed(1)}</span>
                    <span className="text-[10px] text-muted-foreground mb-0.5">{f.unit}</span>
                  </div>
                  {diff !== null && diff !== 0 && (
                    <span className={`text-[10px] font-medium ${diff < 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {diff > 0 ? "+" : ""}{diff.toFixed(1)} {f.unit}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {latest.notes && (
            <p className="text-xs text-muted-foreground italic">📝 {latest.notes}</p>
          )}
        </div>
      )}

      {/* Evolution Chart */}
      {measurements && measurements.length >= 2 && (
        <EvolutionChart measurements={measurements} />
      )}

      {/* Photo Gallery */}
      {photosWithUrl.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold text-foreground">GALERIA DE PROGRESSO</h4>
            </div>
            <span className="text-[10px] text-muted-foreground">{photosWithUrl.length} fotos</span>
          </div>

          <div className="relative">
            <div className="aspect-[4/3] rounded-lg overflow-hidden border border-border bg-muted">
              <img
                src={photosWithUrl[photoIndex]?.photo_url}
                alt="Progresso"
                className="w-full h-full object-contain"
              />
            </div>
            <p className="text-[10px] text-muted-foreground text-center mt-1">
              {format(new Date(photosWithUrl[photoIndex]?.measured_at), "dd MMM yyyy", { locale: ptBR })}
            </p>
            {photosWithUrl.length > 1 && (
              <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2 pointer-events-none">
                <button
                  onClick={() => setPhotoIndex(Math.max(0, photoIndex - 1))}
                  disabled={photoIndex === 0}
                  className="pointer-events-auto p-1 bg-background/80 rounded-full border border-border disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPhotoIndex(Math.min(photosWithUrl.length - 1, photoIndex + 1))}
                  disabled={photoIndex === photosWithUrl.length - 1}
                  className="pointer-events-auto p-1 bg-background/80 rounded-full border border-border disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Thumbnail strip */}
          {photosWithUrl.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photosWithUrl.map((m: any, i: number) => (
                <button
                  key={m.id}
                  onClick={() => setPhotoIndex(i)}
                  className={`w-12 h-12 rounded-lg overflow-hidden border-2 shrink-0 transition-all ${
                    i === photoIndex ? "border-emerald-400" : "border-border opacity-60"
                  }`}
                >
                  <img src={m.photo_url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!latest && !showForm && (
        <div className="text-center py-8 text-muted-foreground">
          <Ruler className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhuma medição registrada ainda.</p>
          <p className="text-xs">Clique em "Nova Medição" para começar a rastrear!</p>
        </div>
      )}
    </div>
  );
}

function EvolutionChart({ measurements }: { measurements: any[] }) {
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["weight_kg"]);

  const CHART_METRICS = [
    { key: "weight_kg", label: "Peso", color: "#10b981", unit: "kg" },
    { key: "body_fat_percent", label: "Gordura", color: "#f59e0b", unit: "%" },
    { key: "chest_cm", label: "Peito", color: "#3b82f6", unit: "cm" },
    { key: "waist_cm", label: "Cintura", color: "#ef4444", unit: "cm" },
    { key: "hip_cm", label: "Quadril", color: "#8b5cf6", unit: "cm" },
    { key: "arm_cm", label: "Braço", color: "#06b6d4", unit: "cm" },
    { key: "thigh_cm", label: "Coxa", color: "#f97316", unit: "cm" },
    { key: "calf_cm", label: "Panturrilha", color: "#ec4899", unit: "cm" },
  ];

  const chartData = useMemo(() => {
    return [...measurements]
      .reverse()
      .map((m: any) => ({
        date: format(new Date(m.measured_at), "dd/MM", { locale: ptBR }),
        ...Object.fromEntries(CHART_METRICS.map(cm => [cm.key, m[cm.key] ? Number(m[cm.key]) : null])),
      }));
  }, [measurements]);

  const toggleMetric = (key: string) => {
    setSelectedMetrics(prev =>
      prev.includes(key) ? (prev.length > 1 ? prev.filter(k => k !== key) : prev) : [...prev, key]
    );
  };

  const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = require("recharts");

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-emerald-400" />
        <h4 className="text-xs font-bold text-foreground">📈 EVOLUÇÃO AO LONGO DO TEMPO</h4>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CHART_METRICS.map(m => (
          <button
            key={m.key}
            onClick={() => toggleMetric(m.key)}
            className={`px-2 py-1 rounded-md text-[10px] font-medium border transition-all ${
              selectedMetrics.includes(m.key)
                ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300"
                : "border-border bg-muted/30 text-muted-foreground hover:border-border/80"
            }`}
            style={selectedMetrics.includes(m.key) ? { borderColor: m.color + "80", backgroundColor: m.color + "20", color: m.color } : {}}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "11px",
              }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            {CHART_METRICS.filter(m => selectedMetrics.includes(m.key)).map(m => (
              <Line
                key={m.key}
                type="monotone"
                dataKey={m.key}
                stroke={m.color}
                strokeWidth={2}
                dot={{ r: 3, fill: m.color }}
                connectNulls
                name={`${m.label} (${m.unit})`}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
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

        {/* HP / MP / Fatigue */}
        <div className="bg-card/80 backdrop-blur border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 w-14">
              <Heart className="w-5 h-5 text-red-400" />
              <span className="text-xs font-bold text-red-400">HP</span>
            </div>
            <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden border border-red-900/30">
              <div className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-500 rounded-full" style={{ width: `${hpPercent}%` }} />
            </div>
            <span className="text-sm font-bold text-foreground w-20 text-right">{currentHp}/{maxHp}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 w-14">
              <Shield className="w-5 h-5 text-blue-400" />
              <span className="text-xs font-bold text-blue-400">MP</span>
            </div>
            <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden border border-blue-900/30">
              <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500 rounded-full" style={{ width: `${mpPercent}%` }} />
            </div>
            <span className="text-sm font-bold text-foreground w-20 text-right">{currentMp}/{maxMp}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 w-14">
              <Flame className="w-5 h-5 text-orange-400" />
            </div>
            <span className="text-sm text-muted-foreground">FADIGA:</span>
            <span className="text-xl font-bold text-foreground">{fatigue}</span>
          </div>
          {mealPenalty > 0 && (
            <p className="text-xs text-red-400 flex items-center gap-1">⚠️ Você perdeu {mealPenalty} HP por não comer o suficiente!</p>
          )}
        </div>

        {/* Hunger & Thirst */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div key={i} className={`flex-1 h-8 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${i < mealsToday ? "bg-orange-500/20 border-orange-500/50 text-orange-400" : "bg-muted/30 border-border text-muted-foreground/40"}`}>
                  {i < mealsToday ? "🍖" : `${i + 1}`}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{mealsToday}/{mealsTarget} refeições</span>
              <button onClick={() => logMeal.mutate()} disabled={mealsToday >= mealsTarget} className="flex items-center gap-1 px-3 py-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg text-xs font-medium hover:bg-orange-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <Plus className="w-3 h-3" /> Refeição
              </button>
            </div>
            {mealsToday < mealHalf && (
              <p className="text-[10px] text-red-400">⚠️ Coma pelo menos {mealHalf}x para não perder HP!</p>
            )}
          </div>

          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Droplets className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-foreground">SEDE</h3>
              </div>
              <span className="text-xs text-muted-foreground">{waterTargetMl}ml/dia</span>
            </div>
            <div className="relative h-8 bg-muted rounded-full overflow-hidden border border-cyan-900/30">
              <div className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all duration-500 rounded-full" style={{ width: `${waterPercent}%` }} />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">{totalWaterToday}ml / {waterTargetMl}ml</span>
            </div>
            <div className="flex items-center gap-2 justify-center">
              {[150, 250, 500].map((ml) => (
                <button key={ml} onClick={() => logWater.mutate(ml)} className="flex items-center gap-1 px-3 py-1.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-medium hover:bg-cyan-500/30 transition-colors">
                  <Droplets className="w-3 h-3" /> {ml}ml
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground text-center">Base: {weight}kg × 35ml = {waterTargetMl}ml</p>
          </div>
        </div>

        {/* Body Evolution */}
        <div className="bg-card border border-border rounded-xl p-4">
          <BodyEvolutionSection />
        </div>

        {/* Attributes Grid */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-foreground">📊 ATRIBUTOS</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(attributes || []).map((attr: any) => {
              const Icon = ATTRIBUTE_ICONS[attr.name] || Star;
              const colorClass = getAttributeColorClass(attr.name);
              return (
                <div key={attr.id} className={`flex items-center gap-3 p-3 rounded-lg border ${colorClass}`}>
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
            <p className="text-[10px] text-muted-foreground text-center">Pontos de Habilidade Disponíveis: 0</p>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
