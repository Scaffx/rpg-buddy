import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAllCompanions, isCombatCompanion } from '@/hooks/useCompanion';
import { usePortalEvent, useMyFragments, useScanPortal } from '@/hooks/usePortalEvent';
import { useInventory } from '@/hooks/useInventory';
import { useGoldBalance } from '@/hooks/useGold';
import DungeonRevealCard from '@/components/DungeonRevealCard';
import { useCoopActions, useCoopSessions, useCoopState, type CoopDifficulty } from '@/hooks/useCoopPortal';
import { useToast } from '@/hooks/use-toast';

const difficulties: Record<CoopDifficulty, { name: string; min: number; waves: string }> = {
  easy: { name: 'Fácil', min: 1, waves: '1 boss' },
  medium: { name: 'Médio', min: 20, waves: '1 + 1' },
  hard: { name: 'Difícil', min: 30, waves: '1 + 2 juntos' },
  legendary: { name: 'Lendário', min: 40, waves: '2 juntos + 1' },
  ultra: { name: 'Ultralendário', min: 50, waves: '2 + 2 + 1' },
};
const dailyDifficulty: Record<string, CoopDifficulty> = { blue: 'easy', yellow: 'medium', red: 'hard', legendary: 'legendary' };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Ação recusada pelo servidor.';

export default function PortalEventPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: event } = usePortalEvent();
  const { data: fragments } = useMyFragments();
  const { data: inventory } = useInventory();
  const { data: goldBalance } = useGoldBalance();
  const scan = useScanPortal();
  const { data: companions } = useAllCompanions();
  const { data: sessions } = useCoopSessions();
  const { create, join, start, attack } = useCoopActions();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [companionId, setCompanionId] = useState<string | null>(null);
  const { data: session } = useCoopState(sessionId);

  async function make(source: 'daily' | 'fragments', difficulty: CoopDifficulty | null) {
    try {
      const eventId = source === 'daily' ? event?.event_id ?? null : null;
      if (source === 'daily' && !eventId) throw new Error('Evento indisponível');
      const key = `portal-coop:${source}:${difficulty ?? 'hidden'}:${eventId ?? ''}`;
      let requestId = localStorage.getItem(key);
      if (!requestId) { requestId = crypto.randomUUID(); localStorage.setItem(key, requestId); }
      const result = await create.mutateAsync({ source, difficulty, eventId, requestId, companionId });
      localStorage.removeItem(key);
      setSessionId(result.session_id);
    } catch (error) { toast({ title: 'Entrada recusada', description: errorMessage(error), variant: 'destructive' }); }
  }

  async function enter() {
    try {
      const result = await join.mutateAsync({ code: code.trim().toUpperCase(), companionId });
      setSessionId(result.session_id); setCode('');
    } catch (error) { toast({ title: 'Convite recusado', description: errorMessage(error), variant: 'destructive' }); }
  }
  async function begin() {
    if (!sessionId) return;
    try { await start.mutateAsync(sessionId); }
    catch (error) { toast({ title: 'Início recusado', description: errorMessage(error), variant: 'destructive' }); }
  }
  async function hit(slot: number) {
    if (!sessionId) return;
    try { await attack.mutateAsync({ sessionId, slot, actionId: crypto.randomUUID() }); }
    catch (error) { toast({ title: 'Ataque recusado', description: errorMessage(error), variant: 'destructive' }); }
  }
  async function scanDaily() {
    if (!event) return;
    try {
      const result = await scan.mutateAsync(event.event_id);
      if (result.error) throw new Error(result.error);
    } catch (error) { toast({ title: 'Escaneamento recusado', description: errorMessage(error), variant: 'destructive' }); }
  }

  const player = session?.players.find(p => p.user_id === user?.id);
  const combatCompanions = (companions ?? []).filter(c => isCombatCompanion(c) && c.current_hp > 0);
  return <AppLayout><main className="mx-auto max-w-4xl space-y-6 p-5 text-foreground">
    <header><p className="text-xs uppercase tracking-widest text-purple-300">Portais cooperativos</p>
      <h1 className="text-3xl font-bold">Entre com 2 a 4 jogadores</h1>
      <p className="text-sm text-muted-foreground">O servidor controla nível, vida, bosses, tempo e resultado. XP, ouro e atributos vêm somente das rotinas.</p></header>
    {session ? <section className="space-y-4 rounded-2xl border border-purple-500/30 bg-purple-950/20 p-5">
      <div className="flex justify-between gap-3"><div><h2 className="text-xl font-bold">{difficulties[session.difficulty].name} · {session.status === 'active' ? `Encontro ${session.wave}` : session.status}</h2>
        <p className="text-sm text-muted-foreground">{difficulties[session.difficulty].waves}</p></div>
        <button onClick={() => setSessionId(null)} className="rounded-lg border border-white/20 px-3 py-2 text-sm">Outras salas</button></div>
      {session.status === 'lobby' && <div className="rounded-xl bg-black/30 p-4">
        <p className="text-sm">Código de convite: <strong className="font-mono text-xl tracking-widest">{session.invite_code}</strong></p>
        <button onClick={() => void navigator.clipboard.writeText(session.invite_code)} className="mt-2 rounded-lg bg-purple-700 px-3 py-2 text-sm">Copiar</button>
        <p className="mt-2 text-xs text-muted-foreground">O host inicia com 2 a 4 jogadores. Todos devem cumprir o nível mínimo.</p></div>}
      <div className="grid gap-2 sm:grid-cols-2">{session.players.map(p => <div key={p.user_id} className="rounded-xl border border-white/10 p-3 text-sm">
        <p><strong>{p.name}</strong>{p.user_id === session.host_id ? ' 👑' : ''} · Lv. {p.level}</p>
        <p className="text-xs text-muted-foreground">HP {p.hp}/{p.max_hp}{p.companion ? ` · ${p.companion}` : ''}</p></div>)}</div>
      {session.status === 'lobby' && session.host_id === user?.id && <button disabled={session.players.length < 2 || session.players.length > 4 || start.isPending}
        onClick={() => void begin()} className="rounded-lg bg-purple-600 px-4 py-2 font-bold disabled:opacity-40">Iniciar com {session.players.length}</button>}
      {session.status === 'active' && <div className="space-y-3"><p className="text-xs text-muted-foreground">Os bosses reagem a cada ataque; o encontro seguinte começa automaticamente.</p>
        <div className="grid gap-3 sm:grid-cols-2">{session.enemies.map(e => <div key={`${session.wave}:${e.slot}`} className="rounded-xl border border-red-500/30 bg-red-950/20 p-4">
          <p className="font-bold">{e.icon} {e.name}</p><p className="text-sm">HP {e.hp}/{e.max_hp}</p>
          <div className="mt-2 h-2 rounded bg-white/10"><div className="h-full rounded bg-red-500" style={{ width: `${Math.max(0, e.hp / e.max_hp * 100)}%` }} /></div>
          <button disabled={!player?.hp || e.hp <= 0 || attack.isPending} onClick={() => void hit(e.slot)}
            className="mt-3 rounded-lg bg-red-700 px-4 py-2 text-sm disabled:opacity-40">Atacar</button></div>)}</div>
        {player?.hp === 0 && <p className="text-sm text-amber-300">Incapacitado. Seus aliados podem continuar.</p>}</div>}
      <div><h3 className="text-sm font-bold">Linha do tempo</h3><ol className="max-h-52 space-y-1 overflow-auto text-xs text-muted-foreground">
        {[...session.timeline].reverse().map(item => <li key={item.id}>{item.message}</li>)}</ol></div>
    </section> : <>
      {!!sessions?.length && <section className="space-y-2"><h2 className="font-bold">Suas salas</h2>{sessions.map(s => <button key={s.session_id} onClick={() => setSessionId(s.session_id)}
        className="mr-2 rounded-lg border border-purple-500/30 px-3 py-2 text-sm">{difficulties[s.difficulty].name} · {s.status}</button>)}</section>}
      <section className="space-y-2 rounded-xl border border-white/10 p-4"><h2 className="font-bold">Entrar por convite</h2>
        <div className="flex gap-2"><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={8} placeholder="Código de 8 caracteres"
          className="min-w-0 flex-1 rounded-lg border border-white/20 bg-black/20 px-3 py-2 font-mono" />
          <button disabled={code.trim().length !== 8 || join.isPending} onClick={() => void enter()} className="rounded-lg bg-purple-700 px-4 py-2 disabled:opacity-40">Entrar</button></div></section>
      <section className="space-y-2 rounded-xl border border-white/10 p-4"><h2 className="font-bold">Companheiro real</h2>
        <p className="text-xs text-muted-foreground">Opcional. Só companheiros de combate da sua coleção podem acompanhar o grupo. Pets não alteram XP ou ouro.</p>
        <select value={companionId ?? ''} onChange={e => setCompanionId(e.target.value || null)} className="w-full rounded-lg border border-white/20 bg-background p-2 text-sm">
          <option value="">Sem companheiro</option>{combatCompanions.map(c => <option key={c.id} value={c.id}>{c.name} · Lv. {c.level}</option>)}</select></section>
      <section className="space-y-2 rounded-xl border border-sky-500/30 p-4"><h2 className="font-bold">Portal diário</h2>
        {event ? <><p className="text-sm">{event.portal_color ? `${difficulties[dailyDifficulty[event.portal_color]].name} · Lv. ${difficulties[dailyDifficulty[event.portal_color]].min}+` : 'Dificuldade oculta até entrar'}</p>
          {!event.color_revealed && <button disabled={scan.isPending || !(inventory ?? []).some(item => item.game_items?.effect === 'portal_scan')}
            onClick={() => void scanDaily()} className="mr-2 rounded-lg border border-sky-500/40 px-4 py-2 text-sm disabled:opacity-40">Usar scanner</button>}
          <button disabled={event.already_completed || create.isPending} onClick={() => void make('daily', null)} className="rounded-lg bg-sky-700 px-4 py-2 disabled:opacity-40">
            {event.already_completed ? 'Concluído' : 'Criar sala diária'}</button></> : <p className="text-sm text-muted-foreground">Nenhum evento ativo.</p>}</section>
      <section className="space-y-3 rounded-xl border border-amber-500/30 p-4"><h2 className="font-bold">Portais de fragmentos · {fragments?.fragments ?? 0} ⬡</h2>
        <p className="text-xs text-muted-foreground">Criar custa 10 fragmentos ao host. Seu inventário e dungeons pendentes permanecem registrados.</p>
        {fragments?.pending_dungeon && <p className="text-xs text-amber-300">Pendente: {difficulties[fragments.pending_dungeon]?.name}</p>}
        <div className="grid gap-2 sm:grid-cols-2">{(['medium','hard','legendary','ultra'] as CoopDifficulty[]).map(d => <button key={d}
          disabled={(fragments?.fragments ?? 0) < 10 || create.isPending} onClick={() => void make('fragments', d)}
          className="rounded-lg border border-amber-500/30 p-3 text-left disabled:opacity-40"><strong>{difficulties[d].name}</strong>
          <span className="block text-xs text-muted-foreground">Lv. {difficulties[d].min}+ · {difficulties[d].waves}</span></button>)}</div></section>
      <DungeonRevealCard currentGold={Number((goldBalance as { gold?: number } | undefined)?.gold ?? 0)} />
    </>}
  </main></AppLayout>;
}
