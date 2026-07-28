import { useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Maximize2, X, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveCombat, useAbandonActiveCombat, activeCombatRoute } from '@/hooks/useActiveCombat';
import { useIsMobile } from '@/hooks/use-mobile';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/hooks/useAuth';

/**
 * Janela flutuante do combate em andamento.
 *
 * O combate ocupava a tela inteira, então entrar numa masmorra significava
 * abandonar o resto do app. Aqui ele vira um painel de canto: dá para marcar
 * missões, abrir o perfil e continuar acompanhando a luta — e voltar para a
 * tela cheia quando quiser agir.
 *
 * No celular o painel nasce como uma barra fina, e quem manda no toque é a
 * preferência combat_fullscreen_mobile: abrir a arena inteira ou só expandir
 * o painel ali mesmo.
 *
 * Fica escondido quando o jogador já está na página do próprio combate: ali a
 * arena inteira está à vista e o painel só atrapalharia.
 */

const COMBAT_ROUTES = ['/boss', '/portal'];

function HpBar({
  label,
  current,
  max,
  tone,
}: {
  label: string;
  current: number;
  max: number | null;
  tone: 'player' | 'enemy';
}) {
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
  const isMobile = useIsMobile();
  const { data: profile } = useProfile();

  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: combat } = useActiveCombat();
  const abandon = useAbandonActiveCombat();

  const setFullscreenPref = useMutation({
    mutationFn: async (value: boolean) => {
      if (!user) return;
      const { error } = await supabase
        .from('profiles')
        .update({ combat_fullscreen_mobile: value } as never)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });

  // No celular o painel começa recolhido: a tela é pequena e a luta não pode
  // roubar o espaço de quem só passou para marcar uma missão.
  const [collapsed, setCollapsed] = useState(isMobile);

  const onCombatPage = COMBAT_ROUTES.some((r) => location.pathname.startsWith(r));
  if (!combat || onCombatPage) return null;

  const prefersFullscreen = (profile as { combat_fullscreen_mobile?: boolean } | undefined)
    ?.combat_fullscreen_mobile !== false;
  const openArena = () => navigate(activeCombatRoute(combat));

  // No celular, quem escolheu tela cheia vai direto para a arena ao tocar no
  // cabeçalho; quem não escolheu apenas abre o painel aqui.
  const onHeaderClick = () => {
    if (isMobile && prefersFullscreen) openArena();
    else setCollapsed((c) => !c);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.95 }}
        // Acima do botão do chat flutuante (bottom-6). No celular ocupa a
        // largura útil como barra; no desktop é um cartão de canto.
        className="fixed bottom-24 right-4 left-4 sm:left-auto sm:right-6 z-40 sm:w-[19rem]"
      >
        <div className="rounded-xl border border-red-500/30 bg-card/95 backdrop-blur shadow-2xl overflow-hidden">
          <button
            onClick={onHeaderClick}
            className="w-full flex items-center gap-2 px-3 py-2 bg-red-500/10 border-b border-red-500/20"
          >
            <Swords className="w-3.5 h-3.5 text-red-400 shrink-0 animate-pulse" />
            <span className="text-xs font-bold text-red-300 truncate flex-1 text-left">
              {combat.label || t('app.combat_pip.title')}
            </span>
            {/* Na barra recolhida do celular, o HP precisa aparecer sem abrir nada. */}
            {collapsed && (
              <span className="text-[10px] font-bold tabular-nums text-emerald-400 shrink-0">
                {combat.hpPlayer}
                {combat.hpPlayerMax ? `/${combat.hpPlayerMax}` : ''}
              </span>
            )}
            {isMobile && prefersFullscreen ? (
              <Maximize2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown
                className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${
                  collapsed ? '-rotate-90' : ''
                }`}
              />
            )}
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
                  onClick={openArena}
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

              {/* A preferência mora aqui, junto do comportamento que ela governa. */}
              {isMobile && (
                <label className="flex items-center justify-between gap-2 pt-1 cursor-pointer">
                  <span className="text-[10px] text-muted-foreground">
                    {t('app.combat_pip.fullscreen_pref')}
                  </span>
                  <input
                    type="checkbox"
                    checked={prefersFullscreen}
                    onChange={(e) => setFullscreenPref.mutate(e.target.checked)}
                    disabled={setFullscreenPref.isPending}
                    className="h-3.5 w-3.5 accent-red-500 cursor-pointer"
                  />
                </label>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
