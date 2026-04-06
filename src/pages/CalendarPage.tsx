import { useMemo } from 'react';
import { useMissions } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';
import AppLayout from '@/components/AppLayout';
import { Calendar } from '@/components/ui/calendar';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const DAYS_MAP = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function CalendarPage() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const { data: allMissions, isLoading } = useMissions();
  
  // Fetch completions for today's missions
  const { data: completions = [] } = useQuery({
    queryKey: ['mission_completions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('mission_daily_completions' as any)
        .select('mission_id, completion_date')
        .eq('user_id', user.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const completedDates = useMemo(() => {
    if (!completions) return [];
    return completions
      .map((c: any) => new Date(c.completion_date))
      .filter((d) => !isNaN(d.getTime()));
  }, [completions]);

  const missionsForDate = useMemo(() => {
    if (!allMissions || !selectedDate) return [];
    
    const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
    const dayIndex = selectedDate.getDay();
    const dayName = DAYS_MAP[dayIndex];
    
    // Get all missions that apply to this day of week
    const missionsOnThisDay = allMissions.filter((m: any) => {
      const days: string[] = m.days_of_week || [];
      // Diárias com dias específicos
      if (days.length > 0 && days.includes(dayName)) {
        return true;
      }
      return false;
    });

    // Add completion status from completions table
    return missionsOnThisDay.map((m: any) => {
      const isCompletedOnDate = completions.some((c: any) => 
        c.mission_id === m.id && c.completion_date === selectedDateStr
      );
      return {
        ...m,
        completedOnDate: isCompletedOnDate,
      };
    });
  }, [allMissions, selectedDate, completions]);

  const modifiers = {
    completed: completedDates,
  };

  const modifiersStyles = {
    completed: {
      backgroundColor: 'hsl(43 96% 56% / 0.2)',
      borderRadius: '50%',
      color: 'hsl(43 96% 56%)',
      fontWeight: 'bold' as const,
    },
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-display font-bold text-primary text-glow">
          📅 Calendário
        </h1>

        {isLoading ? (
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="rpg-card flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                locale={ptBR}
                modifiers={modifiers}
                modifiersStyles={modifiersStyles}
                className="pointer-events-auto"
              />
            </div>
            <div className="space-y-3">
              <h2 className="font-display font-semibold text-foreground">
                {selectedDate
                  ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR })
                  : 'Selecione um dia'}
              </h2>
              {missionsForDate.length > 0 ? (
                <div className="space-y-2">
                  {missionsForDate.map((m: any) => (
                    <div key={m.id} className="rpg-card">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-foreground flex-1">{m.title}</span>
                        {m.completedOnDate ? (
                          <span className="rpg-badge bg-green-500/20 text-green-400 border-green-500/30">✅ Feita</span>
                        ) : (
                          <span className="rpg-badge bg-yellow-500/20 text-yellow-400 border-yellow-500/30">⏳ Pendente</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground rpg-card py-4 text-center">Nenhuma missão neste dia.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
