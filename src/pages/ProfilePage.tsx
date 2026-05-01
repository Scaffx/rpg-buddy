import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { useTheme } from "next-themes";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useAttributes, useAwardHealthXP, useBosses, useUpdateDisplayName, useUpdateRegion, useClasses, useSyncHealthMaxes } from "@/hooks/useProfile";
import {
  useFriends,
  usePendingRequests,
  useSearchProfile,
  useSendFriendRequest,
  useRespondFriendRequest,
  useRemoveFriend,
  useFriendChallenges,
  useSendChallenge,
  useRespondChallenge,
  useMarkChallengeComplete,
  useHeroVsHeroBattle,
  getFriendStats,
  type FriendChallenge,
  type BattleResult,
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
  AlertTriangle, Sword, Scroll, Clock, CheckCircle, XCircle, Award,
} from "lucide-react";
import { getAttributeColorClass } from "@/lib/attributes";
import { getAttributeLevels, getBossCombatStats, getPlayerCombatStats, getSkillLoadout, getStarterItemForClass } from "@/lib/combat";
import HeroStatusBar from "@/components/HeroStatusBar";
import ActiveTalentsBadge from "@/components/ActiveTalentsBadge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { hasCompletedOnboarding } from "@/lib/onboarding";

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

const REGIONS = [
  { id: 'south_america', name: 'América do Sul', icon: '🌎' },
  { id: 'north_america', name: 'América do Norte', icon: '🌎' },
  { id: 'europe', name: 'Europa', icon: '🌍' },
  { id: 'africa', name: 'África', icon: '🌍' },
  { id: 'asia', name: 'Ásia', icon: '🌏' },
  { id: 'oceania', name: 'Oceania', icon: '🌏' },
];

// Returns "HH:MM" -> minutes from midnight (default fallbacks)
function timeStringToMinutes(value: string | null | undefined, fallback: number): number {
  if (!value || typeof value !== 'string') return fallback;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const h = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const m = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return h * 60 + m;
}

function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Whether the hero is currently considered "awake".
 * If wake <= sleep (e.g. wake 07:00, sleep 23:00) → awake when wake <= now < sleep.
 * If wake > sleep (e.g. siesta-like inverted) → awake outside the sleep window.
 */
function isHeroAwake(sleepTime: string | null | undefined, wakeTime: string | null | undefined): boolean {
  const wake = timeStringToMinutes(wakeTime, 7 * 60);
  const sleep = timeStringToMinutes(sleepTime, 23 * 60);
  const now = getCurrentMinutes();
  if (wake === sleep) return true;
  if (wake < sleep) return now >= wake && now < sleep;
  return now >= wake || now < sleep;
}

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
      let d = data as any;

      // ===== Wake-up recovery =====
      // When the local time crosses the user's wake_time, restore HP/MP to full
      // and clear fatigue completely. Only run once per day.
      const wakeMinutes = timeStringToMinutes(d.wake_time, 7 * 60);
      const nowMinutes = getCurrentMinutes();
      const alreadyRecoveredToday = d.last_wake_recovery_date === today;
      const shouldRecoverOnWake = !alreadyRecoveredToday && nowMinutes >= wakeMinutes;

      if (shouldRecoverOnWake) {
        const fullHp = Number(d.max_hp ?? 100);
        const fullMp = Number(d.max_mp ?? 10);
        const wakePayload = {
          current_hp: fullHp,
          current_mp: fullMp,
          fatigue: 0,
          last_wake_recovery_date: today,
        };

        const { data: wakeData, error: wakeError } = await supabase
          .from("user_health_stats" as any)
          .update(wakePayload as any)
          .eq("user_id", user!.id)
          .select('*')
          .single();

        if (wakeError) throw wakeError;
        d = wakeData as any;
      }

      // ===== Daily hydration check (penalty for previous day) =====
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
    // Re-poll every minute so the wake-up moment fires even if the user keeps the page open.
    refetchInterval: 60_000,
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
  const { t } = useTranslation();
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
      toast.success(t("app.profile.measuresSavedToast"));
      setShowForm(false);
      setFormData({});
      setNotes("");
      setPhotoFile(null);
      setPhotoPreview(null);
      setUploading(false);
    },
    onError: () => {
      setUploading(false);
      toast.error(t("app.profile.measuresErrorToast"));
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
          <h3 className="text-sm font-bold text-foreground">{t('app.profile.physicalEvolutionTitle')}</h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium hover:bg-emerald-500/30 transition-colors"
        >
          <Plus className="w-3 h-3" /> {t('app.profile.newMeasurementButton')}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-card border border-emerald-500/20 rounded-xl p-4 space-y-4 animate-in slide-in-from-top-2">
          <h4 className="text-xs font-bold text-emerald-400">{t('app.profile.registerMeasuresTitle')}</h4>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {MEASUREMENT_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="text-[10px] text-muted-foreground mb-0.5 block">
                  {f.icon} {t('app.profile.measure_' + f.key)} ({f.unit})
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
            <label className="text-[10px] text-muted-foreground mb-0.5 block">{t('app.profile.observationsLabel')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-2 py-1.5 bg-muted border border-border rounded-lg text-sm text-foreground focus:border-emerald-500/50 outline-none resize-none h-16"
              placeholder={t('app.profile.observationsPlaceholder')}
            />
          </div>

          {/* Photo Upload */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">{t('app.profile.progressPhotoLabel')}</label>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
            <div className="flex items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-3 py-2 bg-muted border border-border rounded-lg text-xs text-muted-foreground hover:border-emerald-500/50 transition-colors"
              >
                <Upload className="w-3 h-3" /> {t('app.profile.choosePhotoButton')}
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
            <Save className="w-4 h-4" /> {uploading ? t('app.profile.savingIndicator') : t('app.profile.saveMeasuresButton')}
          </button>
        </div>
      )}

      {/* Latest Measurements */}
      {latest && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t('app.profile.lastMeasurementLabel')} {format(new Date(latest.measured_at), "dd MMM yyyy", { locale: ptBR })}
            </span>
            {measurements && measurements.length > 1 && (
              <span className="text-[10px] text-emerald-400">{t('app.profile.recordsCount', { count: measurements.length })}</span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MEASUREMENT_FIELDS.map((f) => {
              const value = latest[f.key];
              if (!value) return null;
              const diff = getDiff(f.key);
              return (
                <div key={f.key} className="bg-muted/30 border border-border rounded-lg p-2">
                  <p className="text-[10px] text-muted-foreground">{f.icon} {t('app.profile.measure_' + f.key)}</p>
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
              <h4 className="text-xs font-bold text-foreground">{t('app.profile.progressGalleryTitle')}</h4>
            </div>
            <span className="text-[10px] text-muted-foreground">{t('app.profile.photosCount', { count: photosWithUrl.length })}</span>
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
          <p className="text-sm">{t('app.profile.noMeasurementsYet')}</p>
          <p className="text-xs">{t('app.profile.clickToStartTracking')}</p>
        </div>
      )}
    </div>
  );
}

function EvolutionChart({ measurements }: { measurements: any[] }) {
  const { t } = useTranslation();
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
        <h4 className="text-xs font-bold text-foreground">{t('app.profile.evolutionChartTitle')}</h4>
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
            {t('app.profile.measure_' + m.key)}
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
                name={`${t('app.profile.measure_' + m.key)} (${m.unit})`}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ThemeToggleSettings() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-2 block">{t('app.profile.themeLabel')}</label>
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
          <span className="text-sm font-medium">{t('app.profile.themeDark')}</span>
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
          <span className="text-sm font-medium">{t('app.profile.themeLight')}</span>
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
  const updateRegion = useUpdateRegion();
  const syncHealthMaxes = useSyncHealthMaxes();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Amigos, conquistas e desafios
  const { data: friends = [] } = useFriends();
  const { data: pendingRequests = [] } = usePendingRequests();
  const { data: userAchievements = [] } = useUserAchievements();
  const { data: allAchievements = [] } = useAllAchievements();
  const { data: friendChallenges = [] } = useFriendChallenges();
  const sendFriendRequest = useSendFriendRequest();
  const respondFriendRequest = useRespondFriendRequest();
  const removeFriend = useRemoveFriend();
  const sendChallenge = useSendChallenge();
  const respondChallenge = useRespondChallenge();
  const markChallengeComplete = useMarkChallengeComplete();
  const heroBattle = useHeroVsHeroBattle();
  const [friendSearch, setFriendSearch] = useState("");
  const { data: searchResults = [], isFetching: isSearching } = useSearchProfile(friendSearch);

  // Estado para modal de desafio e resultado de batalha
  const [challengingFriend, setChallengingFriend] = useState<{ id: string; display_name: string | null } | null>(null);
  const [challengeTitle, setChallengeTitle] = useState("");
  const [challengeDesc, setChallengeDesc] = useState("");
  const [challengeDays, setChallengeDays] = useState(7);
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);
  const [battleFriendName, setBattleFriendName] = useState("");

  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<"perfil" | "habilidades" | "inventario" | "amigos" | "conquistas">("perfil");
  const [weight, setWeight] = useState(70);
  const [mealsTarget, setMealsTarget] = useState(3);
  const [sleepTime, setSleepTime] = useState('23:00');
  const [wakeTime, setWakeTime] = useState('07:00');
  const [volume, setVolume] = useState(100);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [xpAwarded, setXpAwarded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedRespecClass, setSelectedRespecClass] = useState<string>("guerreiro");
  const [selectedCombatSkillIds, setSelectedCombatSkillIds] = useState<string[]>([]);
  const onboardingDone = !!user && hasCompletedOnboarding((profile as Record<string, unknown> | null), user.id);

  useEffect(() => {
    if (!user) return;
    const savedClass = (profile as any)?.starter_class || localStorage.getItem(`starter_class_v1_${user.id}`) || "novato";
    setSelectedRespecClass(savedClass);
  }, [user, profile]);

  useEffect(() => {
    if (healthStats) {
      setWeight(Number(healthStats.weight_kg) || 70);
      setMealsTarget(healthStats.meals_target || 3);
      const rawSleep = String((healthStats as any).sleep_time || '23:00');
      const rawWake = String((healthStats as any).wake_time || '07:00');
      setSleepTime(rawSleep.slice(0, 5));
      setWakeTime(rawWake.slice(0, 5));
    }
  }, [healthStats]);

  // Sync region from profile
  useEffect(() => {
    if (profile) {
      setSelectedRegion((profile as any)?.region ?? null);
    }
  }, [profile]);

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

  // Sincroniza max_hp/max_mp no banco quando o perfil é carregado ou o nível muda.
  // Inclui bônus de equipamentos para que itens com mp_bonus sejam refletidos.
  useEffect(() => {
    if (!profile || !maxHp || !maxMp || syncHealthMaxes.isPending) return;
    const computedMaxHp = maxHp + (equipBonuses.hp || 0);
    const computedMaxMp = maxMp + (equipBonuses.mp || 0);
    syncHealthMaxes.mutate({ computedMaxHp, computedMaxMp });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.level, maxHp, maxMp, equipBonuses.hp, equipBonuses.mp]);

  // Hero is "asleep" between sleep_time and wake_time. While asleep, he doesn't
  // suffer hunger penalties — he wakes up at full HP/MP and only then starts
  // accumulating the day's effects.
  const heroAwake = useMemo(
    () => isHeroAwake(
      (healthStats as any)?.sleep_time,
      (healthStats as any)?.wake_time,
    ),
    [healthStats],
  );

  // Penalidades dinâmicas após LV 15 (somente quando acordado)
  let mealPenalty = 0;
  let penaltyMessages: string[] = [];
  if (heroAwake) {
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
        penaltyMessages.push(t('app.profile.mealPenaltyMsg', { penalty: mealPenalty }));
      }
    }
  }

  const persistedHp = Number(healthStats?.current_hp ?? maxHp);
  const persistedMp = Number(healthStats?.current_mp ?? maxMp);
  // While asleep, exibimos HP/MP cheios (regeneração noturna).
  const currentHp = heroAwake
    ? Math.max(0, Math.min(maxHp, persistedHp) - mealPenalty)
    : maxHp;
  const currentMp = heroAwake
    ? Math.max(0, Math.min(maxMp, persistedMp))
    : maxMp;
  const fatigue = heroAwake ? (healthStats?.fatigue ?? 0) : 0;
  const fatigueStatus =
    fatigue >= 75
      ? { label: t('app.profile.fatigueExhausted'), className: 'text-red-400' }
      : fatigue >= 45
        ? { label: t('app.profile.fatigueHigh'), className: 'text-orange-400' }
        : fatigue >= 15
          ? { label: t('app.profile.fatigueMedium'), className: 'text-yellow-400' }
          : { label: t('app.profile.fatigueLow'), className: 'text-emerald-400' };

  const saveSettings = useMutation({
    mutationFn: async () => {
      const wTarget = Math.round(weight * 35);
      const basePayload = {
        weight_kg: weight,
        meals_target: mealsTarget,
        water_target_ml: wTarget,
        sleep_time: sleepTime,
        wake_time: wakeTime,
      };
      if (healthStats) {
        await supabase
          .from("user_health_stats" as any)
          .update(basePayload as any)
          .eq("user_id", user!.id);
      } else {
        await supabase
          .from("user_health_stats" as any)
          .insert({ user_id: user!.id, ...basePayload } as any);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["health_stats"] });
      toast.success(t('app.profile.settingsSavedToast'));
      setShowSettings(false);
    },
  });

  const saveCombatLoadout = useMutation({
    mutationFn: async (skillIds: string[]) => {
      if (!user) throw new Error(t('app.profile.notAuthenticated'));

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
      toast.success(t('app.profile.combatLoadoutSavedToast'));
    },
    onError: (err: any) => {
      toast.error(err?.message || t('app.profile.combatLoadoutErrorToast'));
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
        toast.error(t('app.profile.maxSkillsError', { max: MAX_COMBAT_SKILLS }));
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
      toast.success(t('app.profile.mealLoggedToast'));
    },
    onError: (err) => {
      toast.error(t('app.profile.mealLogErrorPrefix') + (err?.message || err));
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

      toast.success(t('app.profile.waterLoggedToast'));
    },
    onError: (err) => {
      toast.error(t('app.profile.waterLogErrorPrefix') + (err?.message || err));
    }
  });

  const checkAndAwardXP = async () => {
    try {
      await awardHealthXP.mutateAsync();
      setXpAwarded(true);
      toast.success(t('app.profile.healthChallengeCompleteToast'));
    } catch (error: any) {
      if (error.message.includes('já ganhou')) {
        setXpAwarded(true);
        toast.info(t('app.profile.xpAlreadyCollectedToast'));
      } else {
        toast.error(t('app.profile.xpErrorPrefix') + error.message);
      }
    }
  };

  const waterPercent = Math.min(100, Math.round((totalWaterToday / waterTargetMl) * 100));

  // 🎯 Auto-disparar recompensa de XP quando ambas as metas (3+ refeições e água total) forem atingidas
  useEffect(() => {
    if (
      !xpAwarded &&
      !awardHealthXP.isPending &&
      mealsToday >= Math.max(3, mealsTarget) &&
      totalWaterToday >= waterTargetMl &&
      waterTargetMl > 0
    ) {
      checkAndAwardXP();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mealsToday, totalWaterToday, waterTargetMl, mealsTarget, xpAwarded]);

  const hpPercent = Math.round((currentHp / maxHp) * 100);
  const mpPercent = Math.round((currentMp / maxMp) * 100);
  const currentGold = (goldBalance as any)?.gold ?? 100;

  const respecClass = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error(t('app.profile.notAuthenticated'));
      const currentClass = (profile as any)?.starter_class || localStorage.getItem(`starter_class_v1_${user.id}`) || "novato";
      if (selectedRespecClass === currentClass) {
        throw new Error(t('app.profile.alreadyInClass'));
      }

      // Tenta RPC — custo é calculado server-side (primeiro respec gratuito verificado no servidor)
      const { data, error } = await (supabase.rpc as any)("perform_class_respec", {
        target_class: selectedRespecClass,
      });

      const isFirstRespec = !localStorage.getItem(`respec_used_${user.id}`);
      if (error) {
        // Fallback: verifica ouro e atualiza diretamente
        if (!isFirstRespec) {
          const { data: bal } = await supabase.from('user_balance').select('gold').eq('user_id', user.id).single();
          const gold = (bal as any)?.gold ?? 0;
          if (gold < RESPEC_COST) throw new Error(t('app.profile.insufficientGold', { gold, required: RESPEC_COST }));
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
        toast.success(t('app.profile.classChangedFreeToast', { item: data.starterItem }));
      } else {
        toast.success(t('app.profile.classChangedToast', { item: data.starterItem }));
      }
    },
    onError: (err: any) => {
      toast.error(err.message || t('app.profile.classChangeErrorToast'));
    },
  });

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-primary font-display">{t('app.profile.pageTitle')}</h1>
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
                        onSuccess: () => { toast.success(t('app.profile.nameUpdatedToast')); setEditingName(false); },
                        onError: (err: any) => toast.error(err.message),
                      });
                    }
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
                <button
                  onClick={() => {
                    updateDisplayName.mutate(newName, {
                      onSuccess: () => { toast.success(t('app.profile.nameUpdatedToast')); setEditingName(false); },
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
                <p className="text-sm text-muted-foreground">{profile?.display_name || t('app.profile.defaultAdventurerName')}</p>
                <button
                  onClick={() => { setNewName(profile?.display_name || ""); setEditingName(true); }}
                  className="p-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                  title={t('app.profile.editNameTooltip')}
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
            { id: "perfil",      label: t("app.profile.tabPerfil") },
            { id: "habilidades", label: t("app.profile.tabHabilidades") },
            { id: "inventario",  label: t("app.profile.tabInventario") },
            { id: "amigos",      label: t("app.profile.tabAmigos"), badge: (() => { const n = pendingRequests.length + friendChallenges.filter(c => c.challenged_id === user?.id && c.status === 'pending').length; return n > 0 ? n : undefined; })() },
            { id: "conquistas",  label: t("app.profile.tabConquistas"), badge: userAchievements.length > 0 ? userAchievements.length : undefined },
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
            <h3 className="text-sm font-bold text-foreground">{t('app.profile.settingsTitle')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('app.profile.weightLabel')}</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setWeight(Math.max(30, weight - 1))} className="p-1 rounded bg-muted hover:bg-muted/80"><Minus className="w-4 h-4" /></button>
                  <span className="text-lg font-bold text-foreground w-16 text-center">{weight}</span>
                  <button onClick={() => setWeight(Math.min(200, weight + 1))} className="p-1 rounded bg-muted hover:bg-muted/80"><Plus className="w-4 h-4" /></button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{t('app.profile.waterGoalHint', { amount: Math.round(weight * 35) })}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('app.profile.mealsPerDayLabel')}</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setMealsTarget(Math.max(1, mealsTarget - 1))} className="p-1 rounded bg-muted hover:bg-muted/80"><Minus className="w-4 h-4" /></button>
                  <span className="text-lg font-bold text-foreground w-16 text-center">{mealsTarget}x</span>
                  <button onClick={() => setMealsTarget(Math.min(8, mealsTarget + 1))} className="p-1 rounded bg-muted hover:bg-muted/80"><Plus className="w-4 h-4" /></button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{t('app.profile.mealsMinimumHint', { count: Math.ceil(mealsTarget / 2) })}</p>
              </div>
            </div>

            {/* Sleep schedule */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                  <Moon className="w-3.5 h-3.5 text-indigo-400" /> {t('app.profile.sleepTimeLabel')}
                </label>
                <input
                  type="time"
                  value={sleepTime}
                  onChange={(e) => setSleepTime(e.target.value)}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:border-indigo-500/50 outline-none"
                />
                <p className="text-[10px] text-muted-foreground mt-1">{t('app.profile.sleepTimeHint')}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                  <Sun className="w-3.5 h-3.5 text-amber-400" /> {t('app.profile.wakeTimeLabel')}
                </label>
                <input
                  type="time"
                  value={wakeTime}
                  onChange={(e) => setWakeTime(e.target.value)}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:border-amber-500/50 outline-none"
                />
                <p className="text-[10px] text-muted-foreground mt-1">{t('app.profile.wakeTimeHint')}</p>
              </div>
            </div>
            
            {/* Volume Control */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block flex items-center gap-2">
                {t('app.profile.volumeLabel')}
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
              <p className="text-[10px] text-muted-foreground mt-1">{t('app.profile.volumeHint')}</p>
            </div>

            {/* Theme Toggle */}
            <ThemeToggleSettings />

            {/* Region Selector */}
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">🌐 Região (afeta ranking regional)</label>
              <div className="flex flex-wrap gap-2">
                {REGIONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRegion(r.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      selectedRegion === r.id
                        ? 'border-primary bg-primary/20 text-primary'
                        : 'border-border bg-muted/30 text-muted-foreground hover:border-primary/50'
                    }`}
                  >
                    <span>{r.icon}</span> {r.name}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                saveSettings.mutate();
                setVolume(volume);
                if (selectedRegion !== ((profile as any)?.region ?? null)) {
                  updateRegion.mutate(selectedRegion, {
                    onSuccess: () => toast.success('Região atualizada!'),
                    onError: (err: any) => toast.error(err.message || 'Erro ao salvar região'),
                  });
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
            >
              <Save className="w-4 h-4" /> {t('app.profile.saveButton')}
            </button>
          </div>
        )}

        {/* ======== ABA: PERFIL ======== */}
        {activeTab === "perfil" && (
          <div className="space-y-6">
            {/* Alerta de formulário inicial não concluído */}
            {profile && !onboardingDone && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/40 rounded-xl p-4"
              >
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-amber-300">Configuração inicial incompleta</p>
                  <p className="text-xs text-amber-200/70 mt-0.5">
                    Você ainda não concluiu o formulário inicial. Escolha sua classe, região e missões iniciais para desbloquear todas as funcionalidades do jogo.
                  </p>
                  <button
                    onClick={() => navigate('/onboarding')}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold hover:bg-amber-500/30 transition-colors"
                  >
                    <Scroll className="w-3.5 h-3.5" /> Completar formulário inicial
                  </button>
                </div>
              </motion.div>
            )}

            {/* XP Award Card */}
            {mealsToday >= Math.max(3, mealsTarget) && totalWaterToday >= waterTargetMl && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rpg-card-glow bg-gradient-to-r from-success/10 to-primary/10 border-success/30 text-center p-6 space-y-3"
              >
                <span className="text-4xl inline-block">🏆</span>
                <h2 className="font-display font-bold text-lg text-success">{t('app.profile.allGoalsComplete')}</h2>
                <p className="text-sm text-muted-foreground">{t('app.profile.xpHealthRewardMsg')}</p>
                <div className="text-3xl font-bold text-xp pt-2">{t('app.profile.xpRewardValue')}</div>
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
                <span className="text-sm text-muted-foreground">{t('app.profile.fatigueLabel')}</span>
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
                    <h3 className="text-sm font-bold text-foreground">{t('app.profile.hungerTitle')}</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">{t('app.profile.hungerGoal', { count: mealsTarget })}</span>
                </div>
                <div className="flex items-center gap-2">
                  {Array.from({ length: mealsTarget }).map((_, i) => (
                    <div key={i} className={`flex-1 h-8 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${i < mealsToday ? "bg-orange-500/20 border-orange-500/50 text-orange-400" : "bg-muted/30 border-border text-muted-foreground/40"}`}>
                      {i < mealsToday ? "🍖" : `${i + 1}`}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t('app.profile.mealsCountText', { current: mealsToday, target: mealsTarget })}</span>
                  <button
                    onClick={() => logMeal.mutate()}
                    disabled={mealsToday >= mealsTarget || logMeal.isPending}
                    className={`flex items-center gap-1 px-3 py-1.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-lg text-xs font-medium hover:bg-orange-500/30 transition-colors ${mealsToday >= mealsTarget || logMeal.isPending ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    {logMeal.isPending ? (
                      <span className="animate-spin mr-1 w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full"></span>
                    ) : <Plus className="w-3 h-3" />} {t('app.profile.mealButton')}
                  </button>
                </div>
                {mealsToday < mealHalf && (
                  <p className="text-[10px] text-red-400">{t('app.profile.eatMinimumWarning', { count: mealHalf })}</p>
                )}
              </div>

              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Droplets className="w-5 h-5 text-cyan-400" />
                    <h3 className="text-sm font-bold text-foreground">{t('app.profile.thirstTitle')}</h3>
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
                <p className="text-[10px] text-muted-foreground text-center">{t('app.profile.waterHint', { weight, target: waterTargetMl })}</p>
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
                <h3 className="text-lg font-bold text-foreground">{t('app.profile.tacticalSkillsTitle')}</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('app.profile.tacticalSkillsDesc')}
              </p>

              <HeroStatusBar />

              <div className="bg-muted/30 border border-border rounded-lg p-3 text-xs">
                <p className="text-foreground font-semibold">{t('app.profile.starterClassInfo', { class: starterClass })}</p>
                <p className="text-muted-foreground">{t('app.profile.starterItemInfo', { item: starterItem })}</p>
                <p className="text-muted-foreground mt-1">{t('app.profile.magicWeakNote')}</p>
              </div>

              <div className="bg-muted/20 border border-border rounded-lg p-4 flex items-center gap-3">
                <span className="text-xl">🔒</span>
                <div>
                  <p className="text-sm font-bold text-foreground">{t('app.profile.permanentClassTitle')}</p>
                  <p className="text-xs text-muted-foreground">{t('app.profile.permanentClassDesc')}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-foreground mb-2">{t('app.profile.noviceKitSection')}</h4>
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
                          {skill.unlocked ? t('app.profile.skillActive') : t('app.profile.skillReqLevel', { level: skill.unlockLevel })}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground">{skill.description}</p>
                      <p className="text-[11px] text-muted-foreground">{t('app.profile.skillRequiredItem', { item: skill.requiredItem })}</p>

                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div className="bg-background/60 rounded p-2 border border-border/50">
                          <p className="text-muted-foreground">{t('app.profile.skillPower')}</p>
                          <p className="font-bold text-foreground">{skill.power}</p>
                        </div>
                        <div className="bg-background/60 rounded p-2 border border-border/50">
                          <p className="text-muted-foreground">MP</p>
                          <p className="font-bold text-cyan-400">{Math.max(2, Math.min(16, Math.ceil((skill.power || 0) / 15)))}</p>
                        </div>
                        <div className="bg-background/60 rounded p-2 border border-border/50">
                          <p className="text-muted-foreground">{t('app.profile.skillCooldown')}</p>
                          <p className="font-bold text-foreground">{skill.cooldown}t</p>
                        </div>
                        <div className="bg-background/60 rounded p-2 border border-border/50">
                          <p className="text-muted-foreground">{t('app.profile.skillBase')}</p>
                          <p className="font-bold text-foreground text-[10px]">{skill.basedOn.join(" + ")}</p>
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
                          {selectedCombatSkillIds.includes(skill.id) ? t('app.profile.removeFromLoadout') : t('app.profile.addToLoadout')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-foreground mb-2">{t('app.profile.uniqueClassSkillsSection')}</h4>
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

                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div className="bg-background/60 rounded p-2 border border-border/50">
                        <p className="text-muted-foreground">{t('app.profile.skillPower')}</p>
                        <p className="font-bold text-foreground">{skill.power}</p>
                      </div>
                      <div className="bg-background/60 rounded p-2 border border-border/50">
                        <p className="text-muted-foreground">MP</p>
                        <p className="font-bold text-cyan-400">{Math.max(2, Math.min(16, Math.ceil((skill.power || 0) / 15)))}</p>
                      </div>
                      <div className="bg-background/60 rounded p-2 border border-border/50">
                        <p className="text-muted-foreground">{t('app.profile.skillCooldown')}</p>
                        <p className="font-bold text-foreground">{skill.cooldown}t</p>
                      </div>
                      <div className="bg-background/60 rounded p-2 border border-border/50">
                        <p className="text-muted-foreground">{t('app.profile.skillBase')}</p>
                        <p className="font-bold text-foreground text-[10px]">{skill.basedOn.join(" + ")}</p>
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
                        {selectedCombatSkillIds.includes(skill.id) ? t('app.profile.removeFromLoadout') : t('app.profile.addToLoadout')}
                      </button>
                    )}
                  </div>
                ))}
                </div>
              </div>

              <div className="bg-secondary/40 border border-border rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm text-foreground font-semibold">{t('app.profile.unlockedSkillsLabel')}</span>
                <span className="text-2xl font-bold text-primary">{unlockedSkills.length}</span>
              </div>

              <div className="bg-zinc-900/40 border border-zinc-700 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground font-semibold">{t('app.profile.combatLoadoutTitle')}</span>
                  <span className="text-xs text-zinc-300">{selectedCombatSkills.length}/{MAX_COMBAT_SKILLS}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('app.profile.combatLoadoutDesc', { max: MAX_COMBAT_SKILLS })}
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedCombatSkills.length > 0 ? (
                    selectedCombatSkills.map((skill: any) => (
                      <span key={skill.id} className="text-xs px-2 py-1 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                        {skill.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-zinc-400">{t('app.profile.noSkillSelected')}</span>
                  )}
                </div>
                <button
                  onClick={() => saveCombatLoadout.mutate(selectedCombatSkillIds)}
                  disabled={saveCombatLoadout.isPending}
                  className="rounded-lg bg-primary/80 px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary disabled:opacity-60"
                >
                  {saveCombatLoadout.isPending ? t('app.profile.savingLoadout') : t('app.profile.saveLoadoutButton')}
                </button>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Skull className="w-5 h-5 text-destructive" />
                <h3 className="text-base font-bold text-foreground">{t('app.profile.bossStatusTitle')}</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('app.profile.bossStatusDesc')}
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
                            {t('app.profile.bossThreat', { level: b.threat })}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div><p className="text-muted-foreground">ATK</p><p className="font-bold">{b.atk}</p></div>
                          <div><p className="text-muted-foreground">MATK</p><p className="font-bold">{b.matk}</p></div>
                          <div><p className="text-muted-foreground">DEF</p><p className="font-bold">{b.def}</p></div>
                          <div><p className="text-muted-foreground">AGI</p><p className="font-bold">{b.agi}</p></div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t('app.profile.bossTacticalWeakness')} <span className="text-primary font-semibold">{b.weakness}</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('app.profile.noBossFound')}</p>
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
                    <h3 className="text-sm font-bold text-foreground">{t('app.profile.magicAttunementTitle')}</h3>
                    <span className="text-xs text-muted-foreground">{t('app.profile.attunementSlots', { count: attunedItems.length })}</span>
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
                          title={item ? t('app.profile.itemAttuned', { name: item.game_items?.name || 'Item' }) : t('app.profile.slotEmpty')}
                        >
                          {item ? item.game_items?.icon || '💍' : '○'}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('app.profile.attunementHint')}
                  </p>
                </div>
              );
            })()}

            <div className="bg-card border border-border rounded-xl p-6 space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <Swords className="w-6 h-6 text-primary" />
                <h3 className="text-lg font-bold text-foreground">{t('app.profile.inventoryTitle')}</h3>
              </div>

              {!(profile as any)?.starter_kit_claimed ? (
                <div className="space-y-4">
                  <div className="text-center space-y-2">
                    <p className="text-4xl">🥚</p>
                    <p className="text-sm font-bold text-foreground">{t('app.profile.starterKitAvailableTitle')}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('app.profile.starterKitDesc')}
                    </p>
                    <button
                      onClick={() => {
                        claimStarterKit.mutate(undefined, {
                          onSuccess: () => toast.success(t('app.profile.starterKitClaimedToast')),
                          onError: (err: any) => toast.error(err.message || t('app.profile.starterKitErrorToast')),
                        });
                      }}
                      disabled={claimStarterKit.isPending}
                      className="px-6 py-2 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {claimStarterKit.isPending ? t('app.profile.claimingKit') : t('app.profile.claimStarterKitButton')}
                    </button>
                  </div>
                </div>
              ) : inventory.length === 0 ? (
                <div className="space-y-2 text-center">
                  <p className="text-4xl">🛡️</p>
                  <p className="text-sm text-muted-foreground">
                    {(profile as any)?.class_kit_claimed
                      ? t('app.profile.defeatBossesForItems')
                      : t('app.profile.reachLevel5ForKit')
                    }
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
                      weapon: t('app.profile.weaponsCategory'),
                      armor: t('app.profile.armorCategory'),
                      accessory: t('app.profile.accessoryCategory'),
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
                                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">{t('app.profile.bestItemBadge')}</span>
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
                                            {inv.sintonizado ? t('app.profile.itemSynced') : t('app.profile.itemRequiresSync')}
                                          </span>
                                        )}
                                      </div>
                                      {requiresAttunement && !inv.sintonizado && (
                                        <p className="text-[11px] text-amber-400 mt-1">{t('app.profile.itemNoBonusWarning')}</p>
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
                                            { onError: (err: any) => toast.error(err?.message || t('app.profile.equipErrorToast')) },
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
                                        {inv.equipped ? t('app.profile.equipped') : t('app.profile.equipButton')}
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
                                                      t('app.profile.attunementLimitToast'),
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
                                          {inv.sintonizado ? t('app.profile.desynced') : t('app.profile.syncButton')}
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
                          {t('app.profile.consumablesTitle')}
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
                                  {t('app.profile.useItemButton')}
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
                {t('app.profile.inventoryTip')}
              </div>
            </div>
          </div>
        )}

        {/* ======== ABA: AMIGOS ======== */}
        {activeTab === "amigos" && (
          <div className="space-y-5">
            {/* Modal de desafio de rotina */}
            {challengingFriend && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
                onClick={(e) => { if (e.target === e.currentTarget) setChallengingFriend(null); }}
              >
                <div className="bg-card border border-primary/30 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
                  <div className="flex items-center gap-3">
                    <Scroll className="w-6 h-6 text-primary" />
                    <h3 className="text-base font-bold text-foreground">Desafiar {challengingFriend.display_name || 'Aventureiro'}</h3>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Título do desafio *</label>
                      <input
                        type="text"
                        value={challengeTitle}
                        onChange={(e) => setChallengeTitle(e.target.value)}
                        maxLength={80}
                        placeholder="Ex: Treinar 5x na semana"
                        className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:border-primary/50 outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Descrição (opcional)</label>
                      <textarea
                        value={challengeDesc}
                        onChange={(e) => setChallengeDesc(e.target.value)}
                        maxLength={200}
                        placeholder="Detalhe o desafio..."
                        rows={3}
                        className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:border-primary/50 outline-none resize-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Duração (dias): {challengeDays}</label>
                      <input
                        type="range"
                        min={1}
                        max={30}
                        value={challengeDays}
                        onChange={(e) => setChallengeDays(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>1 dia</span>
                        <span>30 dias</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setChallengingFriend(null)}
                      className="flex-1 px-4 py-2 bg-muted border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (!challengeTitle.trim()) { toast.error('Digite um título para o desafio.'); return; }
                        sendChallenge.mutate(
                          { challenged_id: challengingFriend.id, title: challengeTitle.trim(), description: challengeDesc.trim() || undefined, duration_days: challengeDays },
                          {
                            onSuccess: () => {
                              toast.success(`Desafio enviado para ${challengingFriend.display_name || 'Aventureiro'}!`);
                              setChallengingFriend(null);
                              setChallengeTitle('');
                              setChallengeDesc('');
                              setChallengeDays(7);
                            },
                            onError: (err: any) => toast.error(err.message || 'Erro ao enviar desafio.'),
                          },
                        );
                      }}
                      disabled={sendChallenge.isPending}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      <Scroll className="w-4 h-4" /> Enviar Desafio
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Modal de resultado de batalha */}
            {battleResult && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
                onClick={(e) => { if (e.target === e.currentTarget) setBattleResult(null); }}
              >
                <div className="bg-card border border-primary/30 rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl text-center">
                  <div className="text-5xl">{battleResult.is_winner ? '🏆' : '💀'}</div>
                  <h3 className={`text-xl font-black ${battleResult.is_winner ? 'text-yellow-400' : 'text-red-400'}`}>
                    {battleResult.is_winner ? 'VITÓRIA!' : 'DERROTA!'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    <span className="text-foreground font-bold">{battleResult.winner_name}</span> venceu em{' '}
                    <span className="text-primary font-bold">{battleResult.total_rounds} rodadas</span>
                  </p>
                  <div className="bg-muted/30 rounded-xl p-3 text-left space-y-1.5 max-h-40 overflow-y-auto">
                    {battleResult.rounds.slice(0, 10).map((r, i) => (
                      <p key={i} className="text-[11px] text-muted-foreground">
                        <span className="font-bold text-foreground">R{r.round}</span>{' '}
                        {r.is_crit && <span className="text-yellow-400">⚡CRÍTICO! </span>}
                        <span className={r.attacker_id === user?.id ? 'text-emerald-400' : 'text-red-400'}>
                          {r.attacker_id === user?.id ? 'Você' : battleFriendName}
                        </span>{' '}
                        causou <span className="font-bold">{r.damage}</span> de dano
                      </p>
                    ))}
                    {battleResult.rounds.length > 10 && (
                      <p className="text-[10px] text-muted-foreground text-center">...e mais {battleResult.rounds.length - 10} rodadas</p>
                    )}
                  </div>
                  <button
                    onClick={() => setBattleResult(null)}
                    className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              </motion.div>
            )}

            {/* Buscar amigo */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <UserPlus className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-bold text-foreground">{t('app.profile.addFriendTitle')}</h3>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  placeholder={t('app.profile.searchFriendPlaceholder')}
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
                            {t('app.profile.friendLevelInfo', { level: profile.level, class: profile.starter_class || t('app.profile.noviceClassFallback') })}
                          </p>
                        </div>
                        {alreadyFriend ? (
                          <span className="text-xs text-emerald-400 flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" />{t('app.profile.alreadyFriendLabel')}</span>
                        ) : (
                          <button
                            onClick={() =>
                              sendFriendRequest.mutate(profile.user_id, {
                                onSuccess: () => { toast.success(t('app.profile.friendRequestSentToast', { name: profile.display_name })); setFriendSearch(""); },
                                onError: (err: any) => toast.error(err.message || t('app.profile.friendRequestErrorToast')),
                              })
                            }
                            disabled={sendFriendRequest.isPending}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-medium hover:bg-primary/30 transition-colors disabled:opacity-50"
                          >
                            <UserPlus className="w-3 h-3" /> {t('app.profile.addFriendButton')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {friendSearch.length >= 2 && !isSearching && searchResults.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">{t('app.profile.noHeroFound')}</p>
              )}
            </div>

            {/* Solicitações pendentes */}
            {pendingRequests.length > 0 && (
              <div className="bg-card border border-amber-500/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400 text-sm font-bold">{t('app.profile.pendingRequestsTitle', { count: pendingRequests.length })}</span>
                </div>
                <div className="space-y-2">
                  {pendingRequests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{req.other_profile?.display_name || 'Aventureiro'}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('app.profile.friendLevelInfo', { level: req.other_profile?.level || '?', class: req.other_profile?.starter_class || t('app.profile.noviceClassFallback') })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            respondFriendRequest.mutate({ requestId: req.id, accept: true }, {
                              onSuccess: () => toast.success(t('app.profile.friendshipAcceptedToast')),
                              onError: (err: any) => toast.error(err.message),
                            })
                          }
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium hover:bg-emerald-500/30 transition-colors"
                        >
                          <UserCheck className="w-3 h-3" /> {t('app.profile.acceptFriendButton')}
                        </button>
                        <button
                          onClick={() =>
                            respondFriendRequest.mutate({ requestId: req.id, accept: false }, {
                              onSuccess: () => toast.info(t('app.profile.requestRejectedToast')),
                              onError: (err: any) => toast.error(err.message),
                            })
                          }
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-medium hover:bg-rose-500/30 transition-colors"
                        >
                          <UserX className="w-3 h-3" /> {t('app.profile.rejectFriendButton')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Desafios pendentes recebidos */}
            {(() => {
              const pendingChallenges = friendChallenges.filter(
                (c) => c.challenged_id === user?.id && c.status === 'pending' && c.challenge_type === 'routine',
              );
              if (pendingChallenges.length === 0) return null;
              return (
                <div className="bg-card border border-violet-500/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Scroll className="w-5 h-5 text-violet-400" />
                    <span className="text-sm font-bold text-violet-300">Desafios recebidos ({pendingChallenges.length})</span>
                  </div>
                  <div className="space-y-2">
                    {pendingChallenges.map((c) => (
                      <div key={c.id} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-foreground">{c.title}</p>
                            {c.description && <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>}
                            <p className="text-[10px] text-violet-400 mt-1">
                              De: <span className="font-bold">{c.challenger_profile?.display_name || 'Aventureiro'}</span>
                              {c.duration_days && ` · ${c.duration_days} dias`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => respondChallenge.mutate({ challengeId: c.id, accept: true }, {
                              onSuccess: () => toast.success('Desafio aceito! Boa sorte!'),
                              onError: (err: any) => toast.error(err.message),
                            })}
                            disabled={respondChallenge.isPending}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium hover:bg-emerald-500/30 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle className="w-3 h-3" /> Aceitar
                          </button>
                          <button
                            onClick={() => respondChallenge.mutate({ challengeId: c.id, accept: false }, {
                              onSuccess: () => toast.info('Desafio recusado.'),
                              onError: (err: any) => toast.error(err.message),
                            })}
                            disabled={respondChallenge.isPending}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-medium hover:bg-rose-500/30 transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-3 h-3" /> Recusar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Desafios ativos */}
            {(() => {
              const activeChallenges = friendChallenges.filter(
                (c) => c.status === 'active',
              );
              if (activeChallenges.length === 0) return null;
              return (
                <div className="bg-card border border-emerald-500/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-bold text-emerald-300">Desafios em andamento ({activeChallenges.length})</span>
                  </div>
                  <div className="space-y-2">
                    {activeChallenges.map((c) => {
                      const iAmChallenger = c.challenger_id === user?.id;
                      const iDone = iAmChallenger ? c.challenger_completed : c.challenged_completed;
                      const otherName = iAmChallenger
                        ? (c.challenged_profile?.display_name || 'Aventureiro')
                        : (c.challenger_profile?.display_name || 'Aventureiro');
                      const otherDone = iAmChallenger ? c.challenged_completed : c.challenger_completed;
                      return (
                        <div key={c.id} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                          <div>
                            <p className="text-sm font-bold text-foreground">{c.title}</p>
                            {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                            <p className="text-[10px] text-muted-foreground mt-1">vs. {otherName} · {c.duration_days} dias</p>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className={`flex items-center gap-1 ${iDone ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                              {iDone ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                              Você: {iDone ? 'Concluído' : 'Em andamento'}
                            </span>
                            <span className="text-muted-foreground">|</span>
                            <span className={`flex items-center gap-1 ${otherDone ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                              {otherDone ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                              {otherName}: {otherDone ? 'Concluído' : 'Em andamento'}
                            </span>
                          </div>
                          {!iDone && (
                            <button
                              onClick={() => markChallengeComplete.mutate(c.id, {
                                onSuccess: () => toast.success('Desafio concluído! 🎉'),
                                onError: (err: any) => toast.error(err.message),
                              })}
                              disabled={markChallengeComplete.isPending}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-foreground rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Marcar como concluído
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Lista de amigos */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">{t('app.profile.myFriendsTitle')}</h3>
                </div>
                <span className="text-xs text-muted-foreground">{friends.length}/50</span>
              </div>

              {friends.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{t('app.profile.noFriendsYet')}</p>
                  <p className="text-xs mt-1">{t('app.profile.searchAboveHint')}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {friends.map((friend) => {
                    const p = friend.other_profile;
                    const friendId = p?.user_id;
                    const stats = getFriendStats(user?.id, friendId, friendChallenges);
                    const classEmoji: Record<string, string> = {
                      guerreiro: '⚔️', mago: '📖', gatuno: '🌙',
                      ferreiro: '🔨', clerico: '✝️', arqueiro: '🏹',
                    };
                    return (
                      <div key={friend.id} className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                        <div className="flex items-center gap-3">
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
                              {t('app.profile.friendLevelInfo', { level: p?.level || 1, class: p?.starter_class || t('app.profile.noviceClassFallback') })}
                            </p>
                          </div>
                          <button
                            onClick={() =>
                              removeFriend.mutate(friend.id, {
                                onSuccess: () => toast.info(t('app.profile.friendRemovedToast')),
                                onError: (err: any) => toast.error(err.message),
                              })
                            }
                            className="p-1.5 text-muted-foreground hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-500/10"
                            title={t('app.profile.removeFriendTooltip')}
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Estatísticas de batalha */}
                        {(stats.wins > 0 || stats.losses > 0 || stats.draws > 0) && (
                          <div className="flex items-center gap-2 px-1">
                            <Award className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="text-emerald-400 font-bold">{stats.wins}V</span>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-red-400 font-bold">{stats.losses}D</span>
                              {stats.draws > 0 && (
                                <>
                                  <span className="text-muted-foreground">·</span>
                                  <span className="text-yellow-400 font-bold">{stats.draws}E</span>
                                </>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Ações */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setChallengingFriend({ id: p?.user_id || '', display_name: p?.display_name || null });
                              setChallengeTitle('');
                              setChallengeDesc('');
                              setChallengeDays(7);
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-violet-500/15 text-violet-400 border border-violet-500/30 rounded-lg text-xs font-medium hover:bg-violet-500/25 transition-colors"
                          >
                            <Scroll className="w-3 h-3" /> Desafiar
                          </button>
                          <button
                            onClick={() => {
                              if (!p?.user_id) return;
                              setBattleFriendName(p.display_name || 'Aventureiro');
                              heroBattle.mutate(
                                { challenged_id: p.user_id, my_level: profile?.level || 1, my_attrs: attributeLevels },
                                {
                                  onSuccess: (result) => {
                                    setBattleResult(result);
                                    toast(result.is_winner ? '⚔️ Vitória!' : '💀 Derrota!', { description: `${result.total_rounds} rodadas` });
                                  },
                                  onError: (err: any) => toast.error(err.message || 'Erro na batalha.'),
                                },
                              );
                            }}
                            disabled={heroBattle.isPending}
                            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-rose-500/15 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-medium hover:bg-rose-500/25 disabled:opacity-50 transition-colors"
                          >
                            <Sword className="w-3 h-3" /> Batalhar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Histórico de batalhas recentes */}
            {(() => {
              const battles = friendChallenges.filter((c) => c.challenge_type === 'battle' && c.status === 'completed').slice(0, 5);
              if (battles.length === 0) return null;
              return (
                <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Sword className="w-5 h-5 text-primary" />
                    <h3 className="text-sm font-bold text-foreground">Batalhas recentes</h3>
                  </div>
                  <div className="space-y-2">
                    {battles.map((b) => {
                      const iWon = b.winner_id === user?.id;
                      const opponentName = b.challenger_id === user?.id
                        ? (b.challenged_profile?.display_name || 'Aventureiro')
                        : (b.challenger_profile?.display_name || 'Aventureiro');
                      return (
                        <div key={b.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${iWon ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                          <span className="text-xl">{iWon ? '🏆' : '💀'}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">vs. {opponentName}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {b.completed_at ? new Date(b.completed_at).toLocaleDateString('pt-BR') : ''}
                              {b.battle_log?.total_rounds && ` · ${b.battle_log.total_rounds} rodadas`}
                            </p>
                          </div>
                          <span className={`text-xs font-black ${iWon ? 'text-emerald-400' : 'text-red-400'}`}>
                            {iWon ? 'VITÓRIA' : 'DERROTA'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
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
                <p className="text-xs text-muted-foreground">{t('app.profile.achievementsUnlocked')}</p>
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
                          <span className="text-[10px] text-emerald-400 font-semibold">{t('app.profile.achievementUnlocked')}</span>
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
