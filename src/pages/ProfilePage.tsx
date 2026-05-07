import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { useTheme } from "next-themes";
import AppLayout from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useAttributes, useAwardHealthXP, useBosses, useUpdateDisplayName, useUpdateRegion, useClasses, useSyncHealthMaxes } from "@/hooks/useProfile";
import {
  useUserAchievements,
  useAllAchievements,
  useClaimAchievement,
} from "@/hooks/useAchievements";
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
import { getLevelProgress } from "@/lib/progression";
import GuidedTour, { type TourStep } from '@/components/GuidedTour';

const PROFILE_TOUR_STEPS: TourStep[] = [
  {
    target: 'profile-hero',
    title: 'Seu Cartão de Herói 🦸',
    description: 'Aqui ficam seu nome, nível, classe atual e barra de XP. Clique no lápis para editar seu nome de aventureiro a qualquer momento.',
  },
  {
    target: 'profile-gold',
    title: 'Saldo de Ouro 🪙',
    description: 'O ouro é ganho completando missões e bônus diários. Use-o na Loja do Tempo para comprar buffs temporários e itens especiais.',
  },
  {
    target: 'profile-tabs',
    title: 'Seções do Perfil 📱',
    description: 'Navegue pelas abas: Perfil (saúde e corpo), Habilidades (loadout de combate), Inventário (equipamentos) e Conquistas. O badge vermelho indica conquistas pendentes!',
  },
  {
    target: 'profile-settings',
    title: 'Configurações do Herói ⚙️',
    description: 'Configure seu peso (para calcular meta diária de hidratação), número de refeições, horário de sono e acordar, volume e tema visual.',
  },
  {
    target: 'profile-vitals',
    title: 'Status Vital ❤️',
    description: 'HP, MP e Fadiga são calculados em tempo real com base no seu nível. Comer refeições e beber água mantém o herói saudável e com buffs ativos.',
  },
];
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
  Ferreiro: 'ferreiro',
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

  // Conquistas
  const { data: userAchievements = [] } = useUserAchievements();
  const { data: allAchievements = [] } = useAllAchievements();
  const claimAchievement = useClaimAchievement();

  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<"perfil" | "habilidades" | "inventario" | "conquistas">("perfil");
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

  // Cooldown de 1h entre refeições
  const MEAL_COOLDOWN_MS = 60 * 60 * 1000;
  const lastMealAt = useMemo(() => {
    const arr = (todayMeals || []) as any[];
    if (arr.length === 0) return null;
    const times = arr
      .map((m) => new Date(m.logged_at).getTime())
      .filter((n) => Number.isFinite(n));
    return times.length ? Math.max(...times) : null;
  }, [todayMeals]);
  const [mealNowTick, setMealNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!lastMealAt) return;
    if (Date.now() - lastMealAt >= MEAL_COOLDOWN_MS) return;
    const id = setInterval(() => setMealNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [lastMealAt]);
  const mealCooldownRemainingMs = lastMealAt
    ? Math.max(0, lastMealAt + MEAL_COOLDOWN_MS - mealNowTick)
    : 0;
  const mealCooldownActive = mealCooldownRemainingMs > 0;
  const mealCooldownMinLeft = Math.ceil(mealCooldownRemainingMs / 60000);
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
  // Nome completo da classe atual (ex: "Alquimista", "Mecânico") para lookup em T3_CLASS_SKILLS
  const currentClassName = useMemo(() => {
    const currentClassId = (profile as any)?.current_class_id;
    if (currentClassId && classes) {
      const cls = (classes as any[]).find((c) => c.id === currentClassId);
      if (cls?.name) return cls.name as string;
    }
    return undefined;
  }, [profile, classes]);
  const playerCombatStats = useMemo(
    () => getPlayerCombatStats(profile?.level || 1, attributeLevels),
    [profile?.level, attributeLevels],
  );
  const skillLoadout = useMemo(
    () => getSkillLoadout(profile?.level || 1, attributeLevels, starterClass, starterItem, currentClassName),
    [profile?.level, attributeLevels, starterClass, starterItem, currentClassName],
  );
  const noviceSkills = skillLoadout.noviceSkills;
  const classSkills = skillLoadout.classSkills;
  const specialtySkills = skillLoadout.specialtySkills ?? [];
  // Especialidades de classe (T3+) entram no mesmo bucket de classSkills:
  // são habilidades únicas da classe e devem ser equipáveis no loadout.
  const allClassSkills = useMemo(
    () => [...classSkills, ...specialtySkills],
    [classSkills, specialtySkills],
  );
  const unlockedSkills = useMemo(
    () => [...noviceSkills, ...allClassSkills].filter((s) => s.unlocked),
    [noviceSkills, allClassSkills],
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
          tier: skill.tier,
          mpCost: skill.mpCost,
          effectType: skill.effectType,
          effectLabel: skill.effectLabel,
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
      // Guard: respeitar cooldown de 1h entre refeições
      if (lastMealAt && Date.now() - lastMealAt < MEAL_COOLDOWN_MS) {
        const minLeft = Math.ceil((MEAL_COOLDOWN_MS - (Date.now() - lastMealAt)) / 60000);
        throw new Error(`Aguarde ${minLeft} min para a próxima refeição (mínimo 1h entre refeições).`);
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
  const xpProgress = getLevelProgress(profile?.total_xp || 0);

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

        {/* ── Hero Card de Perfil ─────────────────────────────────── */}
        <div data-tour="profile-hero" className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-muted/30">
          {/* Fundo decorativo */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />

          <div className="relative p-5 flex items-start justify-between gap-4">
            {/* Avatar inicial + info */}
            <div className="flex items-center gap-4">
              {/* Avatar circular com inicial */}
              <div className="relative shrink-0">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/20 border border-primary/25 flex items-center justify-center">
                  <span className="font-display font-bold text-2xl text-primary">
                    {(profile?.display_name || user?.email || 'A').charAt(0).toUpperCase()}
                  </span>
                </div>
                {/* Badge de nível */}
                <div className="absolute -bottom-1.5 -right-1.5 h-6 min-w-6 px-1.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-bold border-2 border-background">
                  {profile?.level || 1}
                </div>
              </div>

              {/* Nome + classe */}
              <div className="min-w-0">
                {editingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      maxLength={30}
                      className="bg-muted border border-border rounded-lg px-2.5 py-1.5 text-sm text-foreground w-40 sm:w-52 focus:outline-none focus:border-primary/50"
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
                      className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setEditingName(false)} className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground transition-colors">
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h1 className="font-display font-bold text-lg text-foreground truncate">
                      {profile?.display_name || t('app.profile.defaultAdventurerName')}
                    </h1>
                    <button
                      onClick={() => { setNewName(profile?.display_name || ""); setEditingName(true); }}
                      className="p-1 rounded-md hover:bg-muted/60 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                      title={t('app.profile.editNameTooltip')}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Classe + XP */}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 border border-accent/25 text-[11px] font-semibold text-accent-foreground/80">
                    <Swords className="w-3 h-3" />
                    {(classes as any[])?.find((c: any) => c.id === (profile as any)?.current_class_id)?.name || 'Aprendiz'}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {xpProgress.currentLevelXp.toLocaleString()} / {xpProgress.xpForNextLevel.toLocaleString()} XP
                  </span>
                </div>

                {/* Barra de XP */}
                <div className="mt-2 w-48 sm:w-64 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-amber-400 transition-all duration-700"
                    style={{ width: `${xpProgress.progressPercent}%` }}
                  />
                </div>

                <ActiveTalentsBadge compact className="mt-2" />
              </div>
            </div>

            {/* Stats rápidos (ouro) + botão de configurações */}
            <div className="flex flex-col items-end gap-2 shrink-0">
              <button
                data-tour="profile-settings"
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-xl border transition-all ${showSettings ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-card border-border hover:border-primary/40 text-muted-foreground'}`}
              >
                <Settings className="w-4 h-4" />
              </button>
              <div data-tour="profile-gold" className="flex items-center gap-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-1">
                <Coins className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                <span className="text-sm font-bold text-yellow-400">{currentGold.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────── */}
        <div data-tour="profile-tabs" className="flex gap-0 border-b border-border overflow-x-auto scrollbar-none">
          {[
            { id: "perfil",      label: t("app.profile.tabPerfil"),      icon: Heart },
            { id: "habilidades", label: t("app.profile.tabHabilidades"), icon: Swords },
            { id: "inventario",  label: t("app.profile.tabInventario"),  icon: Shield },
            { id: "conquistas",  label: t("app.profile.tabConquistas"),  icon: Trophy, badge: userAchievements.filter((ua: any) => !ua.claimed_at).length || undefined },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`relative flex items-center gap-1.5 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5 shrink-0" />
              {tab.label}
              {tab.badge ? (
                <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* ── Painel de Configurações ────────────────────────────── */}
        {showSettings && (
          <div className="rounded-xl border border-border bg-card overflow-hidden animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/20">
              <Settings className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">{t('app.profile.settingsTitle')}</h3>
            </div>
            <div className="p-4 space-y-4">
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
            <div className="p-4 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            
            <div className="p-4 pt-0 space-y-4">
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
            <div data-tour="profile-vitals" className="rpg-card p-4 space-y-3.5">
              <h3 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mb-1">Status Vital</h3>

              {/* HP */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-xs font-bold text-red-400">HP</span>
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">{currentHp}/{maxHp} <span className="text-muted-foreground/50">({hpPercent}%)</span></span>
                </div>
                <div className="rpg-stat-bar h-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-red-700 to-red-400 transition-all duration-700" style={{ width: `${hpPercent}%` }} />
                </div>
              </div>

              {/* MP */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs font-bold text-blue-400">MP</span>
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground">{currentMp}/{maxMp} <span className="text-muted-foreground/50">({mpPercent}%)</span></span>
                </div>
                <div className="rpg-stat-bar h-2">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-700 to-blue-400 transition-all duration-700" style={{ width: `${mpPercent}%` }} />
                </div>
              </div>

              {/* Fadiga */}
              <div className="flex items-center justify-between pt-0.5">
                <div className="flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-xs font-bold text-orange-400">{t('app.profile.fatigueLabel')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{fatigue}</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted/50 ${fatigueStatus.className}`}>{fatigueStatus.label}</span>
                </div>
              </div>

              {penaltyMessages.map((msg, i) => (
                <p key={i} className="text-xs text-red-400 flex items-center gap-1">{msg}</p>
              ))}
            </div>

            {/* Hunger & Thirst */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rpg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UtensilsCrossed className="w-4 h-4 text-orange-400" />
                    <h3 className="text-sm font-bold text-foreground">{t('app.profile.hungerTitle')}</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">{t('app.profile.hungerGoal', { count: mealsTarget })}</span>
                </div>
                <div className="flex items-center gap-2">
                  {Array.from({ length: mealsTarget }).map((_, i) => (
                    <div key={i} className={`flex-1 h-8 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${i < mealsToday ? "bg-orange-500/20 border-orange-500/40 text-orange-400" : "bg-muted/20 border-border/50 text-muted-foreground/30"}`}>
                      {i < mealsToday ? "🍖" : `${i + 1}`}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t('app.profile.mealsCountText', { current: mealsToday, target: mealsTarget })}</span>
                  <button
                    onClick={() => logMeal.mutate()}
                    disabled={mealsToday >= mealsTarget || logMeal.isPending || mealCooldownActive}
                    title={mealCooldownActive ? `Aguarde ${mealCooldownMinLeft} min para a próxima refeição` : undefined}
                    className={`flex items-center gap-1 px-3 py-1.5 bg-orange-500/15 text-orange-400 border border-orange-500/25 rounded-lg text-xs font-medium hover:bg-orange-500/25 transition-colors ${mealsToday >= mealsTarget || logMeal.isPending || mealCooldownActive ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    {logMeal.isPending ? (
                      <span className="animate-spin mr-1 w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full"></span>
                    ) : <Plus className="w-3 h-3" />} {t('app.profile.mealButton')}
                  </button>
                </div>
                {mealCooldownActive && (
                  <p className="text-[10px] text-amber-400">⏱️ Próxima refeição em {mealCooldownMinLeft} min (mínimo 1h entre refeições).</p>
                )}
                {mealsToday < mealHalf && (
                  <p className="text-[10px] text-red-400">{t('app.profile.eatMinimumWarning', { count: mealHalf })}</p>
                )}
              </div>

              <div className="rpg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-cyan-400" />
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
            <div className="rpg-card p-4">
              <BodyEvolutionSection />
            </div>
          </div>
        )}

        {/* ======== ABA: HABILIDADES ======== */}
        {activeTab === "habilidades" && (
          <div className="space-y-5">

            {/* ── Cabeçalho com status de combate ──────────────────── */}
            <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-purple-500/5 p-5">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent pointer-events-none" />
              <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <h3 className="text-lg font-display font-bold text-foreground">{t('app.profile.tacticalSkillsTitle')}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-lg">
                    {t('app.profile.tacticalSkillsDesc')}
                  </p>
                </div>
                {/* Totalizador de habilidades */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-center px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-2xl font-bold text-emerald-400">{unlockedSkills.length}</p>
                    <p className="text-[10px] text-emerald-300/70 uppercase tracking-wide">desbloqueadas</p>
                  </div>
                  <div className="text-center px-4 py-2 rounded-xl bg-muted/30 border border-border">
                    <p className="text-2xl font-bold text-muted-foreground">{noviceSkills.length + allClassSkills.length}</p>
                    <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">total</p>
                  </div>
                </div>
              </div>

              {/* Barra de progresso de desbloqueio */}
              <div className="relative mt-4">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Progresso de habilidades</span>
                  <span>{Math.round((unlockedSkills.length / Math.max(1, noviceSkills.length + allClassSkills.length)) * 100)}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-primary transition-all duration-700"
                    style={{ width: `${Math.round((unlockedSkills.length / Math.max(1, noviceSkills.length + allClassSkills.length)) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* ── Status em combate ────────────────────────────────── */}
            <div className="rpg-card p-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Sword className="w-4 h-4 text-primary" />
                <h4 className="text-sm font-bold text-foreground">Status em Combate</h4>
              </div>
              <HeroStatusBar />
              <div className="flex flex-wrap gap-2 pt-1">
                <div className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-muted/30 border border-border">
                  <span className="font-semibold text-foreground">Classe base:</span>
                  <span className="text-primary font-bold capitalize">{starterClass}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-muted/30 border border-border">
                  <span className="font-semibold text-foreground">Arma inicial:</span>
                  <span className="text-amber-400 font-bold">{starterItem}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300">
                  🔮 {t('app.profile.magicWeakNote')}
                </div>
              </div>
            </div>

            {/* ── Loadout de combate ───────────────────────────────── */}
            <div className="rpg-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Swords className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-bold text-foreground">{t('app.profile.combatLoadoutTitle')}</h4>
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                  selectedCombatSkills.length === MAX_COMBAT_SKILLS
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-muted/30 border-border text-muted-foreground'
                }`}>
                  {selectedCombatSkills.length}/{MAX_COMBAT_SKILLS}
                </span>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">{t('app.profile.combatLoadoutDesc', { max: MAX_COMBAT_SKILLS })}</p>

              {/* Slots do deck */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Array.from({ length: MAX_COMBAT_SKILLS }).map((_, i) => {
                  const skill = selectedCombatSkills[i] as any;
                  return skill ? (
                    <div
                      key={skill.id}
                      className="relative group rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center space-y-1 cursor-pointer hover:border-emerald-500/60 transition-colors"
                      onClick={() => toggleCombatSkill(skill.id)}
                      title="Clique para remover"
                    >
                      <div className="text-2xl">⚔️</div>
                      <p className="text-[11px] font-bold text-emerald-300 leading-tight line-clamp-2">{skill.name}</p>
                      <p className="text-[9px] text-emerald-400/60">{skill.archetype}</p>
                      <span className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <XIcon className="w-3 h-3 text-emerald-400/60" />
                      </span>
                    </div>
                  ) : (
                    <div
                      key={`empty-${i}`}
                      className="rounded-xl border-2 border-dashed border-border/40 bg-muted/10 p-3 flex flex-col items-center justify-center gap-1 min-h-[80px]"
                    >
                      <Plus className="w-4 h-4 text-border/60" />
                      <p className="text-[10px] text-muted-foreground/50">Slot {i + 1}</p>
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => saveCombatLoadout.mutate(selectedCombatSkillIds)}
                disabled={saveCombatLoadout.isPending}
                className="w-full rounded-xl bg-primary/90 hover:bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saveCombatLoadout.isPending ? (
                  <><Sparkles className="w-4 h-4 animate-spin" /> {t('app.profile.savingLoadout')}</>
                ) : (
                  <><Save className="w-4 h-4" /> {t('app.profile.saveLoadoutButton')}</>
                )}
              </button>
            </div>

            {/* ── Kit do Novato ────────────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <div className="flex items-center gap-2">
                  <Scroll className="w-4 h-4 text-amber-400" />
                  <h4 className="text-sm font-bold text-foreground">{t('app.profile.noviceKitSection')}</h4>
                </div>
                <div className="flex-1 h-px bg-border/50" />
                <span className="text-[10px] text-amber-400/70 uppercase tracking-wide">universal</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {noviceSkills.map((skill) => {
                  const mpCost = Math.max(2, Math.min(16, Math.ceil((skill.power || 0) / 15)));
                  const inLoadout = selectedCombatSkillIds.includes(skill.id);
                  return (
                    <div
                      key={skill.id}
                      className={`relative rounded-xl border p-4 space-y-3 transition-all ${
                        skill.unlocked
                          ? "bg-gradient-to-br from-emerald-500/8 via-card to-card border-emerald-500/25 shadow-sm"
                          : "bg-muted/15 border-border/50 opacity-70"
                      }`}
                    >
                      {/* Badge de status */}
                      <div className="absolute top-3 right-3">
                        {skill.unlocked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-semibold">
                            <CheckCircle className="w-2.5 h-2.5" /> {t('app.profile.skillActive')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted/40 border border-border text-muted-foreground">
                            <Lock className="w-2.5 h-2.5" /> Nv. {skill.unlockLevel}
                          </span>
                        )}
                      </div>

                      <div className="pr-20">
                        <p className="font-display font-bold text-foreground leading-tight">{skill.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{skill.archetype}</p>
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed">{skill.description}</p>

                      {skill.requiredItem && (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-400/80">
                          <Sword className="w-3 h-3 shrink-0" />
                          <span>{t('app.profile.skillRequiredItem', { item: skill.requiredItem })}</span>
                        </div>
                      )}

                      {/* Stats em linha */}
                      <div className="flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 font-semibold">
                          ⚔️ {skill.power}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-semibold">
                          💧 {mpCost} MP
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 font-semibold">
                          <Clock className="w-2.5 h-2.5" /> {skill.cooldown}t
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-300 font-semibold">
                          📊 {skill.basedOn.join("+")}
                        </span>
                      </div>

                      {skill.unlocked && (
                        <button
                          onClick={() => toggleCombatSkill(skill.id)}
                          className={`w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                            inLoadout
                              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-300'
                              : selectedCombatSkills.length >= MAX_COMBAT_SKILLS
                              ? 'bg-muted/20 border border-border/50 text-muted-foreground/50 cursor-not-allowed'
                              : 'bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20'
                          }`}
                          disabled={!inLoadout && selectedCombatSkills.length >= MAX_COMBAT_SKILLS}
                        >
                          {inLoadout ? `✕ ${t('app.profile.removeFromLoadout')}` : selectedCombatSkills.length >= MAX_COMBAT_SKILLS ? 'Deck cheio' : `+ ${t('app.profile.addToLoadout')}`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Habilidades da Classe ────────────────────────────── */}
            {allClassSkills.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-primary" />
                    <h4 className="text-sm font-bold text-foreground">{t('app.profile.uniqueClassSkillsSection')}</h4>
                  </div>
                  <div className="flex-1 h-px bg-border/50" />
                  <span className="text-[10px] text-primary/70 uppercase tracking-wide capitalize">{currentClassName}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {allClassSkills.map((skill) => {
                    const mpCost = Math.max(2, Math.min(16, Math.ceil((skill.power || 0) / 15)));
                    const inLoadout = selectedCombatSkillIds.includes(skill.id);
                    return (
                      <div
                        key={skill.id}
                        className={`relative rounded-xl border p-4 space-y-3 transition-all ${
                          skill.unlocked
                            ? "bg-gradient-to-br from-primary/8 via-card to-purple-500/5 border-primary/25 shadow-sm"
                            : "bg-muted/15 border-border/50 opacity-70"
                        }`}
                      >
                        <div className="absolute top-3 right-3">
                          {skill.unlocked ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/20 border border-primary/30 text-primary font-semibold">
                              <CheckCircle className="w-2.5 h-2.5" /> Ativa
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted/40 border border-border text-muted-foreground">
                              <Lock className="w-2.5 h-2.5" /> Nv. {skill.unlockLevel}
                            </span>
                          )}
                        </div>

                        <div className="pr-20">
                          <p className="font-display font-bold text-foreground leading-tight">{skill.name}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{skill.archetype}</p>
                        </div>

                        <p className="text-xs text-muted-foreground leading-relaxed">{skill.description}</p>

                        {(skill as any).fantasy && (
                          <p className="text-[11px] text-primary/50 italic">"{(skill as any).fantasy}"</p>
                        )}

                        <div className="flex flex-wrap gap-1.5">
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 text-red-300 font-semibold">
                            ⚔️ {skill.power}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-semibold">
                            💧 {mpCost} MP
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 font-semibold">
                            <Clock className="w-2.5 h-2.5" /> {skill.cooldown}t
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-300 font-semibold">
                            📊 {skill.basedOn.join("+")}
                          </span>
                        </div>

                        {skill.unlocked && (
                          <button
                            onClick={() => toggleCombatSkill(skill.id)}
                            className={`w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                              inLoadout
                                ? 'bg-primary/15 border border-primary/30 text-primary hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-300'
                                : selectedCombatSkills.length >= MAX_COMBAT_SKILLS
                                ? 'bg-muted/20 border border-border/50 text-muted-foreground/50 cursor-not-allowed'
                                : 'bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20'
                            }`}
                            disabled={!inLoadout && selectedCombatSkills.length >= MAX_COMBAT_SKILLS}
                          >
                            {inLoadout ? `✕ ${t('app.profile.removeFromLoadout')}` : selectedCombatSkills.length >= MAX_COMBAT_SKILLS ? 'Deck cheio' : `+ ${t('app.profile.addToLoadout')}`}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Bosses (ficha tática) ─────────────────────────────── */}
            {(bosses || []).length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Skull className="w-4 h-4 text-destructive" />
                  <h4 className="text-sm font-bold text-foreground">{t('app.profile.bossStatusTitle')}</h4>
                  <div className="flex-1 h-px bg-border/50" />
                  <span className="text-[10px] text-destructive/60 uppercase tracking-wide">ficha tática</span>
                </div>
                <p className="text-xs text-muted-foreground px-1">{t('app.profile.bossStatusDesc')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(bosses || []).map((boss: any) => {
                    const b = getBossCombatStats(boss);
                    const threatColor = b.threat >= 8 ? 'text-red-400 border-red-500/30 bg-red-500/10'
                      : b.threat >= 5 ? 'text-orange-400 border-orange-500/30 bg-orange-500/10'
                      : 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
                    return (
                      <div key={boss.id} className="rounded-xl border border-destructive/15 bg-gradient-to-br from-destructive/5 via-card to-card p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{boss.icon}</span>
                            <div>
                              <p className="font-display font-bold text-foreground leading-tight">{boss.name}</p>
                              {boss.element && (
                                <p className="text-[10px] text-muted-foreground capitalize">{boss.element}</p>
                              )}
                            </div>
                          </div>
                          <span className={`text-[10px] px-2 py-1 rounded-full border font-bold ${threatColor}`}>
                            ☠ {t('app.profile.bossThreat', { level: b.threat })}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { label: 'ATK', value: b.atk, color: 'text-red-400' },
                            { label: 'MATK', value: b.matk, color: 'text-purple-400' },
                            { label: 'DEF', value: b.def, color: 'text-blue-400' },
                            { label: 'AGI', value: b.agi, color: 'text-green-400' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="text-center rounded-lg bg-muted/20 border border-border/50 py-2">
                              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
                              <p className={`text-sm font-bold ${color}`}>{value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2">
                          <span className="text-[10px] text-muted-foreground">{t('app.profile.bossTacticalWeakness')}</span>
                          <span className="text-xs font-bold text-primary ml-auto">{b.weakness}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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
                const claimed = !!unlocked?.claimed_at;
                return (
                  <div
                    key={ach.id}
                    className={`rounded-xl border p-4 flex items-start gap-3 transition-all ${
                      unlocked && !claimed
                        ? 'border-amber-400/60 bg-amber-500/10 shadow-md shadow-amber-500/10'
                        : unlocked
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
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-xp/20 text-primary border border-primary/20 font-bold">
                          +{ach.xp_reward} XP
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 font-bold">
                          +{ach.gold_reward} 🪙
                        </span>
                        {claimed && (
                          <span className="text-[10px] text-emerald-400 font-semibold">✓ Resgatada</span>
                        )}
                      </div>
                      {unlocked && !claimed && (
                        <button
                          onClick={() => claimAchievement.mutate(unlocked)}
                          disabled={claimAchievement.isPending}
                          className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-lg border border-amber-400/50 bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                        >
                          🎁 Pegar Recompensa!
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <GuidedTour tourKey="profile" steps={PROFILE_TOUR_STEPS} />
    </AppLayout>
  );
}
