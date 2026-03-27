import { useMemo } from 'react';
import { useMissions } from '@/hooks/useProfile';
import AppLayout from '@/components/AppLayout';
import { Calendar } from '@/components/ui/calendar';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const { data: allMissions, isLoading } = useMissions();

  const completedDates = useMemo(() => {
    if (!allMissions) return [];
    return allMissions
      .filter((m) => m.completed && m.completed_at)
      .map((m) => new Date(m.completed_at!));
  }, [allMissions]);

  const missionsForDate = useMemo(() => {
    if (!allMissions || !selectedDate) return [];
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    return allMissions.filter((m) => {
      if (m.completed_at) {
        return format(new Date(m.completed_at), 'yyyy-MM-dd') === dateStr;
      }
      if (m.due_date) {
        return m.due_date === dateStr;
      }
      return format(new Date(m.created_at), 'yyyy-MM-dd') === dateStr;
    });
  }, [allMissions, selectedDate]);

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
                missionsForDate.map((m) => (
                  <div key={m.id} className="rpg-card">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-foreground">{m.title}</span>
                      {m.completed ? (
                        <span className="rpg-badge">✅ Completa</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Pendente</span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma atividade neste dia.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
