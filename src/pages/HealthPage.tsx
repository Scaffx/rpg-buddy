import { useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Upload, FileText, BarChart3, Heart, AlertCircle, Utensils, Droplets, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery } from '@tanstack/react-query';

export default function HealthPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  // Fetch last 30 days of meal logs
  const { data: mealHistory = [] } = useQuery({
    queryKey: ['meal_log_history', user?.id],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from('meal_log')
        .select('meal_date, meal_number, food_description')
        .eq('user_id', user!.id)
        .gte('meal_date', since.toLocaleDateString('en-CA'))
        .order('meal_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch last 30 days of water logs
  const { data: waterHistory = [] } = useQuery({
    queryKey: ['water_log_history', user?.id],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from('water_log')
        .select('log_date, amount_ml')
        .eq('user_id', user!.id)
        .gte('log_date', since.toLocaleDateString('en-CA'))
        .order('log_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // Fetch health stats (targets)
  const { data: healthStats } = useQuery({
    queryKey: ['health_stats_base', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_health_stats')
        .select('meals_target, water_target_ml, weight_kg')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const mealsTarget = healthStats?.meals_target || 3;
  const waterTargetMl = healthStats?.water_target_ml || Math.round((healthStats?.weight_kg || 70) * 35);

  // Compute meal compliance per day
  const mealStatsByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of mealHistory) {
      const d = row.meal_date as string;
      map[d] = (map[d] || 0) + 1;
    }
    return map;
  }, [mealHistory]);

  // Compute water totals per day
  const waterStatsByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of waterHistory) {
      const d = row.log_date as string;
      map[d] = (map[d] || 0) + Number(row.amount_ml || 0);
    }
    return map;
  }, [waterHistory]);

  const lowMealDays = Object.entries(mealStatsByDay).filter(
    ([, count]) => count < Math.ceil(mealsTarget * 0.5),
  );
  const lowWaterDays = Object.entries(waterStatsByDay).filter(
    ([, ml]) => ml < waterTargetMl * 0.5,
  );

  // Most common foods
  const topFoods = useMemo(() => {
    const freq: Record<string, number> = {};
    for (const row of mealHistory) {
      const desc = (row.food_description as string | null)?.trim();
      if (desc) freq[desc] = (freq[desc] || 0) + 1;
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [mealHistory]);

  const totalDaysTracked = Object.keys({ ...mealStatsByDay, ...waterStatsByDay }).length;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    try {
      const timestamp = Date.now();
      const fileName = `${user.id}/${timestamp}_${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('body-photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      toast.success(t('app.health.toast_upload_success'));
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error: any) {
      toast.error(t('app.health.toast_upload_error', { message: error.message }));
    } finally {
      setUploading(false);
    }
  };

  const analyzeWithAI = useMutation({
    mutationFn: async (recordId: string) => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      return {
        bloodPressure: '120/80',
        cholesterol: 'Normal',
        glucose: '95 mg/dL',
        healthScore: 85,
        recommendations: [
          'Mantenha a ingestão de água adequada',
          'Pratique exercícios regularmente',
          'Reduza o consumo de sal',
        ],
      };
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      toast.success(t('app.health.toast_analysis_success'));
    },
    onError: () => {
      toast.error(t('app.health.toast_analysis_error'));
    },
  });

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-2">
          <Heart className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-display font-bold text-primary text-glow">{t('app.health.page_title')}</h1>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rpg-card border-blue-500/30 flex items-start gap-3 p-4"
        >
          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">{t('app.health.notice_title')}</p>
            <p>{t('app.health.notice_body')}</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rpg-card-glow border-emerald-500/30 space-y-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-emerald-400" />
            <h3 className="font-display font-bold text-foreground">{t('app.health.section_medical_exams')}</h3>
          </div>

          <div 
            className="border-2 border-dashed border-emerald-500/30 rounded-xl p-8 text-center space-y-3 hover:border-emerald-500/50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
            <div className="flex justify-center">
              {uploading ? (
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              ) : (
                <Upload className="w-8 h-8 text-emerald-400" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {uploading ? t('app.health.upload_uploading') : t('app.health.upload_idle')}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t('app.health.upload_hint')}
              </p>
            </div>
          </div>
        </motion.div>

        {analysisResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rpg-card-glow bg-gradient-to-br from-primary/10 to-emerald-500/10 border-emerald-500/30 space-y-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
              <h3 className="font-display font-bold text-foreground">{t('app.health.section_analysis_result')}</h3>
            </div>

            <div className="text-center p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
              <p className="text-sm text-muted-foreground mb-2">{t('app.health.label_health_score')}</p>
              <div className="text-4xl font-bold text-emerald-400 mb-2">{analysisResult.healthScore}%</div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
                  style={{ width: `${analysisResult.healthScore}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-muted/30 rounded-lg border border-border/50 text-center">
                <p className="text-xs text-muted-foreground mb-1">{t('app.health.label_blood_pressure')}</p>
                <p className="text-lg font-bold text-blue-400">{analysisResult.bloodPressure}</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg border border-border/50 text-center">
                <p className="text-xs text-muted-foreground mb-1">{t('app.health.label_cholesterol')}</p>
                <p className="text-lg font-bold text-yellow-400">{analysisResult.cholesterol}</p>
              </div>
              <div className="p-3 bg-muted/30 rounded-lg border border-border/50 text-center">
                <p className="text-xs text-muted-foreground mb-1">{t('app.health.label_glucose')}</p>
                <p className="text-lg font-bold text-orange-400">{analysisResult.glucose}</p>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground">{t('app.health.label_recommendations')}</p>
              <ul className="space-y-1">
                {analysisResult.recommendations.map((rec: string, idx: number) => (
                  <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-emerald-400 mt-0.5">✓</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rpg-card space-y-2"
        >
          <h3 className="font-bold text-foreground">{t('app.health.section_tips')}</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>{t('app.health.tip_1')}</li>
            <li>{t('app.health.tip_2')}</li>
            <li>{t('app.health.tip_3')}</li>
            <li>{t('app.health.tip_4')}</li>
            <li>{t('app.health.tip_5')}</li>
          </ul>
        </motion.div>

        {/* Health log stats (last 30 days) */}
        {totalDaysTracked > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rpg-card space-y-5"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-foreground">Histórico dos últimos 30 dias</h3>
              <span className="text-xs text-muted-foreground ml-auto">{totalDaysTracked} dias registrados</span>
            </div>

            {/* Meal compliance */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-orange-400" />
                <p className="text-sm font-semibold text-foreground">Refeições</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/30 border border-border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-orange-400">{lowMealDays.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">dias com &lt;50% das refeições</p>
                </div>
                <div className="bg-muted/30 border border-border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-400">
                    {Math.max(0, Object.keys(mealStatsByDay).length - lowMealDays.length)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">dias com boa alimentação</p>
                </div>
              </div>
              {lowMealDays.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {lowMealDays.slice(0, 8).map(([date, count]) => (
                    <span key={date} className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                      {new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ({count}/{mealsTarget})
                    </span>
                  ))}
                  {lowMealDays.length > 8 && (
                    <span className="text-[10px] text-muted-foreground">+{lowMealDays.length - 8} dias</span>
                  )}
                </div>
              )}
            </div>

            {/* Water compliance */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Droplets className="w-4 h-4 text-cyan-400" />
                <p className="text-sm font-semibold text-foreground">Hidratação</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/30 border border-border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-cyan-400 opacity-60">{lowWaterDays.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">dias com &lt;50% da hidratação</p>
                </div>
                <div className="bg-muted/30 border border-border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-400">
                    {Math.max(0, Object.keys(waterStatsByDay).length - lowWaterDays.length)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">dias bem hidratado</p>
                </div>
              </div>
              {lowWaterDays.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {lowWaterDays.slice(0, 8).map(([date, ml]) => (
                    <span key={date} className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 opacity-70">
                      {new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ({Math.round(ml / 1000 * 10) / 10}L/{Math.round(waterTargetMl / 1000 * 10) / 10}L)
                    </span>
                  ))}
                  {lowWaterDays.length > 8 && (
                    <span className="text-[10px] text-muted-foreground">+{lowWaterDays.length - 8} dias</span>
                  )}
                </div>
              )}
            </div>

            {/* Most common foods */}
            {topFoods.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-emerald-400" />
                  <p className="text-sm font-semibold text-foreground">Alimentos mais frequentes</p>
                </div>
                <div className="space-y-1">
                  {topFoods.map(([food, count], idx) => (
                    <div key={food} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4">{idx + 1}.</span>
                      <div className="flex-1 bg-muted/30 rounded-full overflow-hidden h-6 relative border border-border">
                        <div
                          className="h-full bg-emerald-500/30 rounded-full"
                          style={{ width: `${(count / (topFoods[0]?.[1] || 1)) * 100}%` }}
                        />
                        <span className="absolute inset-0 flex items-center px-2 text-[11px] text-foreground font-medium truncate">
                          {food}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground w-10 text-right">{count}×</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </AppLayout>
  );
}
