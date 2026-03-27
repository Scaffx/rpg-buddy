import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProfile, useClasses, useSelectClass } from '@/hooks/useProfile';
import AppLayout from '@/components/AppLayout';
import { Loader2, Lock, Check, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const columnLabels = ['Início', 'Classe 1', 'Classe 2', 'Transclasse', 'Classe 3', 'Classe 4'];

export default function ClassesPage() {
  const { data: profile, isLoading: pLoading } = useProfile();
  const { data: classes, isLoading: cLoading } = useClasses();
  const selectClass = useSelectClass();
  const { toast } = useToast();
  const [selecting, setSelecting] = useState<string | null>(null);

  const columns = useMemo(() => {
    if (!classes) return [];
    return columnLabels.map((label, i) => ({
      label,
      index: i + 1,
      classes: classes.filter((c: any) => c.column_index === i + 1),
    }));
  }, [classes]);

  const userLevel = profile?.level || 1;

  const handleSelect = async (classId: string, className: string) => {
    setSelecting(classId);
    try {
      await selectClass.mutateAsync(classId);
      toast({ title: `🎉 Classe selecionada: ${className}!` });
    } catch {
      toast({ title: 'Erro ao selecionar classe', variant: 'destructive' });
    } finally {
      setSelecting(null);
    }
  };

  if (pLoading || cLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Swords className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-display font-bold text-primary text-glow">
            Árvore de Classes
          </h1>
        </div>

        <p className="text-sm text-muted-foreground">
          Seu nível atual: <span className="text-primary font-bold">{userLevel}</span>.
          Evolua para desbloquear novas classes!
        </p>

        {/* Class tree - horizontal scroll on mobile */}
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-[900px]">
            {columns.map((col, colIdx) => (
              <div key={col.index} className="flex-1 min-w-[140px]">
                <div className="text-center mb-3">
                  <span className="rpg-badge text-[10px]">{col.label}</span>
                </div>
                <div className="space-y-2">
                  {col.classes.map((cls: any, i: number) => {
                    const unlocked = userLevel >= cls.level_min;
                    const isSelected = profile?.current_class_id === cls.id;

                    return (
                      <motion.div
                        key={cls.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: colIdx * 0.05 + i * 0.03 }}
                        className={`rpg-card text-center space-y-2 ${
                          !unlocked ? 'opacity-40' : ''
                        } ${isSelected ? 'border-primary/50' : ''}`}
                        style={isSelected ? { boxShadow: 'var(--glow-gold)' } : {}}
                      >
                        <span className="text-2xl block">{cls.icon}</span>
                        <p className="text-xs font-display font-bold text-foreground leading-tight">
                          {cls.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          {cls.description}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Nv. {cls.level_min}–{cls.level_max}
                        </p>

                        {isSelected ? (
                          <div className="flex items-center justify-center gap-1 text-[10px] text-primary font-bold">
                            <Check className="w-3 h-3" /> Selecionada
                          </div>
                        ) : !unlocked ? (
                          <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                            <Lock className="w-3 h-3" /> Bloqueado
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[10px] h-6 px-2 border-primary/30 text-primary hover:bg-primary/10"
                            onClick={() => handleSelect(cls.id, cls.name)}
                            disabled={selecting === cls.id}
                          >
                            {selecting === cls.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              'Selecionar'
                            )}
                          </Button>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
