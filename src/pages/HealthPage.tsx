import { useState } from 'react';
import { motion } from 'framer-motion';
import { useDailyTracking } from '@/hooks/useDailyTracking';
import { useUpdateTracking } from '@/hooks/useDailyTracking';
import { useProfile, useAwardHealthXP } from '@/hooks/useProfile';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Droplets, Apple, Award } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function HealthPage() {
  const { data: tracking, isLoading } = useDailyTracking();
  const { data: profile } = useProfile();
  const updateTracking = useUpdateTracking();
  const awardHealthXP = useAwardHealthXP();
  const { toast } = useToast();

  const [waterInput, setWaterInput] = useState('');
  const [mealsInput, setMealsInput] = useState('');
  const [xpAwarded, setXpAwarded] = useState(false);

  // Metas diárias
  const WATER_GOAL = 2000; // ml
  const MEALS_GOAL = 3; // refeições

  // Verificar se as metas foram completas
  const waterCompleted = tracking && tracking.water_ml >= WATER_GOAL;
  const mealsCompleted = tracking && tracking.meals_count >= MEALS_GOAL;
  const bothCompleted = waterCompleted && mealsCompleted;

  const addWater = async () => {
    const amount = parseInt(waterInput) || 0;
    if (amount <= 0) {
      toast({ title: 'Erro', description: 'Digite um valor válido', variant: 'destructive' });
      return;
    }

    try {
      const newWater = (tracking?.water_ml || 0) + amount;
      const newMeals = tracking?.meals_count || 0;

      await updateTracking.mutateAsync({
        water_ml: newWater,
        meals_count: newMeals,
      });

      setWaterInput('');
      toast({ title: '💧 Água adicionada!', description: `+${amount} ml` });

      // Verificar se completou ambas as metas
      const newWaterCompleted = newWater >= WATER_GOAL;
      const newMealsCompleted = newMeals >= MEALS_GOAL;
      
      if (!xpAwarded && newWaterCompleted && newMealsCompleted) {
        await checkAndAwardXP();
      }
    } catch {
      toast({ title: 'Erro', variant: 'destructive' });
    }
  };

  const addMeal = async () => {
    try {
      const newWater = tracking?.water_ml || 0;
      const newMeals = (tracking?.meals_count || 0) + 1;

      await updateTracking.mutateAsync({
        water_ml: newWater,
        meals_count: newMeals,
      });

      setMealsInput('');
      toast({ title: '🍽️ Refeição registrada!' });

      // Verificar se completou ambas as metas
      const newWaterCompleted = newWater >= WATER_GOAL;
      const newMealsCompleted = newMeals >= MEALS_GOAL;
      
      if (!xpAwarded && newWaterCompleted && newMealsCompleted) {
        await checkAndAwardXP();
      }
    } catch {
      toast({ title: 'Erro', variant: 'destructive' });
    }
  };

  const checkAndAwardXP = async () => {
    // ✅ Lógica para dar 50 XP ao completar ambas as metas
    try {
      await awardHealthXP.mutateAsync();
      setXpAwarded(true);
      toast({
        title: '🎉 Desafio Completado!',
        description: '+ 50 XP por manter a saúde em dia!',
      });
    } catch (error: any) {
      if (error.message.includes('já ganhou')) {
        setXpAwarded(true);
        toast({
          title: '⚠️ Bônus já coletado',
          description: 'Volte amanhã para ganhar mais XP!',
        });
      } else {
        toast({
          title: 'Erro ao conceder XP',
          description: error.message,
          variant: 'destructive',
        });
      }
    }
  };

  // Calcular porcentagem
  const waterPercentage = tracking ? Math.min((tracking.water_ml / WATER_GOAL) * 100, 100) : 0;
  const mealsPercentage = tracking ? Math.min((tracking.meals_count / MEALS_GOAL) * 100, 100) : 0;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Title */}
        <div className="flex items-center gap-2">
          <Award className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-display font-bold text-primary text-glow">Saúde</h1>
        </div>

        {/* Progress Overview */}
        {bothCompleted && xpAwarded && (
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

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Água */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rpg-card-glow border-blue-500/30 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Droplets className="w-5 h-5 text-blue-400" />
                <h3 className="font-display font-bold text-foreground">Hidratação</h3>
              </div>
              <span className={`text-sm font-bold ${waterCompleted ? 'text-success' : 'text-muted-foreground'}`}>
                {tracking?.water_ml || 0} / {WATER_GOAL} ml
              </span>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="h-3 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${waterPercentage}%` }}
                  transition={{ duration: 0.5 }}
                  className="h-full bg-gradient-to-r from-blue-400 to-cyan-400 rounded-full"
                />
              </div>
              <p className="text-xs text-muted-foreground text-right">{Math.round(waterPercentage)}%</p>
            </div>

            {/* Input */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Adicionar água (ml)</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="250"
                  value={waterInput}
                  onChange={(e) => setWaterInput(e.target.value)}
                  className="bg-secondary border-border"
                  disabled={updateTracking.isPending}
                />
                <Button
                  onClick={addWater}
                  disabled={updateTracking.isPending}
                  className="bg-blue-600 hover:bg-blue-700 w-20"
                  size="sm"
                >
                  {updateTracking.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Adicionar'}
                </Button>
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex gap-2 pt-2">
              {[250, 500, 750].map((amount) => (
                <Button
                  key={amount}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setWaterInput(amount.toString());
                  }}
                  className="text-xs"
                >
                  +{amount}ml
                </Button>
              ))}
            </div>

            {waterCompleted && (
              <div className="p-2 bg-success/10 border border-success/30 rounded text-center">
                <p className="text-xs text-success font-semibold">✅ Meta de hidratação completada!</p>
              </div>
            )}
          </motion.div>

          {/* Comida */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rpg-card-glow border-orange-500/30 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Apple className="w-5 h-5 text-orange-400" />
                <h3 className="font-display font-bold text-foreground">Alimentação</h3>
              </div>
              <span className={`text-sm font-bold ${mealsCompleted ? 'text-success' : 'text-muted-foreground'}`}>
                {tracking?.meals_count || 0} / {MEALS_GOAL} refeições
              </span>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="h-3 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${mealsPercentage}%` }}
                  transition={{ duration: 0.5 }}
                  className="h-full bg-gradient-to-r from-orange-400 to-amber-400 rounded-full"
                />
              </div>
              <p className="text-xs text-muted-foreground text-right">{Math.round(mealsPercentage)}%</p>
            </div>

            {/* Button */}
            <div>
              <Button
                onClick={addMeal}
                disabled={updateTracking.isPending}
                className="w-full bg-orange-600 hover:bg-orange-700"
                size="sm"
              >
                {updateTracking.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : '🍽️'}
                Registrar Refeição
              </Button>
            </div>

            {/* Quick description */}
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Clique para registrar cada refeição:</p>
              <p>☀️ Café da manhã</p>
              <p>🌤️ Almoço</p>
              <p>🌙 Jantar</p>
            </div>

            {mealsCompleted && (
              <div className="p-2 bg-success/10 border border-success/30 rounded text-center">
                <p className="text-xs text-success font-semibold">✅ Meta de alimentação completada!</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Tips */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rpg-card space-y-2"
        >
          <h3 className="font-bold text-foreground">💡 Dicas de Saúde</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Beba cerca de 2 litros de água por dia</li>
            <li>Faça 3 refeições principais</li>
            <li>Mantenha uma rotina regular</li>
            <li>Combine com exercícios para mais XP!</li>
          </ul>
        </motion.div>
      </div>
    </AppLayout>
  );
}
