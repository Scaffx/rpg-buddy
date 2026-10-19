import { useEffect, useState } from 'react';
import { Loader2, RotateCw, Swords, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAutoAdventure, type AdventureEncounter } from '@/hooks/useAutoAdventure';
import { CharacterSprite } from '@/components/CharacterSprite';
import { useHeroClass, starterClassDisplayName } from '@/hooks/useHeroClass';
import { useProfile } from '@/hooks/useProfile';
import { useTranslation } from 'react-i18next';

function kindLabel(encounter: Pick<AdventureEncounter, 'kind' | 'stage' | 'boss_name'>, t: ReturnType<typeof useTranslation>['t']) {
  return encounter.kind === 'boss'
    ? (encounter.boss_name || t('app.autoAdventure.unknownBoss', { defaultValue: 'Chefe da etapa {{stage}}', stage: encounter.stage }))
    : t('app.autoAdventure.normalEnemy', { defaultValue: 'Inimigo da etapa {{stage}}', stage: encounter.stage });
}

export default function AutoAdventure() {
  const { data, dataUpdatedAt, isLoading, isFetching, error, refetch } = useAutoAdventure();
  const { data: profile } = useProfile();
  const { currentClassName, starterClass } = useHeroClass();
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());

  // This clock only animates the display. The server catches up when any client returns.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (isLoading) {
    return <div className="rpg-card flex items-center gap-3" role="status"><Loader2 className="h-5 w-5 animate-spin" /> {t('app.autoAdventure.loading', { defaultValue: 'Preparando sua aventura...' })}</div>;
  }

  if (error || !data) {
    return <div className="rpg-card space-y-3 border-amber-500/40" role="alert">
      <p className="font-semibold">{t('app.autoAdventure.unavailable', { defaultValue: 'A aventura está indisponível agora.' })}</p>
      <p className="text-sm text-muted-foreground">{t(error instanceof Error && error.message === 'AUTO_ADVENTURE_INVALID_RESPONSE' ? 'app.autoAdventure.invalidResponse' : 'app.autoAdventure.retryHint', { defaultValue: error instanceof Error && error.message === 'AUTO_ADVENTURE_INVALID_RESPONSE' ? 'Os dados da aventura não puderam ser confirmados. Tente atualizar.' : 'Tente novamente em instantes.' })}</p>
      <Button variant="outline" onClick={() => void refetch()}><RotateCw className="mr-2 h-4 w-4" /> {t('app.autoAdventure.retry', { defaultValue: 'Tentar novamente' })}</Button>
    </div>;
  }

  const nextAt = new Date(data.next_at).getTime();
  const serverNow = new Date(data.server_now).getTime() + Math.max(0, now - (dataUpdatedAt || now));
  const remaining = Math.max(0, Math.ceil((nextAt - serverNow) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, '0');
  const progress = Math.max(0, Math.min(100, 100 * (1 - remaining / (data.limits.interval_minutes * 60))));
  const isBoss = data.stage % 10 === 0;
  const latest = data.encounters[0];
  const heroName = profile?.display_name || t('app.autoAdventure.heroFallback', { defaultValue: 'Aventureiro' });
  const heroClass = currentClassName || starterClassDisplayName(starterClass);
  const enemyName = isBoss
    ? (data.boss?.name || t('app.autoAdventure.unknownBoss', { defaultValue: 'Chefe da etapa {{stage}}', stage: data.stage }))
    : t('app.autoAdventure.normalEnemy', { defaultValue: 'Inimigo da etapa {{stage}}', stage: data.stage });
  const enemyIcon = isBoss ? (data.boss?.icon || '🐉') : '👾';

  return <section className="space-y-4" aria-label={t('app.autoAdventure.title', { defaultValue: 'Aventura automática' })}>
    <div className="rpg-card-glow space-y-5 border-primary/30 bg-gradient-to-br from-primary/10 to-slate-900/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{t('app.autoAdventure.title', { defaultValue: 'Aventura automática' })}</p>
          <h2 className="font-display text-2xl font-bold text-primary">{t('app.autoAdventure.stage', { defaultValue: 'Etapa {{stage}}', stage: data.stage })}</h2>
          <p className="text-sm text-muted-foreground">{isBoss ? t('app.autoAdventure.bossAhead', { defaultValue: '🐉 Chefe à frente' }) : t('app.autoAdventure.normalAhead', { defaultValue: '⚔️ Próximo inimigo' })} · {t('app.autoAdventure.noTurns', { defaultValue: 'combate sem comandos por turno' })}</p>
          {data.boss && <p className="mt-1 text-xs text-primary/80">{t('app.autoAdventure.nextBoss', { defaultValue: 'Próximo chefe: {{name}} (etapa {{stage}})', name: data.boss.name, stage: data.boss.stage })}</p>}
        </div>
        <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">{t('app.autoAdventure.syncHint', { defaultValue: 'Atualiza ao abrir e voltar' })}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="rounded-xl border border-primary/30 bg-card/60 p-4 text-center">
          <div className="mx-auto mb-2 flex h-16 items-center justify-center motion-reduce:[&_*]:!animate-none" aria-hidden="true">
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-14 w-14 rounded-full object-cover motion-safe:animate-pulse" /> : <CharacterSprite />}
          </div>
          <p className="font-semibold">{heroName}</p>
          <p className="text-xs text-primary/80">{heroClass}</p>
          <p className="text-xs text-muted-foreground">{t('app.autoAdventure.heroPowerHint', { defaultValue: 'Nível, atributos treinados e equipamento influenciam o combate' })}</p>
        </div>
        <Swords className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <div className="rounded-xl border border-destructive/30 bg-card/60 p-4 text-center"><span className="block text-3xl motion-safe:animate-pulse" aria-hidden="true">{enemyIcon}</span><p className="font-semibold">{enemyName}</p><p className="text-xs text-muted-foreground">{t('app.autoAdventure.stage', { defaultValue: 'Etapa {{stage}}', stage: data.stage })}</p></div>
      </div>

      <div className="space-y-2" aria-label={t('app.autoAdventure.nextEncounter', { defaultValue: 'Próximo confronto' })}>
        <div className="flex justify-between text-xs text-muted-foreground"><span>{t('app.autoAdventure.nextEncounter', { defaultValue: 'Próximo confronto' })}</span><span aria-hidden="true">{minutes}:{seconds}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all duration-1000" style={{ width: `${progress}%` }} /></div>
      </div>
      <p className="text-xs text-muted-foreground">{t('app.autoAdventure.offlineHint', { defaultValue: 'Com o app fechado, não há lutas em tempo real. Ao voltar, o servidor reconcilia no máximo {{hours}} horas. Derrotas pausam a etapa até a próxima tentativa.', hours: data.limits.offline_hours })}</p>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rpg-card"><p className="text-xs text-muted-foreground">{t('app.autoAdventure.goldToday', { defaultValue: 'Ouro da aventura hoje' })}</p><p className="text-xl font-bold text-amber-300">{data.gold_today} / {data.limits.gold_per_day}</p></div>
      <div className="rpg-card"><p className="text-xs text-muted-foreground">{t('app.autoAdventure.itemsToday', { defaultValue: 'Itens da aventura hoje' })}</p><p className="text-xl font-bold">{data.loot_today} / {data.limits.items_per_day}</p></div>
      <div className="rpg-card"><p className="text-xs text-muted-foreground">{t('app.autoAdventure.lastResult', { defaultValue: 'Último resultado' })}</p><p className="text-sm font-semibold">{latest ? latest.won ? t('app.autoAdventure.victory', { defaultValue: 'Vitória' }) : t('app.autoAdventure.defeatNeutral', { defaultValue: 'Derrota sem penalidade' }) : t('app.autoAdventure.waiting', { defaultValue: 'Aguardando' })}</p></div>
    </div>

    <div className="rpg-card space-y-3">
      <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-display font-bold"><Trophy className="h-4 w-4" /> {t('app.autoAdventure.recent', { defaultValue: 'Confrontos recentes' })}</h3><Button size="sm" variant="ghost" disabled={isFetching} onClick={() => void refetch()} aria-label={t('app.autoAdventure.refresh', { defaultValue: 'Atualizar aventura' })}><RotateCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /></Button></div>
      {data.encounters.length === 0 ? <p className="text-sm text-muted-foreground">{t('app.autoAdventure.noneYet', { defaultValue: 'Nenhum confronto ainda.' })}</p> : <ol className="space-y-2">{data.encounters.map(encounter => <li key={`${encounter.stage}-${encounter.attempt}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-sm"><span>{encounter.kind === 'boss' ? (encounter.boss_icon || '🐉') : '⚔️'} {kindLabel(encounter, t)}</span><span className={encounter.won ? 'text-emerald-300' : 'text-amber-300'}>{encounter.won ? t('app.autoAdventure.victoryReward', { defaultValue: 'Vitória · +{{gold}} ouro{{item}}', gold: encounter.gold, item: encounter.item_id ? t('app.autoAdventure.itemInInventory', { defaultValue: ' · item no inventário' }) : '' }) : t('app.autoAdventure.defeatNoLoss', { defaultValue: 'Derrota · sem perda' })}</span></li>)}</ol>}
      <p className="text-xs text-muted-foreground">{t('app.autoAdventure.routineProgressOnly', { defaultValue: 'Combate não concede XP, nível nem atributos. Essas evoluções vêm de rotinas concluídas.' })}</p>
    </div>
  </section>;
}
