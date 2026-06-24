import { useLocation, useNavigate } from 'react-router-dom';
import { Moon, ScrollText, User } from 'lucide-react';
import { useBedtimeLock } from '@/hooks/useBedtimeLock';

// Rotas liberadas durante o modo descanso:
// - /missions: marcar missões principais
// - /profile: marcar refeições
const ALLOWED_EXACT = ['/missions', '/profile'];
// Rotas públicas / fluxo de conta nunca devem ser bloqueadas (evita trancar fora).
const ALLOWED_PREFIXES = ['/auth', '/reset-password', '/onboarding', '/landing', '/terms', '/privacy', '/refund'];

function isAllowed(pathname: string): boolean {
  if (ALLOWED_EXACT.includes(pathname)) return true;
  return ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/**
 * Quando o modo descanso está ativo (horário de dormir até acordar), bloqueia
 * todas as páginas com um overlay, exceto missões (marcar) e perfil (refeições).
 * Renderizado uma única vez dentro do Router.
 */
export default function BedtimeGate() {
  const { locked } = useBedtimeLock();
  const location = useLocation();
  const navigate = useNavigate();

  if (!locked) return null;
  if (isAllowed(location.pathname)) return null;

  return (
    <div
      className="fixed inset-0 z-[9998] flex flex-col items-center justify-center gap-6 p-6 text-center"
      style={{
        background:
          'radial-gradient(60% 50% at 50% 40%, oklch(0.24 0.08 268) 0%, transparent 60%), oklch(0.13 0.04 285 / 0.97)',
        color: 'oklch(0.94 0.018 92)',
        backdropFilter: 'blur(6px)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Modo descanso ativo"
    >
      <div className="flex flex-col items-center gap-2 max-w-md">
        <div className="w-16 h-16 rounded-full flex items-center justify-center border border-indigo-400/40 bg-indigo-500/10">
          <Moon className="w-8 h-8 text-indigo-300" />
        </div>
        <h2 className="text-2xl font-display font-bold text-indigo-200" style={{ fontFamily: "'Cinzel', serif" }}>
          Hora de descansar, herói
        </h2>
        <p className="text-sm text-muted-foreground">
          Você chegou ao seu horário de dormir. O app fica em modo descanso até o
          horário de acordar. Só as missões principais e o registro de refeições
          ficam liberados — o resto recomeça quando o sol nascer. 🌙
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
        <button
          onClick={() => navigate('/missions')}
          className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl border border-indigo-400/40 bg-indigo-500/15 text-indigo-100 font-semibold hover:bg-indigo-500/25 transition-colors"
        >
          <ScrollText className="w-5 h-5" /> Missões principais
        </button>
        <button
          onClick={() => navigate('/profile')}
          className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl border border-amber-400/40 bg-amber-500/10 text-amber-100 font-semibold hover:bg-amber-500/20 transition-colors"
        >
          <User className="w-5 h-5" /> Perfil / refeições
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        Quer mudar o horário? Ajuste em Perfil → Configurações (mínimo de 6h de descanso).
      </p>
    </div>
  );
}
