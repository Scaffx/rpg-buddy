import { Moon } from 'lucide-react';
import { useBedtimeLock } from '@/hooks/useBedtimeLock';

/**
 * Modo descanso (opt-in, §7): quando ativo e no horário de dormir, mostra apenas
 * um banner calmo e NÃO bloqueia nenhuma página — o registro de missões/refeições
 * (e tudo mais) continua liberado. No máximo silencia a "vibe" de gamificação.
 * Renderizado uma única vez dentro do Router.
 */
export default function BedtimeGate() {
  const { restMode } = useBedtimeLock();
  if (!restMode) return null;

  return (
    <div className="fixed inset-x-0 bottom-3 z-[9998] flex justify-center px-3 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-950/85 backdrop-blur px-4 py-2 text-xs text-indigo-100 shadow-lg">
        <Moon className="w-4 h-4 text-indigo-300 shrink-0" />
        <span>Modo descanso ativo — hora de desacelerar. O app segue liberado; só silenciamos a gamificação. 🌙</span>
      </div>
    </div>
  );
}
