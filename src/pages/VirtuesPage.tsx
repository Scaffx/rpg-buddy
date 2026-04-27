import { useNavigate } from 'react-router-dom';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Sparkles } from 'lucide-react';

export default function VirtuesPage() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto py-12 px-4">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6 gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </Button>

        <div className="rpg-card text-center py-16 px-6 space-y-6">
          <div className="text-7xl animate-bounce">😊</div>

          <div className="flex items-center justify-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            <h1 className="text-3xl font-display font-bold text-primary text-glow">
              Virtudes
            </h1>
            <Sparkles className="w-6 h-6 text-primary" />
          </div>

          <p className="text-xl text-foreground font-semibold">
            Em breve, esta página estará funcionando!
          </p>

          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Estamos preparando algo especial para você cultivar e acompanhar suas virtudes.
            Volte em breve para conferir as novidades!
          </p>

          <Button
            onClick={() => navigate('/')}
            variant="outline"
            className="mt-4"
          >
            Voltar ao Painel
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
