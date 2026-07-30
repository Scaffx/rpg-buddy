import { useMemo } from 'react';
import { Search, Lock, Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { REVEAL_TIERS, revealPrice, buildRevealedInfo } from '@/lib/portalReveal';
import { useDungeonReveal, useBuyDungeonReveal } from '@/hooks/useDungeonReveal';
import { DUNGEON_DATA } from '@/components/DungeonArena';
import { getWeaknessByIndex } from '@/lib/combat';

/**
 * Lupas de Revelação — informação como mercadoria.
 *
 * Cair fecha o portal de vez, então entrar às cegas é caro. Aqui o jogador troca
 * ouro por saber o que o espera: quantos andares, quais inimigos e, na lupa
 * cara, quem é o boss final e onde ele é fraco.
 */
export default function DungeonRevealCard({ currentGold }: { currentGold: number }) {
  const { t } = useTranslation();
  const { data: reveal } = useDungeonReveal();
  const buy = useBuyDungeonReveal();

  const info = useMemo(() => {
    if (!reveal?.pendingDungeon) return null;
    return buildRevealedInfo(reveal.pendingDungeon, reveal.revealLevel, DUNGEON_DATA, getWeaknessByIndex);
  }, [reveal?.pendingDungeon, reveal?.revealLevel]);

  // Sem masmorra pendente não há o que revelar.
  if (!reveal?.pendingDungeon || !info) return null;

  const level = reveal.revealLevel;

  const handleBuy = (tierIndex: number) => {
    const tier = REVEAL_TIERS[tierIndex];
    buy.mutate(tier, {
      onSuccess: () => toast.success(t('app.portal.reveal_bought')),
      onError: (err: unknown) => {
        const msg = (err as { message?: string })?.message || '';
        toast.error(
          msg.includes('INSUFFICIENT_GOLD')
            ? t('app.portal.reveal_no_gold')
            : t('app.portal.reveal_error'),
        );
      },
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
          <Search className="w-4 h-4 text-cyan-400" /> {t('app.portal.reveal_title')}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">{t('app.portal.reveal_sub')}</p>
      </div>

      <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3.5 space-y-2.5">
        {/* O que já foi revelado */}
        {level === 0 && (
          <p className="text-xs text-muted-foreground italic">{t('app.portal.reveal_nothing')}</p>
        )}
        {info.floors != null && (
          <p className="text-xs text-cyan-200">
            🏛️ {t('app.portal.reveal_floors', { n: info.floors })}
          </p>
        )}
        {info.enemies && info.enemies.length > 0 && (
          <div className="text-xs text-cyan-200">
            <p className="mb-1">👹 {t('app.portal.reveal_enemies')}</p>
            <div className="flex flex-wrap gap-1">
              {info.enemies.map((name) => (
                <span key={name} className="bg-cyan-950/40 border border-cyan-500/30 rounded px-1.5 py-0.5 text-[10px]">
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}
        {info.finalBoss && (
          <p className="text-xs text-amber-200">
            {info.finalBoss.icon} <span className="font-bold">{info.finalBoss.name}</span> ·{' '}
            {t('app.portal.reveal_weakness', { attr: info.finalBoss.weakness })}
          </p>
        )}

        {/* Lupas ainda disponíveis */}
        <div className="flex flex-col gap-1.5 pt-1">
          {REVEAL_TIERS.map((tier, i) => {
            const owned = level >= tier.level;
            const price = revealPrice(tier);
            const affordable = currentGold >= price;
            if (owned) return null;
            return (
              <button
                key={tier.level}
                onClick={() => handleBuy(i)}
                disabled={!affordable || buy.isPending}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-xs text-cyan-200 hover:bg-cyan-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3 h-3" />
                  {t(`app.portal.reveal_tier_${tier.labelKey}`)}
                </span>
                <span className="flex items-center gap-1 font-bold text-yellow-400">
                  <Coins className="w-3 h-3" /> {price}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
