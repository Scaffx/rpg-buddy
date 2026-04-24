import { useState, useEffect, useRef, useMemo } from "react";
import { useTheme } from "next-themes";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useAttributes, useAwardHealthXP, useBosses, useUpdateDisplayName, useClasses, useSyncHealthMaxes } from "@/hooks/useProfile";
import {
  useFriends,
  usePendingRequests,
  useSearchProfile,
  useSendFriendRequest,
  useRespondFriendRequest,
  useRemoveFriend,
} from "@/hooks/useFriends";
import { useUserAchievements, useAllAchievements } from "@/hooks/useAchievements";
import { useGoldBalance } from "@/hooks/useGold";
import { useInventory, useToggleEquip, useToggleAttunement, useConsumeItem, useClaimStarterKit, getEquipmentBonuses, compareItems, type InventoryItem, type GameItem } from "@/hooks/useInventory";
import { supabase } from "@/integrations/supabase/client";
import { setVolume } from "@/lib/sfx";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Heart, Shield, Zap, Flame, Droplets, UtensilsCrossed,
  Settings, Plus, Minus, Save, Dumbbell, Brain, Eye,
  Swords, Sparkles, BookOpen, Users, Star, Palette,
  ChevronUp, ChevronDown, Camera, Ruler, TrendingUp, Skull, Coins,
  Calendar, Upload, Trash2, ChevronLeft, ChevronRight, Pencil, Check, X as XIcon,
  Moon, Sun, UserPlus, UserCheck, UserX, Search, Trophy, Lock,
} from "lucide-react";
import { getAttributeColorClass } from "@/lib/attributes";
import { getAttributeLevels, getBossCombatStats, getPlayerCombatStats, getSkillLoadout, getStarterItemForClass } from "@/lib/combat";
import HeroStatusBar from "@/components/HeroStatusBar";
import ActiveTalentsBadge from "@/components/ActiveTalentsBadge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ATTRIBUTE_ICONS: Record<string, any> = {
  Agilidade: Zap, Carisma: Users, Criatividade: Palette,
  Disciplina: Sparkles, Força: Dumbbell, Inteligência: Brain,
  Resiliência: Shield, Sabedoria: BookOpen, Vitalidade: Heart,
  Autoaperfeiçoamento: Star, Relacionamento: Users,
};

const RESPEC_COST = 120;
const MAX_COMBAT_SKILLS = 4;

// Maps tier-2 class name (in the progression tree) → StarterClassId
const CLASS_NAME_TO_STARTER: Record<string, string> = {
  Espadachim: 'guerreiro',
  Mago: 'mago',
  Gatuno: 'gatuno',
  Noviço: 'clerico',
  Arqueiro: 'arqueiro',
  Mercador: 'ferreiro',
};

const RESPEC_CLASSES = [
  { id: "guerreiro", label: "Guerreiro" },
  { id: "mago", label: "Mago" },
  { id: "gatuno", label: "Gatuno" },
  { id: "ferreiro", label: "Ferreiro" },
  { id: "clerico", label: "Clerico" },
  { id: "arqueiro", label: "Arqueiro" },
] as const;

function useHealthStats() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["health_stats", user?.id],
    queryFn: async () => {
      const today = new Date().toLocaleDateString('en-CA');
      const { data, error } = await supabase
        .from("user_health_stats" as any)
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;

      if (!data) return null;
      const d = data as any;

      const shouldReset = d.last_reset_date !== today;
      if (!shouldReset) {
        return d;
      }

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toLocaleDateString('en-CA');

      const { data: yesterdayWater, error: waterError } = await supabase
        .from("water_log" as any)
        .select("amount_ml")
        .eq("user_id", user!.id)
        .eq("log_date", yesterdayStr);

      if (waterError) throw waterError;

      const targetWater = Number(d.water_target_ml ?? Math.round(Number(d.weight_kg ?? 70) * 35));
      const halfTarget = targetWater / 2;
      const yesterdayTotal = (yesterdayWater || []).reduce((sum: number, row: any) => sum + Number(row.amount_ml || 0), 0);
      const shouldAddFatigue = targetWater > 0 && yesterdayTotal < halfTarget;
      const fatigueGain = shouldAddFatigue ? 35 : 0;
      const nextFatigue = Math.min(100, Number(d.fatigue ?? 0) + fatigueGain);

      const resetPayload = {
        current_hp: Number(d.max_hp ?? 100),
        fatigue: nextFatigue,
        last_reset_date: today,
      };

      const { data: resetData, error: resetError } = await supabase
        .from("user_health_stats" as any)
        .update(resetPayload as any)
        .eq("user_id", user!.id)
        .select('*')
        .single();

      if (resetError) throw resetError;
      return resetData as any;
    },
    enabled: !!user,
  });
}

function useTodayMeals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["meal_log", user?.id],
    queryFn: async () => {
      const today = new Date().toLocaleDateString('en-CA');
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
  return useQuery({
    queryKey: ["water_log", user?.id],
    queryFn: async () => {
      const today = new Date().toLocaleDateString('en-CA');
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
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Generate signed URLs for photos stored as paths
  useEffect(() => {
    const photoPaths = (measurements || [])
      .filter((m: any) => m.photo_url && !m.photo_url.startsWith('http'))
      .map((m: any) => m.photo_url as string);
    if (photoPaths.length === 0) return;

    const fetchSignedUrls = async () => {
      const urls: Record<string, string> = {};
      for (const path of photoPaths) {
        const { data } = await supabase.storage
          .from('body-photos')
          .createSignedUrl(path, 3600);
        if (data?.signedUrl) urls[path] = data.signedUrl;
      }
      setSignedUrls(prev => ({ ...prev, ...urls }));
    };
    fetchSignedUrls();
  }, [measurements]);

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
        photoUrl = path;
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

  const getPhotoUrl = (photoUrl: string) => {
    if (photoUrl.startsWith('http')) return photoUrl; // legacy public URLs
    return signedUrls[photoUrl] || '';
  };

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
                src={getPhotoUrl(photosWithUrl[photoIndex]?.photo_url)}
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
            <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
              {photosWithUrl.map((m: any, i: number) => (
                <button
                  key={m.id}
                  onClick={() => setPhotoIndex(i)}
                  className={`w-12 h-12 rounded-lg overflow-hidden border-2 shrink-0 snap-start transition-all ${
                    i === photoIndex ? "border-emerald-400" : "border-border opacity-60"
                  }`}
                >
                  <img src={getPhotoUrl(m.photo_url)} alt="" className="w-full h-full object-cover" />
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

function ThemeToggleSettings() {
  const { theme, setTheme } = useTheme();
  
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-2 block">🎨 Tema</label>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setTheme('dark')}
          className={`flex items-center gap-2 flex-1 px-3 py-2 rounded-lg border-2 transition-all ${
            theme === 'dark'
              ? 'border-primary bg-primary/10'
              : 'border-border bg-muted/20 hover:border-border/80'
          }`}
        >
          <Moon className="w-4 h-4" />
          <span className="text-sm font-medium">Escuro</span>
        </button>
        <button
          onClick={() => setTheme('light')}
          className={`flex items-center gap-2 flex-1 px-3 py-2 rounded-lg border-2 transition-all ${
            theme === 'light'
              ? 'border-primary bg-primary/10'
              : 'border-border bg-muted/20 hover:border-border/80'
          }`}
        >
          <Sun className="w-4 h-4" />
          <span className="text-sm font-medium">Claro</span>
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: classes } = useClasses();
  const { data: attributes } = useAttributes();
  const { data: goldBalance } = useGoldBalance();
  const { data: bosses } = useBosses();
  const { data: healthStats } = useHealthStats();
  const { data: todayMeals } = useTodayMeals();
  const { data: todayWater } = useTodayWater();
  const { data: inventory = [] } = useInventory();
  const toggleEquip = useToggleEquip();
  const toggleAttunement = useToggleAttunement();
  const consumeItem = useConsumeItem();
  const claimStarterKit = useClaimStarterKit();
  const equipBonuses = getEquipmentBonuses(inventory as InventoryItem[]);
  const awardHealthXP = useAwardHealthXP();
  const updateDisplayName = useUpdateDisplayName();
  const queryClient = useQueryClient();

  // Amigos e conquistas
  const { data: friends = [] } = useFriends();
  const { data: pendingRequests = [] } = usePendingRequests();
  const { data: userAchievements = [] } = useUserAchievements();
  const { data: allAchievements = [] } = useAllAchievements();
  const sendFriendRequest = useSendFriendRequest();
  const respondFriendRequest = useRespondFriendRequest();
  const removeFriend = useRemoveFriend();
  const [friendSearch, setFriendSearch] = useState("");
  const { data: searchResults = [], isFetching: isSearching } = useSearchProfile(friendSearch);

  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<"perfil" | "habilidades" | "inventario" | "amigos" | "conquistas">("perfil");
  const [weight, setWeight] = useState(70);
  const [mealsTarget, setMealsTarget] = useState(3);
  const [volume, setVolume] = useState(100);
  const [xpAwarded, setXpAwarded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedRespecClass, setSelectedRespecClass] = useState<string>("guerreiro");
  const [selectedCombatSkillIds, setSelectedCombatSkillIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    const savedClass = (profile as any)?.starter_class || localStorage.getItem(`starter_class_v1_${user.id}`) || "novato";
    setSelectedRespecClass(savedClass);
  }, [user, profile]);

  useEffect(() => {
    if (healthStats) {
      setWeight(Number(healthStats.weight_kg) || 70);
      setMealsTarget(healthStats.meals_target || 3);
    }
  }, [healthStats]);

  // Load volume setting
  useEffect(() => {
    const savedVolume = parseInt(localStorage.getItem('lifeonrpg-sfx-volume') || '100', 10);
    setVolume(savedVolume);
  }, []);

  // Update volume when changed
  useEffect(() => {
    setVolume(volume);
  }, [volume]);

  // Reset XP Award flag diariamente após 23:59
  useEffect(() => {
    const checkDayChange = () => {
      const lastCheckDate = localStorage.getItem('lastXpCheckDate');
      const today = new Date().toLocaleDateString('en-CA');
      
      if (lastCheckDate !== today) {
        setXpAwarded(false);
        localStorage.setItem('lastXpCheckDate', today);
      }
    };

    checkDayChange();
    
    // Verificar a cada minuto se o dia mudou
    const interval = setInterval(checkDayChange, 60000);
    return () => clearInterval(interval);
  }, []);

  const waterTargetMl = Math.round(weight * 35);
  const totalWaterToday = (todayWater || []).reduce((s: number, w: any) => s + (w.amount_ml || 0), 0);
  const mealsToday = (todayMeals || []).length;
  const attributeLevels = useMemo(() => getAttributeLevels(attributes as any[]), [attributes]);
  const starterClass = useMemo(() => {
    // Priority 1: resolve from current_class_id in the class progression tree
    const currentClassId = (profile as any)?.current_class_id;
    if (currentClassId && classes) {
      const classMap = new Map<string, any>();
      (classes as any[]).forEach((c) => classMap.set(c.id, c));
      let node = classMap.get(currentClassId);
      while (node && node.column_index > 2) {
        node = node.parent_class_id ? classMap.get(node.parent_class_id) : null;
      }
      const resolved = node?.column_index === 2 ? CLASS_NAME_TO_STARTER[node.name] : null;
      if (resolved) return resolved;
    }
    // Priority 2: stored starter_class from onboarding / respec
    return (profile as any)?.starter_class || (user ? localStorage.getItem(`starter_class_v1_${user.id}`) : null) || 'novato';
  }, [user, profile, classes]);
  const starterItem = useMemo(
    () => (profile as any)?.starter_item || (user ? localStorage.getItem(`starter_item_v1_${user.id}`) : null) || "Adaga de Treino",
    [user, profile],
  );
  const playerCombatStats = useMemo(
    () => getPlayerCombatStats(profile?.level || 1, attributeLevels),
    [profile?.level, attributeLevels],
  );
  const skillLoadout = useMemo(
    () => getSkillLoadout(profile?.level || 1, attributeLevels, starterClass, starterItem),
    [profile?.level, attributeLevels, starterClass, starterItem],
  );
  const noviceSkills = skillLoadout.noviceSkills;
  const classSkills = skillLoadout.classSkills;
  const unlockedSkills = useMemo(
    () => [...noviceSkills, ...classSkills].filter((s) => s.unlocked),
    [noviceSkills, classSkills],
  );
  const unlockedSkillsById = useMemo(
    () => new Map(unlockedSkills.map((skill) => [skill.id, skill])),
    [unlockedSkills],
  );
  const selectedCombatSkills = useMemo(
    () => selectedCombatSkillIds.map((id) => unlockedSkillsById.get(id)).filter(Boolean),
    [selectedCombatSkillIds, unlockedSkillsById],
  );

  useEffect(() => {
    const rawLoadout = Array.isArray((profile as any)?.combat_skill_loadout)
      ? (profile as any).combat_skill_loadout
      : [];

    const ids = rawLoadout
      .map((entry: any) => String(entry?.id || ''))
      .filter((id: string) => id && unlockedSkillsById.has(id))
      .slice(0, MAX_COMBAT_SKILLS);

    setSelectedCombatSkillIds(ids);
  }, [profile, unlockedSkillsById]);

  const mealHalf = Math.ceil(mealsTarget / 2);
  const maxHp = playerCombatStats.hp;
  const maxMp = playerCombatStats.mp;
  // Penalidades dinâmicas após LV 15
  let mealPenalty = 0;
  let penaltyMessages: string[] = [];
  if ((profile?.level || 1) > 15) {
    // Refeições: 5% do HP máximo por refeição faltante
    if (mealsToday < mealHalf) {
      mealPenalty = Math.round((mealHalf - mealsToday) * 0.05 * maxHp);
      penaltyMessages.push(`⚠️ Você perdeu ${mealPenalty} HP por não comer o suficiente!`);
    }
  } else {
    // Penalidade antiga para refeições (antes do LV 16)
    if (mealsToday < mealHalf) {
      mealPenalty = (mealHalf - mealsToday) * 10;
      penaltyMessages.push(`⚠️ Você perdeu ${mealPenalty} HP por não comer o suficiente!`);
    }
  }
  const persistedHp = Number(healthStats?.current_hp ?? maxHp);
  const persistedMp = Number(healthStats?.current_mp ?? maxMp);
  const currentHp = Math.max(0, Math.min(maxHp, persistedHp) - mealPenalty);
  const currentMp = Math.max(0, Math.min(maxMp, persistedMp));
  const fatigue = healthStats?.fatigue ?? 0;
  const fatigueStatus =
    fatigue >= 75
      ? { label: 'Exausto', className: 'text-red-400' }
      : fatigue >= 45
        ? { label: 'Alta', className: 'text-orange-400' }
        : fatigue >= 15
          ? { label: 'Media', className: 'text-yellow-400' }
          : { label: 'Baixa', className: 'text-emerald-400' };

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

  const saveCombatLoadout = useMutation({
    mutationFn: async (skillIds: string[]) => {
      if (!user) throw new Error('Nao autenticado');

      const payload = skillIds
        .map((id) => unlockedSkillsById.get(id))
        .filter(Boolean)
        .slice(0, MAX_COMBAT_SKILLS)
        .map((skill: any) => ({
          id: skill.id,
          name: skill.name,
          power: skill.power,
          cooldown: skill.cooldown,
          category: skill.category,
        }));

      const { error } = await (supabase as any)
        .from('profiles')
        .update({ combat_skill_loadout: payload })
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Loadout de combate salvo com sucesso!');
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Nao foi possivel salvar o loadout de combate.');
    },
  });

  const toggleCombatSkill = (skillId: string) => {
    if (!unlockedSkillsById.has(skillId)) {
      return;
    }

    setSelectedCombatSkillIds((prev) => {
      if (prev.includes(skillId)) {
        return prev.filter((id) => id !== skillId);
      }
      if (prev.length >= MAX_COMBAT_SKILLS) {
        toast.error(`Voce so pode equipar ate ${MAX_COMBAT_SKILLS} habilidades.`);
        return prev;
      }
      return [...prev, skillId];
    });
  };

  const logMeal = useMutation({
    mutationFn: async () => {
      const today = new Date().toLocaleDateString('en-CA');
      if (!user) {
        console.error("[logMeal] Usuário não autenticado");
        throw new Error("Usuário não autenticado");
      }
      const payload = { user_id: user.id, meal_date: today, meal_number: mealsToday + 1 };
      console.debug("[logMeal] Inserindo refeição:", payload);
      const { error, data } = await supabase
        .from("meal_log" as any)
        .insert(payload);
      if (error) {
        console.error("[logMeal] Erro ao inserir refeição:", error);
        throw error;
      }
      console.debug("[logMeal] Refeição inserida:", data);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["meal_log", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["mealHistory", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["dailyTracking", user?.id] }),
      ]);
      await queryClient.refetchQueries({ queryKey: ["meal_log", user?.id], type: "active" });
      toast.success("Refeição registrada! 🍖");
    },
    onError: (err) => {
      toast.error("Erro ao registrar refeição: " + (err?.message || err));
    }
  });

  const logWater = useMutation({
    mutationFn: async (amount: number) => {
      const today = new Date().toLocaleDateString('en-CA');
      if (!user) {
        console.error("[logWater] Usuário não autenticado");
        throw new Error("Usuário não autenticado");
      }

      // Insere o registro de água
      const payload = { user_id: user.id, log_date: today, amount_ml: amount };
      console.debug("[logWater] Inserindo água:", payload);
      const { error } = await supabase.from("water_log" as any).insert(payload);
      if (error) {
        console.error("[logWater] Erro ao inserir água:", error);
        throw error;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["water_log", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["dailyTracking", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["health_stats", user?.id] }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["water_log", user?.id], type: "active" }),
        queryClient.refetchQueries({ queryKey: ["health_stats", user?.id], type: "active" }),
      ]);

      toast.success("Água registrada! 💧");
    },
    onError: (err) => {
      toast.error("Erro ao registrar água: " + (err?.message || err));
    }
  });

  const checkAndAwardXP = async () => {
    try {
      await awardHealthXP.mutateAsync();
      setXpAwarded(true);
      toast.success('🎉 Desafio Completado! + 50 XP por manter a saúde em dia!');
    } catch (error: any) {
      if (error.message.includes('já ganhou')) {
        setXpAwarded(true);
        toast.info('⚠️ Bônus já coletado. Volte amanhã para ganhar mais XP!');
      } else {
        toast.error('Erro ao conceder XP: ' + error.message);
      }
    }
  };

  const waterPercent = Math.min(100, Math.round((totalWaterToday / waterTargetMl) * 100));
  const hpPercent = Math.round((currentHp / maxHp) * 100);
  const mpPercent = Math.round((currentMp / maxMp) * 100);
  const currentGold = (goldBalance as any)?.gold ?? 100;

  const respecClass = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      const currentClass = (profile as any)?.starter_class || localStorage.getItem(`starter_class_v1_${user.id}`) || "novato";
      if (selectedRespecClass === currentClass) {
        throw new Error("Você já está nessa classe.");
      }

      // Primeiro respec é gratuito
      const isFirstRespec = !localStorage.getItem(`respec_used_${user.id}`);
      const cost = isFirstRespec ? 0 : RESPEC_COST;

      // Tenta RPC, fallback para atualização direta
      const { data, error } = await (supabase.rpc as any)("perform_class_respec", {
        target_class: selectedRespecClass,
        respec_cost: cost,
      });

      if (error) {
        // Fallback: verifica ouro e atualiza diretamente
        if (!isFirstRespec) {
          const { data: bal } = await supabase.from('user_balance').select('gold').eq('user_id', user.id).single();
          const gold = (bal as any)?.gold ?? 0;
          if (gold < RESPEC_COST) throw new Error(`Ouro insuficiente! Você tem ${gold}, precisa de ${RESPEC_COST}.`);
          await supabase.from('user_balance').update({ gold: gold - RESPEC_COST } as any).eq('user_id', user.id);
        }
      }

      const starterItem = (data as any)?.starter_item || getStarterItemForClass(selectedRespecClass as any);
      localStorage.setItem(`starter_class_v1_${user.id}`, selectedRespecClass);
      localStorage.setItem(`starter_item_v1_${user.id}`, starterItem);
      localStorage.setItem(`respec_used_${user.id}`, 'true');

      // Atualiza o banco de dados
      await supabase.from('profiles').update({
        starter_class: selectedRespecClass,
        starter_item: starterItem,
      } as any).eq('user_id', user.id).then(() => {});

      return { starterItem, isFirstRespec };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["gold-balance"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      if (data.isFirstRespec) {
        toast.success(`Classe alterada gratuitamente! Novo item: ${data.starterItem}`);
      } else {
        toast.success(`Classe alterada! Novo item inicial: ${data.starterItem}`);
      }
    },
    onError: (err: any) => {
      toast.error(err.message || "Falha ao fazer respec de classe");
    },
  });

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary font-display">⚔️ Meu Perfil</h1>
            {editingName ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={30}
                  className="bg-secondary border border-border rounded px-2 py-1 text-sm text-foreground w-40 sm:w-52 focus:outline-none focus:border-primary"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      updateDisplayName.mutate(newName, {
                        onSuccess: () => { toast.success("Nome atualizado! ✨"); setEditingName(false); },
                        onError: (err: any) => toast.error(err.message),
                      });
                    }
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
                <button
                  onClick={() => {
                    updateDisplayName.mutate(newName, {
                      onSuccess: () => { toast.success("Nome atualizado! ✨"); setEditingName(false); },
                      onError: (err: any) => toast.error(err.message),
                    });
                  }}
                  disabled={updateDisplayName.isPending}
                  className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button onClick={() => setEditingName(false)} className="p-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground">
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-muted-foreground">{profile?.display_name || "Aventureiro"}</p>
                <button
                  onClick={() => { setNewName(profile?.display_name || ""); setEditingName(true); }}
                  className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                  title="Editar nome (1x por semana)"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <ActiveTalentsBadge compact className="mt-2" />
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
          >
            <Settings className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 sm:gap-2 border-b border-border overflow-x-auto">
          {[
            { id: "perfil",      label: "📊 Perfil" },
            { id: "habilidades", label: "🌟 Habilidades" },
            { id: "inventario",  label: "🎒 Inventário" },
            { id: "amigos",      label: "🤝 Amigos", badge: pendingRequests.length > 0 ? pendingRequests.length : undefined },
            { id: "conquistas",  label: "🏆 Conquistas", badge: userAchievements.length > 0 ? userAchievements.length : undefined },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`relative px-3 sm:px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.badge ? (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
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
            
            {/* Volume Control */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block flex items-center gap-2">
                🔊 Volume de Som
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => {
                    const newVolume = Number(e.target.value);
                    setVolume(newVolume);
                    setVolume(newVolume);
                  }}
                  className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <span className="text-sm font-bold text-foreground w-12 text-right">{volume}%</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Sons de clique, descanso e combate</p>
            </div>

            {/* Theme Toggle */}
            <ThemeToggleSettings />

            <button
              onClick={() => {
                saveSettings.mutate();
                setVolume(volume);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
            >
              <Save className="w-4 h-4" /> Salvar
            </button>
          </div>
        )}

        {/* ======== ABA: PERFIL ======== */}
        {activeTab === "perfil" && (
          <div className="space-y-6">
            {/* XP Award Card */}
            {mealsToday >= mealsTarget && totalWaterToday >= waterTargetMl && xpAwarded && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rpg-card-glow bg-gradient-to-r from-success/10 to-primary/10 border-success/30 text-center p-6 space-y-3"
              >
                <span className="text-4xl inline-block">🏆</span>
                <h2 className="font-display font-bold text-lg text-success">Todas as metas completadas!</h2>
                <p className="text-sm text-muted-foreground">Você ganhou +50 XP por manter a saúde em dia!</p>
                <div className="text-3xl font-bold text-xp pt-2">✨ +50 XP</div>
              </motion.div>
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
                <span className={`text-xs font-semibold ${fatigueStatus.className}`}>{fatigueStatus.label}</span>
              </div>
              {penaltyMessages.map((msg, i) => (
                <p key={i} className="text-xs text-red-400 flex items-center gap-1">{msg}</p>
              ))}
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
                  <button
                    onClick={() => logMeal.mutate()}
                    disabled={mealsToday >= mealsTarget || logMeal.isPending}
                    className={`flex items-center gap-1 px-3 py-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg text-xs font-medium hover:bg-orange-500/30 transition-colors ${mealsToday >= mealsTarget || logMeal.isPending ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    {logMeal.isPending ? (
                      <span className="animate-spin mr-1 w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full"></span>
                    ) : <Plus className="w-3 h-3" />} Refeição
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
                    <button
                      key={ml}
                      onClick={() => logWater.mutate(ml)}
                      disabled={logWater.isPending}
                      className={`flex items-center gap-1 px-3 py-1.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-medium hover:bg-cyan-500/30 transition-colors ${logWater.isPending ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      {logWater.isPending ? (
                        <span className="animate-spin mr-1 w-3 h-3 border-2 border-cyan-400 border-t-transparent rounded-full"></span>
                      ) : <Droplets className="w-3 h-3" />} {ml}ml
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground text-center">Base: {weight}kg × 35ml = {waterTargetMl}ml. Se ficar abaixo de 50% no dia, ganha +35 de fadiga.</p>
              </div>
            </div>

            {/* Body Evolution */}
            <div className="bg-card border border-border rounded-xl p-4">
              <BodyEvolutionSection />
            </div>
          </div>
        )}

        {/* ======== ABA: HABILIDADES ======== */}
        {activeTab === "habilidades" && (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-6 h-6 text-primary" />
                <h3 className="text-lg font-bold text-foreground">🌟 Habilidades Táticas</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Inspiradas no estilo de progressão clássica, mas com design original e balanceamento próprio. O poder de cada habilidade usa seus atributos treinados em missões.
              </p>

              <HeroStatusBar />

              <div className="bg-muted/30 border border-border rounded-lg p-3 text-xs">
                <p className="text-foreground font-semibold">Classe inicial: {starterClass}</p>
                <p className="text-muted-foreground">Item inicial: {starterItem}</p>
                <p className="text-muted-foreground mt-1">Magia nesta temporada esta mais fraca por design. Builds hibridas com atributos fisicos e taticos tendem a render melhor.</p>
              </div>

              <div className="bg-muted/20 border border-border rounded-lg p-4 flex items-center gap-3">
                <span className="text-xl">🔒</span>
                <div>
                  <p className="text-sm font-bold text-foreground">Classe Permanente</p>
                  <p className="text-xs text-muted-foreground">Sua classe inicial é permanente e não pode ser alterada após a seleção.</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-foreground mb-2">Kit Novato (Lv 1 ao 4)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {noviceSkills.map((skill) => (
                    <div
                      key={skill.id}
                      className={`rounded-lg border p-4 space-y-2 ${
                        skill.unlocked
                          ? "bg-emerald-500/10 border-emerald-500/30"
                          : "bg-muted/30 border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-foreground leading-tight">{skill.name}</p>
                          <p className="text-[11px] text-muted-foreground">{skill.archetype}</p>
                        </div>
                        <span className={`text-[10px] px-2 py-1 rounded-full border ${skill.unlocked ? "text-emerald-300 border-emerald-500/40" : "text-muted-foreground border-border"}`}>
                          {skill.unlocked ? "Ativa" : `Req. Lv ${skill.unlockLevel}`}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground">{skill.description}</p>
                      <p className="text-[11px] text-muted-foreground">Item exigido: {skill.requiredItem}</p>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-background/60 rounded p-2 border border-border/50">
                          <p className="text-muted-foreground">Poder</p>
                          <p className="font-bold text-foreground">{skill.power}</p>
                        </div>
                        <div className="bg-background/60 rounded p-2 border border-border/50">
                          <p className="text-muted-foreground">CD</p>
                          <p className="font-bold text-foreground">{skill.cooldown}t</p>
                        </div>
                        <div className="bg-background/60 rounded p-2 border border-border/50">
                          <p className="text-muted-foreground">Base</p>
                          <p className="font-bold text-foreground">{skill.basedOn.join(" + ")}</p>
                        </div>
                      </div>

                      {skill.unlocked && (
                        <button
                          onClick={() => toggleCombatSkill(skill.id)}
                          className={`w-full rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                            selectedCombatSkillIds.includes(skill.id)
                              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                              : 'bg-zinc-800/80 border border-zinc-700 text-zinc-200 hover:bg-zinc-700/80'
                          }`}
                        >
                          {selectedCombatSkillIds.includes(skill.id) ? 'Remover do loadout' : 'Adicionar ao loadout'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-foreground mb-2">Habilidades Unicas da Classe</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {classSkills.map((skill) => (
                  <div
                    key={skill.id}
                    className={`rounded-lg border p-4 space-y-2 ${
                      skill.unlocked
                        ? "bg-emerald-500/10 border-emerald-500/30"
                        : "bg-muted/30 border-border"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-foreground leading-tight">{skill.name}</p>
                        <p className="text-[11px] text-muted-foreground">{skill.archetype}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-1 rounded-full border ${skill.unlocked ? "text-emerald-300 border-emerald-500/40" : "text-muted-foreground border-border"}`}>
                        {skill.unlocked ? "Ativa" : `Req. ${skill.unlockLevel}`}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">{skill.description}</p>
                    <p className="text-[11px] text-muted-foreground">{skill.fantasy}</p>

                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-background/60 rounded p-2 border border-border/50">
                        <p className="text-muted-foreground">Poder</p>
                        <p className="font-bold text-foreground">{skill.power}</p>
                      </div>
                      <div className="bg-background/60 rounded p-2 border border-border/50">
                        <p className="text-muted-foreground">CD</p>
                        <p className="font-bold text-foreground">{skill.cooldown}t</p>
                      </div>
                      <div className="bg-background/60 rounded p-2 border border-border/50">
                        <p className="text-muted-foreground">Base</p>
                        <p className="font-bold text-foreground">{skill.basedOn.join(" + ")}</p>
                      </div>
                    </div>

                    {skill.unlocked && (
                      <button
                        onClick={() => toggleCombatSkill(skill.id)}
                        className={`w-full rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                          selectedCombatSkillIds.includes(skill.id)
                            ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                            : 'bg-zinc-800/80 border border-zinc-700 text-zinc-200 hover:bg-zinc-700/80'
                        }`}
                      >
                        {selectedCombatSkillIds.includes(skill.id) ? 'Remover do loadout' : 'Adicionar ao loadout'}
                      </button>
                    )}
                  </div>
                ))}
                </div>
              </div>

              <div className="bg-secondary/40 border border-border rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm text-foreground font-semibold">Habilidades desbloqueadas</span>
                <span className="text-2xl font-bold text-primary">{unlockedSkills.length}</span>
              </div>

              <div className="bg-zinc-900/40 border border-zinc-700 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground font-semibold">Loadout de Combate</span>
                  <span className="text-xs text-zinc-300">{selectedCombatSkills.length}/{MAX_COMBAT_SKILLS}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Selecione ate {MAX_COMBAT_SKILLS} habilidades desbloqueadas. Elas serao usadas em rotacao no combate contra boss.
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedCombatSkills.length > 0 ? (
                    selectedCombatSkills.map((skill: any) => (
                      <span key={skill.id} className="text-xs px-2 py-1 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                        {skill.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-zinc-400">Nenhuma habilidade selecionada.</span>
                  )}
                </div>
                <button
                  onClick={() => saveCombatLoadout.mutate(selectedCombatSkillIds)}
                  disabled={saveCombatLoadout.isPending}
                  className="rounded-lg bg-primary/80 px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary disabled:opacity-60"
                >
                  {saveCombatLoadout.isPending ? 'Salvando...' : 'Salvar loadout'}
                </button>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Skull className="w-5 h-5 text-destructive" />
                <h3 className="text-base font-bold text-foreground">Status dos Bosses (leitura tática)</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Estes status são mostrados na área de habilidades para você decidir qual build de missão treinar antes da batalha.
              </p>

              {(bosses || []).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(bosses || []).map((boss: any) => {
                    const b = getBossCombatStats(boss);
                    return (
                      <div key={boss.id} className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-foreground">{boss.icon} {boss.name}</p>
                          <span className="text-xs px-2 py-1 rounded-full bg-destructive/10 border border-destructive/30 text-destructive">
                            Ameaça {b.threat}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div><p className="text-muted-foreground">ATK</p><p className="font-bold">{b.atk}</p></div>
                          <div><p className="text-muted-foreground">MATK</p><p className="font-bold">{b.matk}</p></div>
                          <div><p className="text-muted-foreground">DEF</p><p className="font-bold">{b.def}</p></div>
                          <div><p className="text-muted-foreground">AGI</p><p className="font-bold">{b.agi}</p></div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Fraqueza tática: <span className="text-primary font-semibold">{b.weakness}</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum boss encontrado.</p>
              )}
            </div>

          </div>
        )}

        {/* ======== ABA: INVENTÁRIO ======== */}
        {activeTab === "inventario" && (
          <div className="space-y-6">
            <HeroStatusBar />

            {(() => {
              const attunedItems = (inventory as InventoryItem[]).filter((inv) => inv.sintonizado);
              return (
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-foreground">💍 Sintonização Mágica</h3>
                    <span className="text-xs text-muted-foreground">{attunedItems.length}/3 slots</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {[0, 1, 2].map((slot) => {
                      const item = attunedItems[slot];
                      return (
                        <div
                          key={slot}
                          className={`h-10 min-w-10 px-2 rounded-lg border flex items-center justify-center text-sm ${
                            item
                              ? 'border-primary/50 bg-primary/10 text-primary'
                              : 'border-border bg-muted/30 text-muted-foreground'
                          }`}
                          title={item ? `${item.game_items?.name || 'Item'} sintonizado` : 'Slot vazio'}
                        >
                          {item ? item.game_items?.icon || '💍' : '○'}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Itens Épicos e Lendários precisam estar sintonizados para ativar bônus de status.
                  </p>
                </div>
              );
            })()}

            <div className="bg-card border border-border rounded-xl p-6 space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <Swords className="w-6 h-6 text-primary" />
                <h3 className="text-lg font-bold text-foreground">🎒 INVENTÁRIO</h3>
              </div>

              {!(profile as any)?.starter_kit_claimed ? (
                <div className="space-y-4">
                  <div className="text-center space-y-2">
                    <p className="text-4xl">🥚</p>
                    <p className="text-sm font-bold text-foreground">Kit de Novato disponível!</p>
                    <p className="text-xs text-muted-foreground">
                      Receba seus primeiros equipamentos para começar a aventura (lv1–4).
                    </p>
                    <button
                      onClick={() => {
                        claimStarterKit.mutate(undefined, {
                          onSuccess: () => toast.success('🎁 Kit de Novato recebido! Verifique seu inventário.'),
                          onError: (err: any) => toast.error(err.message || 'Erro ao resgatar kit'),
                        });
                      }}
                      disabled={claimStarterKit.isPending}
                      className="px-6 py-2 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {claimStarterKit.isPending ? '⏳ Resgatando...' : '📦 Resgatar Kit de Novato'}
                    </button>
                  </div>
                </div>
              ) : inventory.length === 0 ? (
                <div className="space-y-2 text-center">
                  <p className="text-4xl">🛡️</p>
                  <p className="text-sm text-muted-foreground">
                    {(profile as any)?.class_kit_claimed
                      ? 'Derrote bosses para conseguir novos itens!'
                      : 'Alcance o nível 5 e selecione sua classe em “Classes” para receber seu kit de classe!'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Equipment items with comparison */}
                  {(() => {
                    const equipItems = (inventory as InventoryItem[]).filter(inv =>
                      ['weapon', 'armor', 'accessory'].includes(inv.game_items?.category)
                    );
                    if (equipItems.length === 0) return null;

                    // Group by category for comparison
                    const byCategory: Record<string, InventoryItem[]> = {};
                    equipItems.forEach(inv => {
                      const cat = inv.game_items?.category || 'other';
                      if (!byCategory[cat]) byCategory[cat] = [];
                      byCategory[cat].push(inv);
                    });

                    const categoryLabels: Record<string, string> = {
                      weapon: '⚔️ Armas',
                      armor: '🛡️ Armaduras',
                      accessory: '💍 Acessórios',
                    };

                    const SLOT_LIMITS: Record<string, number> = { armor: 1, weapon: 2, accessory: 3 };

                    return Object.entries(byCategory).map(([cat, items]) => {
                      // Sort: equipped first, then by power score desc
                      const sorted = [...items].sort((a, b) => {
                        if (a.equipped && !b.equipped) return -1;
                        if (!a.equipped && b.equipped) return 1;
                        return compareItems(b.game_items, a.game_items);
                      });

                      // Find best item in category (highest score)
                      const bestItem = [...items].sort((a, b) => compareItems(b.game_items, a.game_items))[0];
                      const equippedCount = items.filter(i => i.equipped).length;
                      const slotLimit = SLOT_LIMITS[cat];
                      const slotsAtLimit = slotLimit !== undefined && equippedCount >= slotLimit;

                      return (
                        <div key={cat} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-foreground">{categoryLabels[cat] || cat}</h4>
                            {slotLimit !== undefined && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${slotsAtLimit ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-muted/40 text-muted-foreground border-border'}`}>
                                {equippedCount}/{slotLimit}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {sorted.map((inv) => {
                              const item = inv.game_items;
                              const requiresAttunement = Boolean(item.requer_sintonizacao) || ['epico', 'lendario'].includes(String(item.rarity || '').toLowerCase());
                              const isBest = bestItem && bestItem.item_id === inv.item_id && items.length > 1;
                              const rarityColors: Record<string, string> = {
                                comum: "bg-muted/30 border-border",
                                incomum: "bg-emerald-500/5 border-emerald-500/30",
                                raro: "bg-blue-500/5 border-blue-500/30",
                                epico: "bg-purple-500/5 border-purple-500/30",
                                lendario: "bg-yellow-500/5 border-yellow-500/30",
                              };
                              const rarityTextColors: Record<string, string> = {
                                comum: "text-muted-foreground",
                                incomum: "text-emerald-400",
                                raro: "text-blue-400",
                                epico: "text-purple-400",
                                lendario: "text-yellow-400",
                              };
                              return (
                                <div
                                  key={inv.id}
                                  className={`p-3 rounded-lg border ${rarityColors[item.rarity] || rarityColors.comum} ${inv.equipped ? 'ring-2 ring-primary/50' : ''}`}
                                >
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-2xl">{item.icon}</span>

                                        <div>
                                          <div className="flex items-center gap-1.5">
                                            <p className="font-bold text-foreground text-sm">{item.name}</p>
                                            {isBest && !inv.equipped && (
                                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">MELHOR</span>
                                            )}
                                          </div>
                                          <p className={`text-xs font-semibold ${rarityTextColors[item.rarity] || rarityTextColors.comum}`}>
                                            {item.rarity.toUpperCase()}
                                          </p>
                                        </div>
                                      </div>
                                      {/* Stat bonuses */}
                                      <div className="flex flex-wrap gap-1.5 mt-1">
                                        {item.atk_bonus > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">+{item.atk_bonus} ATK</span>}
                                        {item.matk_bonus > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20">+{item.matk_bonus} MATK</span>}
                                        {item.def_bonus > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">+{item.def_bonus} DEF</span>}
                                        {item.hp_bonus > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">+{item.hp_bonus} HP</span>}
                                        {item.mp_bonus > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">+{item.mp_bonus} MP</span>}
                                        {item.agi_bonus > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">+{item.agi_bonus} AGI</span>}
                                        {item.crit_bonus > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20">+{item.crit_bonus}% CRIT</span>}
                                        {requiresAttunement && (
                                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${inv.sintonizado ? 'bg-primary/20 text-primary border-primary/30' : 'bg-muted/40 text-muted-foreground border-border'}`}>
                                            {inv.sintonizado ? 'Sintonizado' : 'Exige Sintonização'}
                                          </span>
                                        )}
                                      </div>
                                      {requiresAttunement && !inv.sintonizado && (
                                        <p className="text-[11px] text-amber-400 mt-1">Este item não concede bônus enquanto não estiver sintonizado.</p>
                                      )}
                                      {item.description && (
                                        <p className="text-xs text-muted-foreground/70 mt-1 italic">{item.description}</p>
                                      )}
                                    </div>
                                    <div className="flex flex-col gap-1 shrink-0 ml-2">
                                      <button
                                        disabled={!inv.equipped && slotsAtLimit}
                                        onClick={() => {
                                          toggleEquip.mutate(
                                            { inventoryId: inv.id, equipped: !inv.equipped },
                                            { onError: (err: any) => toast.error(err?.message || 'Não foi possível equipar este item.') },
                                          );
                                        }}
                                        className={`px-2 py-1 text-xs rounded transition-colors font-medium ${
                                          inv.equipped
                                            ? 'bg-primary/30 text-primary border border-primary/40'
                                            : slotsAtLimit
                                              ? 'opacity-40 cursor-not-allowed bg-muted/50 text-muted-foreground'
                                              : 'bg-muted/50 text-muted-foreground hover:bg-primary/20 hover:text-primary'
                                        }`}
                                      >
                                        {inv.equipped ? '✓ Equipado' : 'Equipar'}
                                      </button>

                                      {requiresAttunement && (
                                        <button
                                          onClick={() => {
                                            toggleAttunement.mutate(
                                              { inventoryId: inv.id, sintonizado: Boolean(inv.sintonizado) },
                                              {
                                                onError: (err: any) =>
                                                  toast.error(
                                                    err?.message ||
                                                      'Limite de sintonização atingido. Dessintonize um item para continuar.',
                                                  ),
                                              },
                                            );
                                          }}
                                          className={`px-2 py-1 text-xs rounded transition-colors font-medium ${
                                            inv.sintonizado
                                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                              : 'bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30'
                                          }`}
                                        >
                                          {inv.sintonizado ? 'Dessintonizar' : 'Sintonizar'}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    });
                  })()}

                  {/* Consumables */}
                  {(() => {
                    const consumables = (inventory as InventoryItem[]).filter(inv => inv.game_items?.category === 'consumable');
                    if (consumables.length === 0) return null;
                    return (
                      <div className="space-y-3 border-t border-border pt-4">
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <Heart className="w-4 h-4" />
                          Consumíveis
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {consumables.map((inv) => {
                            const item = inv.game_items;
                            return (
                              <div key={inv.id} className="p-3 rounded-lg border border-border bg-muted/30 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-2xl">{item.icon}</span>
                                    <div>
                                      <p className="font-bold text-foreground text-sm">{item.name}</p>
                                      <p className="text-xs text-muted-foreground">{item.stat_label}</p>
                                    </div>
                                  </div>
                                  <span className="text-lg font-bold text-primary">x{inv.quantity}</span>
                                </div>
                                <button
                                  onClick={() => consumeItem.mutate({ inventoryId: inv.id, quantity: inv.quantity })}
                                  className="w-full px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded hover:bg-emerald-500/30 transition-colors font-medium"
                                >
                                  Usar
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

              <div className="bg-muted/30 border border-border/50 rounded-lg p-3 text-xs text-muted-foreground">
                💡 Dica: Derrote bosses para ganhar equipamentos raros! O item marcado como "MELHOR" tem status superiores na categoria.
              </div>
            </div>
          </div>
        )}

        {/* ======== ABA: AMIGOS ======== */}
        {activeTab === "amigos" && (
          <div className="space-y-5">
            {/* Buscar amigo */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <UserPlus className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Adicionar Amigo</h3>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  placeholder="Buscar por nome de herói..."
                  className="w-full pl-9 pr-4 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:border-primary/50 outline-none"
                />
                {isSearching && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                )}
              </div>
              {searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map((profile) => {
                    const alreadyFriend = friends.some(
                      (f) => f.other_profile?.user_id === profile.user_id,
                    );
                    return (
                      <div
                        key={profile.user_id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">{profile.display_name || 'Aventureiro'}</p>
                          <p className="text-xs text-muted-foreground">
                            Nível {profile.level} • {profile.starter_class || 'Novato'}
                          </p>
                        </div>
                        {alreadyFriend ? (
                          <span className="text-xs text-emerald-400 flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" />Amigo</span>
                        ) : (
                          <button
                            onClick={() =>
                              sendFriendRequest.mutate(profile.user_id, {
                                onSuccess: () => { toast.success(`Solicitação enviada para ${profile.display_name}!`); setFriendSearch(""); },
                                onError: (err: any) => toast.error(err.message || 'Erro ao enviar solicitação'),
                              })
                            }
                            disabled={sendFriendRequest.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-medium hover:bg-primary/30 transition-colors disabled:opacity-50"
                          >
                            <UserPlus className="w-3 h-3" /> Adicionar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {friendSearch.length >= 2 && !isSearching && searchResults.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">Nenhum herói encontrado com este nome.</p>
              )}
            </div>

            {/* Solicitações pendentes */}
            {pendingRequests.length > 0 && (
              <div className="bg-card border border-amber-500/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 text-sm font-bold">⏳ Solicitações Recebidas ({pendingRequests.length})</span>
                </div>
                <div className="space-y-2">
                  {pendingRequests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{req.other_profile?.display_name || 'Aventureiro'}</p>
                        <p className="text-xs text-muted-foreground">
                          Nível {req.other_profile?.level || '?'} • {req.other_profile?.starter_class || 'Novato'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            respondFriendRequest.mutate({ requestId: req.id, accept: true }, {
                              onSuccess: () => toast.success('Amizade aceita! 🤝'),
                              onError: (err: any) => toast.error(err.message),
                            })
                          }
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium hover:bg-emerald-500/30 transition-colors"
                        >
                          <UserCheck className="w-3 h-3" /> Aceitar
                        </button>
                        <button
                          onClick={() =>
                            respondFriendRequest.mutate({ requestId: req.id, accept: false }, {
                              onSuccess: () => toast.info('Solicitação rejeitada.'),
                              onError: (err: any) => toast.error(err.message),
                            })
                          }
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-medium hover:bg-rose-500/30 transition-colors"
                        >
                          <UserX className="w-3 h-3" /> Rejeitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lista de amigos */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">Meus Amigos</h3>
                </div>
                <span className="text-xs text-muted-foreground">{friends.length}/50</span>
              </div>

              {friends.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Você ainda não tem amigos.</p>
                  <p className="text-xs mt-1">Busque por nome acima para adicionar!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {friends.map((friend) => {
                    const p = friend.other_profile;
                    const classEmoji: Record<string, string> = {
                      guerreiro: '⚔️', mago: '📖', gatuno: '🌙',
                      ferreiro: '🔨', clerico: '✝️', arqueiro: '🏹',
                    };
                    return (
                      <div key={friend.id} className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-xl shrink-0">
                          {p?.avatar_url ? (
                            <img src={p.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                          ) : (
                            classEmoji[p?.starter_class || ''] || '🧙'
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{p?.display_name || 'Aventureiro'}</p>
                          <p className="text-xs text-muted-foreground">
                            Nível {p?.level || 1} • {p?.starter_class || 'Novato'}
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            removeFriend.mutate(friend.id, {
                              onSuccess: () => toast.info('Amigo removido.'),
                              onError: (err: any) => toast.error(err.message),
                            })
                          }
                          className="p-1.5 text-muted-foreground hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-500/10"
                          title="Remover amigo"
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======== ABA: CONQUISTAS ======== */}
        {activeTab === "conquistas" && (
          <div className="space-y-5">
            {/* Resumo */}
            <div className="bg-card border border-primary/20 rounded-xl p-4 flex items-center gap-4">
              <Trophy className="w-10 h-10 text-primary shrink-0" />
              <div>
                <p className="text-lg font-black text-primary">{userAchievements.length}/{allAchievements.length}</p>
                <p className="text-xs text-muted-foreground">Conquistas desbloqueadas</p>
              </div>
              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-amber-300 rounded-full transition-all duration-700"
                  style={{ width: `${allAchievements.length > 0 ? (userAchievements.length / allAchievements.length) * 100 : 0}%` }}
                />
              </div>
            </div>

            {/* Grid de conquistas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {allAchievements.map((ach) => {
                const unlocked = userAchievements.find((ua) => ua.achievement_id === ach.id);
                return (
                  <div
                    key={ach.id}
                    className={`rounded-xl border p-4 flex items-start gap-3 transition-all ${
                      unlocked
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border bg-muted/20 opacity-60 grayscale'
                    }`}
                  >
                    <span className={`text-3xl shrink-0 ${unlocked ? '' : 'opacity-40'}`}>
                      {unlocked ? ach.icon : '🔒'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold ${unlocked ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {ach.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{ach.description}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-xp/20 text-primary border border-primary/20 font-bold">
                          +{ach.xp_reward} XP
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 font-bold">
                          +{ach.gold_reward} 🪙
                        </span>
                        {unlocked && (
                          <span className="text-[10px] text-emerald-400 font-semibold">✓ Desbloqueada</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
