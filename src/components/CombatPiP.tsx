import { useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Maximize2, X, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useActiveCombat, useAbandonActiveCombat, activeCombatRoute } from '@/hooks/useActiveCombat';

/**
 * Janela flutuante do combate em andamento.
 *
 * O combate ocupava a tela inteira, então entrar numa masmorra significava
 * abandonar o resto do app. Aqui ele vira um painel de canto: dá para marcar
 * missões, abrir o perfil e continuar acompanhando a luta — e voltar para a
 * tela cheia quando quiser agir.
 *
 * Fica escondido quando o jogador já está na página do próprio combate: ali a
 * arena inteira está à vista e o painel só atrapalharia.
 */

const COMBAT_ROUTES = ['/boss', '/portal'];

function HpBar({ label, current, max, tone }: { label: string; current: number; max: number | null; tone: 'player' | 'enemy' }) {
  const pct = max && max > 0 ? Math.max(0, Math.min(100, (current / max) * 100)) : null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className="font-bold tabular-nums shrink-0 ml-2">
          {current}
          {max ? ` / ${max}` : ''}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            tone === 'player' ? 'bg-emerald-500' : 'bg-red-500'
          }`}
          style={{ width: pct != null ? `${pct}%` : '100%' }}
        />
      </div>
    </div>
  );
}

export default function CombatPiP() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const { data: combat } = useActiveCombat();
  const abandon = useAbandonActiveCombat();

  const onCombatPage = COMBAT_ROUTES.some((r) => location.pathname.startsWith(r));
  if (!combat || onCombatPage) return null;

  const resume = () => navigate(activeCombatRoute(combat));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.95 }}
        // Acima do botão do chat flutuante (bottom-6), e acima da tab bar no mobile.
        className="fixed bottom-24 right-4 sm:right-6 z-40 w-[min(19rem,calc(100vw-2rem))]"
      >
        <div className="rounded-xl border border-red-500/30 bg-card/95 backdrop-blur shadow-2xl overflow-hidden">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-red-500/10 border-b border-red-500/20"
          >
            <Swords className="w-3.5 h-3.5 text-red-400 shrink-0 animate-pulse" />
            <span className="text-xs font-bold text-red-300 truncate flex-1 text-left">
              {combat.label || t('app.combat_pip.title')}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${
                collapsed ? '-rotate-90' : ''
              }`}
            />
          </button>

          {!collapsed && (
            <div className="p-3 space-y-2.5">
              {combat.hpEnemy != null && (
                <HpBar
                  label={combat.label || t('app.combat_pip.enemy')}
                  current={combat.hpEnemy}
                  max={combat.hpEnemyMax}
                  tone="enemy"
                />
              )}
              <HpBar
                label={t('app.combat_pip.you')}
                current={combat.hpPlayer}
                max={combat.hpPlayerMax}
                tone="player"
              />

              <div className="flex gap-1.5 pt-0.5">
                <button
                  onClick={resume}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  <Maximize2 className="w-3 h-3" /> {t('app.combat_pip.resume')}
                </button>
                {combat.kind === 'boss' && (
                  <button
                    onClick={() => abandon.mutate()}
                    disabled={abandon.isPending}
                    title={t('app.combat_pip.leave')}
                    className="px-2 py-1.5 rounded-lg text-[11px] font-bold bg-muted/50 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
