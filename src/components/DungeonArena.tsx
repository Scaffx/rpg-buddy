import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Zap, ChevronRight, Trophy, Skull, LogOut, Users, Package, FlaskConical, Bot, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

// ── Types ──────────────────────────────────────────────────────────────────
type RoomType = 'combat' | 'rescue' | 'treasure' | 'trap' | 'rest' | 'boss';

type EnemyDef = { name: string; icon: string; hp: number; atk: number };
type RoomDef = {
  type: RoomType;
  name: string;
  desc: string;
  icon: string;
  enemy?: EnemyDef;
  trapDmg?: number;
  npcName?: string;
};

type LootDrop = { id: string; name: string; icon: string; qty: number };

export type PotionItem = {
  invId: string;
  name: string;
  effect: string;
  icon: string;
  qty: number;
};

type DungeonPhase = 'prep' | 'exploring' | 'victory' | 'defeat';

// ── Loot Table ─────────────────────────────────────────────────────────────
const LOOT_TABLE: Array<{ id: string; name: string; icon: string; weight: number; min: number; max: number }> = [
  { id: 'moeda_cobre',          name: 'Moedas de Cobre',       icon: '🪙', weight: 40, min: 3, max: 12 },
  { id: 'pedra_bruta',          name: 'Pedra Bruta',            icon: '🪨', weight: 28, min: 1, max: 3  },
  { id: 'galho_seco',           name: 'Galho Seco',             icon: '🌿', weight: 24, min: 1, max: 4  },
  { id: 'fibra_vegetal',        name: 'Fibra Vegetal',          icon: '🌱', weight: 20, min: 1, max: 3  },
  { id: 'couro_cru',            name: 'Couro Cru',              icon: '🐾', weight: 14, min: 1, max: 2  },
  { id: 'osso_polido',          name: 'Osso Polido',            icon: '🦴', weight: 11, min: 1, max: 2  },
  { id: 'cristal_fragmentado',  name: 'Cristal Fragmentado',    icon: '💎', weight: 5,  min: 1, max: 1  },
];

// ── Dungeon Configs ─────────────────────────────────────────────────────────
const DUNGEON_ROOMS: Record<string, RoomDef[]> = {
  '1': [
    { type: 'combat',   name: 'Corredor da Entrada',     desc: 'Slimes infestam a passagem sombria...', icon: '🌫️',
      enemy: { name: 'Slime Preguiçoso', icon: '🟢', hp: 40, atk: 9 } },
    { type: 'rescue',   name: 'Cela dos Prisioneiros',   desc: 'Gritos abafados vêm de trás da grade enferrujada.', icon: '🔒', npcName: 'Aventureiro Capturado' },
    { type: 'treasure', name: 'Sala do Tesouro',          desc: 'Um baú coberto de poeira paira no centro da sala.', icon: '💰' },
    { type: 'combat',   name: 'Câmara do Capitão',        desc: 'Um goblin armado bloqueia a passagem principal!', icon: '⚔️',
      enemy: { name: 'Capitão Goblin', icon: '👺', hp: 70, atk: 16 } },
    { type: 'trap',     name: 'Corredor das Lâminas',     desc: 'O piso pulsa com armadilhas mecânicas.', icon: '⚠️', trapDmg: 22 },
    { type: 'rest',     name: 'Câmara Sagrada',           desc: 'Uma fonte mágica emana luz dourada reconfortante.', icon: '✨' },
  ],
  '2': [
    { type: 'combat',   name: '1º Andar — Sentinelas',    desc: 'Golens arcanos montam guarda na entrada da torre.', icon: '🌩️',
      enemy: { name: 'Golem Arcano', icon: '🤖', hp: 80, atk: 20 } },
    { type: 'trap',     name: '2º Andar — Runas Mortais',  desc: 'O piso brilha com runas explosivas em cada passo.', icon: '💥', trapDmg: 38 },
    { type: 'rescue',   name: '3º Andar — Sábio Aprisionado', desc: 'Um ancião está aprisionado por correntes mágicas.', icon: '📚', npcName: 'Sábio Encarcerado' },
    { type: 'combat',   name: '4º Andar — Espectro',       desc: 'Uma entidade sombria surge das paredes geladas!', icon: '👻',
      enemy: { name: 'Espectro do Esquecimento', icon: '👻', hp: 95, atk: 25 } },
    { type: 'treasure', name: '5º Andar — Biblioteca',     desc: 'Prateleiras repletas de tomos e relíquias esquecidas.', icon: '📖' },
    { type: 'combat',   name: '6º Andar — Elite Sombria',  desc: 'Um guerreiro das trevas bloqueia a câmara do Oráculo.', icon: '🌑',
      enemy: { name: 'Guerreiro das Trevas', icon: '🗡️', hp: 90, atk: 22 } },
  ],
  '3': [
    { type: 'combat',   name: 'Portão da Fortaleza',       desc: 'Soldados de pedra animados montam guarda.', icon: '🏰',
      enemy: { name: 'Soldado de Pedra', icon: '🪨', hp: 30, atk: 7 } },
    { type: 'trap',     name: 'Fosso com Lanças',           desc: 'Lanças surgem do chão ao caminhar!', icon: '⚠️', trapDmg: 18 },
    { type: 'rescue',   name: 'Calabouço',                  desc: 'Um aldeão ferido está trancado na cela escura.', icon: '🔒', npcName: 'Aldeão Assustado' },
    { type: 'treasure', name: 'Sala das Armas',             desc: 'Armamentos e materiais espalhados pelo chão de pedra.', icon: '🛡️' },
    { type: 'combat',   name: 'Pátio dos Guardiões',        desc: 'Dois lobos ferozes circulam a entrada do chefe!', icon: '🐺',
      enemy: { name: 'Lobo Feroz', icon: '🐺', hp: 28, atk: 10 } },
    { type: 'rest',     name: 'Sala do Trono',              desc: 'O silêncio antes do confronto final...', icon: '👑' },
  ],
};

const DUNGEON_BOSS: Record<string, EnemyDef & { matk: number }> = {
  '1': { name: 'Guardião das Rotinas', icon: '🧿', hp: 380, atk: 30, matk: 22 },
  '2': { name: 'Oráculo das Trevas',   icon: '🧙', hp: 560, atk: 42, matk: 50 },
  '3': { name: 'Colosso de Pedra',     icon: '🗿', hp: 280, atk: 24, matk: 13 },
};

const DUNGEON_XP:   Record<string, number> = { '1': 220, '2': 380, '3': 160 };
const DUNGEON_GOLD: Record<string, number> = { '1': 90,  '2': 140, '3': 65  };

// ── Helpers ────────────────────────────────────────────────────────────────
function d(sides: number): number { return Math.floor(Math.random() * sides) + 1; }

function rollLoot(count: number): LootDrop[] {
  const totalW = LOOT_TABLE.reduce((s, l) => s + l.weight, 0);
  const picked: LootDrop[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    let rng = Math.random() * totalW;
    for (const item of LOOT_TABLE) {
      rng -= item.weight;
      if (rng <= 0 && !used.has(item.id)) {
        used.add(item.id);
        picked.push({ id: item.id, name: item.name, icon: item.icon, qty: item.min + Math.floor(Math.random() * (item.max - item.min + 1)) });
        break;
      }
    }
  }
  return picked;
}

function getHealFromEffect(effect: string, maxHp: number, maxMp: number): { hp: number; mp: number } {
  const e = effect.toLowerCase();
  if (e.includes('full_rest'))                         return { hp: maxHp, mp: maxMp };
  if (e.includes('heal_hp_large') || e.includes('heal_large'))   return { hp: Math.round(maxHp * 0.6), mp: 0 };
  if (e.includes('heal_hp_medium') || e.includes('heal_medium')) return { hp: Math.round(maxHp * 0.35), mp: 0 };
  if (e.startsWith('heal_'))                           return { hp: Math.round(maxHp * 0.2), mp: 0 };
  if (e.includes('mana_large') || e.includes('mana_restore_large'))   return { hp: 0, mp: Math.round(maxMp * 0.6) };
  if (e.includes('mana_medium') || e.includes('mana_restore_medium')) return { hp: 0, mp: Math.round(maxMp * 0.35) };
  if (e.startsWith('mana_'))                           return { hp: 0, mp: Math.round(maxMp * 0.2) };
  return { hp: 20, mp: 0 };
}

function mergeLoot(existing: LootDrop[], incoming: LootDrop[]): LootDrop[] {
  const map = new Map<string, LootDrop>(existing.map(i => [i.id, { ...i }]));
  for (const item of incoming) {
    if (map.has(item.id)) map.get(item.id)!.qty += item.qty;
    else map.set(item.id, { ...item });
  }
  return [...map.values()];
}

// ── Props ──────────────────────────────────────────────────────────────────
export type DungeonArenaProps = {
  dungeonId: string;
  dungeonName: string;
  initialPlayerHp: number;
  initialPlayerMaxHp: number;
  initialPlayerMp: number;
  initialPlayerMaxMp: number;
  playerLevel: number;
  playerAtk: number;
  playerDef: number;
  potions: PotionItem[];
  friendCount: number;
  onVictory: (result: { xpGained: number; goldGained: number; loot: LootDrop[]; rescued: number }) => void;
  onDefeat: () => void;
  onFlee: () => void;
};

// ── Component ──────────────────────────────────────────────────────────────
export default function DungeonArena({
  dungeonId,
  dungeonName,
  initialPlayerHp,
  initialPlayerMaxHp,
  initialPlayerMp,
  initialPlayerMaxMp,
  playerLevel,
  playerAtk,
  playerDef,
  potions: initialPotions,
  friendCount,
  onVictory,
  onDefeat,
  onFlee,
}: DungeonArenaProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const boss = DUNGEON_BOSS[dungeonId] || DUNGEON_BOSS['1'];
  const dungeonRoomList = DUNGEON_ROOMS[dungeonId] || DUNGEON_ROOMS['1'];
  const bossRoomDef: RoomDef = {
    type: 'boss',
    name: `Boss Final — ${boss.name}`,
    desc: `A câmara treme com a presença de ${boss.name}. Este é o momento da verdade.`,
    icon: boss.icon,
    enemy: { name: boss.name, icon: boss.icon, hp: boss.hp, atk: boss.atk },
  };
  const allRooms: RoomDef[] = [...dungeonRoomList, bossRoomDef];

  // ── State ──────────────────────────────────────────────────────────────
  const [phase, setPhase]             = useState<DungeonPhase>('prep');
  const [roomIdx, setRoomIdx]         = useState(0);
  const [playerHp, setPlayerHp]       = useState(initialPlayerHp);
  const [playerMp, setPlayerMp]       = useState(initialPlayerMp);
  const [enemyHp, setEnemyHp]         = useState(0);
  const [log, setLog]                 = useState<string[]>([]);
  const [roomOutcome, setRoomOutcome] = useState<'success' | 'failure' | 'partial' | null>(null);
  const [allLoot, setAllLoot]         = useState<LootDrop[]>([]);
  const [rescued, setRescued]         = useState(0);
  const [autoPotion, setAutoPotion]   = useState(true);
  const [potions, setPotions]         = useState<PotionItem[]>(initialPotions);
  const [isGranting, setIsGranting]   = useState(false);
  const [xpEarned, setXpEarned]       = useState(0);
  const [goldEarned, setGoldEarned]   = useState(0);
  const [showLootPanel, setShowLootPanel] = useState(false);

  const logRef = useRef<HTMLDivElement>(null);
  // sync potions ref for access inside callbacks
  const potionsRef = useRef<PotionItem[]>(initialPotions);
  useEffect(() => { potionsRef.current = potions; }, [potions]);
  const autoPotionRef = useRef(true);
  useEffect(() => { autoPotionRef.current = autoPotion; }, [autoPotion]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const addLog = useCallback((msg: string) => {
    setLog(prev => [...prev, msg]);
  }, []);

  const addLoot = useCallback((items: LootDrop[]) => {
    setAllLoot(prev => mergeLoot(prev, items));
    items.forEach(l => addLog(`   📦 +${l.qty}x ${l.icon} ${l.name}`));
  }, [addLog]);

  // ── Potion use ─────────────────────────────────────────────────────────
  const usePotion = useCallback((type: 'hp' | 'mp', auto = false): boolean => {
    const current = potionsRef.current;
    const potion = type === 'hp'
      ? current.find(p => p.effect.startsWith('heal_') || p.effect.includes('full_rest'))
      : current.find(p => p.effect.startsWith('mana_') || p.effect.includes('full_rest'));

    if (!potion || potion.qty <= 0) return false;

    const { hp: healHp, mp: healMp } = getHealFromEffect(potion.effect, initialPlayerMaxHp, initialPlayerMaxMp);

    if (type === 'hp' && healHp <= 0) return false;
    if (type === 'mp' && healMp <= 0) return false;

    if (healHp > 0) setPlayerHp(h => Math.min(h + healHp, initialPlayerMaxHp));
    if (healMp > 0) setPlayerMp(m => Math.min(m + healMp, initialPlayerMaxMp));

    const newPotions = current
      .map(p => p.invId === potion.invId ? { ...p, qty: p.qty - 1 } : p)
      .filter(p => p.qty > 0);
    potionsRef.current = newPotions;
    setPotions(newPotions);

    addLog(`${auto ? '🤖 [Auto]' : '🧪 [Manual]'} ${potion.name} usada! ${healHp > 0 ? `+${healHp} HP` : ''}${healMp > 0 ? ` +${healMp} MP` : ''}`);

    // DB: reduce quantity
    if (user) {
      (supabase as any).from('user_inventory').select('quantity').eq('id', potion.invId).maybeSingle().then(({ data }: any) => {
        const qty = data?.quantity ?? 1;
        if (qty <= 1) (supabase as any).from('user_inventory').delete().eq('id', potion.invId);
        else (supabase as any).from('user_inventory').update({ quantity: qty - 1 }).eq('id', potion.invId);
      });
    }
    return true;
  }, [user, initialPlayerMaxHp, initialPlayerMaxMp, addLog]);

  // ── Enter a room ───────────────────────────────────────────────────────
  const enterRoom = useCallback((idx: number) => {
    const room = allRooms[idx];
    setRoomIdx(idx);
    setRoomOutcome(null);
    setLog([`📍 ${room.name}`, `   ${room.desc}`]);
    if (room.enemy) setEnemyHp(room.enemy.hp);
  }, [allRooms]);

  // ── Action handler (one round / one action per click) ──────────────────
  const handleAction = useCallback(() => {
    const room = allRooms[roomIdx];
    const isCombat = room.type === 'combat' || room.type === 'boss';

    if (isCombat) {
      const friendBonus = Math.min(friendCount * 0.18, 0.65);
      const effAtk = Math.round(playerAtk * (1 + friendBonus));

      const pRoll = d(20);
      const eRoll = d(20);
      const crit  = pRoll === 20;
      const basePDmg = Math.max(1, Math.round((pRoll * effAtk) / 15));
      const pDmg = crit ? basePDmg * 2 : basePDmg;

      setEnemyHp(prev => {
        const newEnemyHp = Math.max(0, prev - pDmg);
        addLog(`⚔️ Você rolou ${pRoll}${crit ? ' 💥CRÍTICO' : ''} → ${pDmg} de dano! (${room.enemy?.name}: ${newEnemyHp} HP)`);

        if (newEnemyHp <= 0) {
          // Enemy killed
          addLog(`✅ ${room.enemy?.name} derrotado!`);
          const loot = rollLoot(room.type === 'boss' ? 4 : 2);
          setAllLoot(al => mergeLoot(al, loot));
          loot.forEach(l => addLog(`   📦 +${l.qty}x ${l.icon} ${l.name}`));
          setRoomOutcome('success');
          if (room.type === 'boss') {
            setTimeout(() => setPhase('victory'), 800);
          }
          return 0;
        }

        // Enemy attacks back
        const rawEDmg = Math.max(1, Math.round((eRoll * (room.enemy?.atk || 15)) / 15) - Math.floor(playerDef / 6));
        const eDmg = Math.max(1, rawEDmg);
        addLog(`👹 ${room.enemy?.name} rolou ${eRoll} → ${eDmg} de dano em você!`);

        setPlayerHp(ph => {
          const newHp = Math.max(0, ph - eDmg);
          addLog(`   ❤️ Seu HP: ${newHp}/${initialPlayerMaxHp}`);
          if (newHp <= 0) {
            addLog(`💀 Você foi derrotado por ${room.enemy?.name}...`);
            setRoomOutcome('failure');
            setTimeout(() => setPhase('defeat'), 800);
          } else if (autoPotionRef.current && newHp <= initialPlayerMaxHp * 0.25) {
            // auto-potion in next tick
            setTimeout(() => {
              const healed = usePotion('hp', true);
              if (!healed) addLog('⚠️ Sem poções de HP! Situação crítica!');
            }, 100);
          }
          return newHp;
        });

        return newEnemyHp;
      });

    } else if (room.type === 'rescue') {
      const roll = d(20) + Math.floor(playerLevel / 2);
      const success = roll >= 12;
      addLog(`🤝 Tentativa de resgate — rolou ${roll} (min: 12)`);
      if (success) {
        addLog(`✅ ${room.npcName} foi resgatado! Você ganha +50 XP bônus.`);
        setRescued(r => r + 1);
        const loot = rollLoot(2);
        setAllLoot(al => mergeLoot(al, loot));
        loot.forEach(l => addLog(`   📦 ${room.npcName} te dá: +${l.qty}x ${l.icon} ${l.name}`));
        setRoomOutcome('success');
      } else {
        addLog(`❌ Não foi possível resgatar ${room.npcName}.`);
        setRoomOutcome('failure');
      }

    } else if (room.type === 'treasure') {
      addLog(`🔑 Você abre o baú com cuidado...`);
      const loot = rollLoot(3);
      setAllLoot(al => mergeLoot(al, loot));
      loot.forEach(l => addLog(`   📦 +${l.qty}x ${l.icon} ${l.name}`));
      addLog(`💰 Itens de fabricação encontrados!`);
      setRoomOutcome('success');

    } else if (room.type === 'trap') {
      const roll = d(20) + Math.floor(playerLevel / 3);
      const evaded = roll >= 14;
      addLog(`🏃 Tentativa de desvio — rolou ${roll} (min: 14)`);
      if (evaded) {
        addLog(`✅ Você desviou da armadilha! Nenhum dano.`);
        const loot = rollLoot(1);
        setAllLoot(al => mergeLoot(al, loot));
        loot.forEach(l => addLog(`   📦 +${l.qty}x ${l.icon} ${l.name}`));
        setRoomOutcome('success');
      } else {
        const dmg = room.trapDmg || 20;
        addLog(`💥 Armadilha disparada! -${dmg} HP`);
        setPlayerHp(ph => {
          const newHp = Math.max(1, ph - dmg);
          addLog(`   ❤️ Seu HP: ${newHp}/${initialPlayerMaxHp}`);
          if (autoPotionRef.current && newHp <= initialPlayerMaxHp * 0.25) {
            setTimeout(() => {
              const healed = usePotion('hp', true);
              if (!healed) addLog('⚠️ Sem poções de HP!');
            }, 100);
          }
          return newHp;
        });
        const loot = rollLoot(1);
        setAllLoot(al => mergeLoot(al, loot));
        loot.forEach(l => addLog(`   📦 +${l.qty}x ${l.icon} ${l.name}`));
        setRoomOutcome('partial');
      }

    } else if (room.type === 'rest') {
      const healHp = Math.round(initialPlayerMaxHp * 0.22);
      const healMp = Math.round(initialPlayerMaxMp * 0.30);
      setPlayerHp(h => Math.min(h + healHp, initialPlayerMaxHp));
      setPlayerMp(m => Math.min(m + healMp, initialPlayerMaxMp));
      addLog(`💚 Você descansou! +${healHp} HP, +${healMp} MP`);
      const loot = rollLoot(1);
      setAllLoot(al => mergeLoot(al, loot));
      loot.forEach(l => addLog(`   📦 +${l.qty}x ${l.icon} ${l.name}`));
      setRoomOutcome('success');
    }
  }, [allRooms, roomIdx, playerAtk, playerDef, playerLevel, friendCount, initialPlayerMaxHp, initialPlayerMaxMp, addLog, usePotion]);

  // ── Continue to next room ──────────────────────────────────────────────
  const handleContinue = useCallback(() => {
    const nextIdx = roomIdx + 1;
    if (nextIdx < allRooms.length) {
      enterRoom(nextIdx);
    }
  }, [roomIdx, allRooms.length, enterRoom]);

  // ── Start dungeon ──────────────────────────────────────────────────────
  const startDungeon = useCallback(() => {
    setPhase('exploring');
    enterRoom(0);
  }, [enterRoom]);

  // ── Grant rewards ──────────────────────────────────────────────────────
  const grantRewards = useCallback(async () => {
    if (!user || isGranting) return;
    setIsGranting(true);

    const rescuedBonus = rescued * 50;
    const totalXp   = (DUNGEON_XP[dungeonId] || 200) + rescuedBonus;
    const copperQty = allLoot.find(l => l.id === 'moeda_cobre')?.qty || 0;
    const totalGold = (DUNGEON_GOLD[dungeonId] || 80) + Math.floor(copperQty * 0.5);

    setXpEarned(totalXp);
    setGoldEarned(totalGold);

    try {
      // XP
      const { error: xpErr } = await (supabase as any).rpc('add_xp_to_user', { p_user_id: user.id, p_xp: totalXp });
      if (xpErr) {
        const { data: prof } = await (supabase as any).from('profiles').select('total_xp').eq('user_id', user.id).maybeSingle();
        await (supabase as any).from('profiles').update({ total_xp: ((prof?.total_xp) || 0) + totalXp }).eq('user_id', user.id);
      }

      // Gold
      const { error: goldErr } = await (supabase as any).rpc('add_gold_to_user', { p_user_id: user.id, p_amount: totalGold });
      if (goldErr) {
        const { data: bal } = await (supabase as any).from('user_balance').select('gold').eq('user_id', user.id).maybeSingle();
        await (supabase as any).from('user_balance').update({ gold: ((bal?.gold) || 0) + totalGold }).eq('user_id', user.id);
      }

      // Crafting materials → game_items by effect
      for (const loot of allLoot.filter(l => l.id !== 'moeda_cobre')) {
        try {
          const { data: gi } = await (supabase as any).from('game_items').select('id').eq('effect', loot.id).maybeSingle();
          if (gi?.id) {
            const { data: ex } = await (supabase as any).from('user_inventory').select('id, quantity').eq('user_id', user.id).eq('item_id', gi.id).maybeSingle();
            if (ex?.id) {
              await (supabase as any).from('user_inventory').update({ quantity: ex.quantity + loot.qty }).eq('id', ex.id);
            } else {
              await (supabase as any).from('user_inventory').insert({ user_id: user.id, item_id: gi.id, quantity: loot.qty, equipped: false });
            }
          }
        } catch { /* item not in game_items yet — tracked in activity_log */ }
      }

      // Activity log
      await (supabase as any).from('activity_log').insert({
        user_id: user.id,
        action: 'dungeon_completed',
        description: `Dungeon "${dungeonName}" concluída! Resgatou ${rescued} NPC(s). Materiais: ${allLoot.map(l => `${l.qty}x ${l.name}`).join(', ')}`,
        xp_gained: totalXp,
      });

      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['gold-balance'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    } catch (err: any) {
      toast({ title: 'Erro ao salvar recompensas', description: err?.message, variant: 'destructive' });
    } finally {
      setIsGranting(false);
    }
  }, [user, isGranting, rescued, allLoot, dungeonId, dungeonName, queryClient, toast]);

  useEffect(() => {
    if (phase === 'victory' && !isGranting && xpEarned === 0) {
      grantRewards();
    }
  }, [phase, isGranting, xpEarned, grantRewards]);

  // ── Derived values ─────────────────────────────────────────────────────
  const currentRoom    = allRooms[roomIdx];
  const isCombatRoom   = currentRoom?.type === 'combat' || currentRoom?.type === 'boss';
  const maxEnemyHp     = currentRoom?.enemy?.hp || 1;
  const combatOngoing  = isCombatRoom && enemyHp > 0 && roomOutcome === null;
  const roomsDone      = Math.min(roomIdx, dungeonRoomList.length);
  const totalRooms     = dungeonRoomList.length;
  const progressPct    = phase === 'exploring' ? Math.round((roomsDone / totalRooms) * 100) : 0;
  const hpPct          = Math.round((playerHp / initialPlayerMaxHp) * 100);
  const mpPct          = Math.round((playerMp / initialPlayerMaxMp) * 100);
  const enemyHpPct     = maxEnemyHp > 0 ? Math.round((enemyHp / maxEnemyHp) * 100) : 0;
  const hpPotions      = potions.filter(p => p.effect.startsWith('heal_') || p.effect.includes('full_rest'));
  const mpPotions      = potions.filter(p => p.effect.startsWith('mana_') && !p.effect.includes('full_rest'));
  const isBossRoom     = currentRoom?.type === 'boss';
  const friendBonus    = Math.min(friendCount * 18, 65);

  const actionLabel = () => {
    if (!currentRoom) return '';
    if (roomOutcome !== null) return 'Continuar →';
    switch (currentRoom.type) {
      case 'combat': case 'boss': return '⚔️ Atacar';
      case 'rescue':   return '🤝 Resgatar';
      case 'treasure': return '📦 Abrir Baú';
      case 'trap':     return '🏃 Desviar';
      case 'rest':     return '💤 Descansar';
      default: return 'Avançar';
    }
  };

  const outcomeColor = roomOutcome === 'success' ? 'text-emerald-400' : roomOutcome === 'failure' ? 'text-red-400' : 'text-yellow-400';
  const outcomeLabel = roomOutcome === 'success' ? '✅ Sucesso!' : roomOutcome === 'failure' ? '❌ Falhou' : '⚠️ Parcial';

  // ── RENDER ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-background/98 overflow-y-auto">
      <div className="max-w-xl mx-auto p-4 pb-24 space-y-4">

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-display font-bold text-purple-300 flex items-center gap-2">
              🏰 {dungeonName}
            </h2>
            {friendCount > 0 && (
              <p className="text-xs text-purple-400 flex items-center gap-1 mt-0.5">
                <Users className="w-3 h-3" /> {friendCount} aliado(s) — +{friendBonus}% de dano
              </p>
            )}
          </div>
          {phase !== 'victory' && phase !== 'defeat' && (
            <button
              onClick={onFlee}
              className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-secondary px-3 py-1.5 text-xs text-muted-foreground hover:text-red-400 hover:border-red-400/40 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Fugir
            </button>
          )}
        </div>

        {/* ── HP / MP BARS ── */}
        {phase !== 'prep' && (
          <div className="rpg-card space-y-2">
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-health font-semibold flex items-center gap-1"><Heart className="w-3 h-3" /> HP</span>
                <span className={`font-bold ${hpPct <= 25 ? 'text-red-400 animate-pulse' : 'text-health'}`}>{playerHp}/{initialPlayerMaxHp}</span>
              </div>
              <div className="h-2.5 rounded-full bg-muted/50 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full transition-all ${hpPct <= 25 ? 'bg-red-500' : hpPct <= 50 ? 'bg-yellow-500' : 'bg-health'}`}
                  animate={{ width: `${hpPct}%` }}
                  transition={{ type: 'spring', stiffness: 200 }}
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-primary font-semibold flex items-center gap-1"><Zap className="w-3 h-3" /> MP</span>
                <span className="text-primary font-bold">{playerMp}/{initialPlayerMaxMp}</span>
              </div>
              <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-primary transition-all"
                  animate={{ width: `${mpPct}%` }}
                  transition={{ type: 'spring', stiffness: 200 }}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── PREP SCREEN ── */}
        {phase === 'prep' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="rpg-card bg-purple-500/10 border-purple-500/30 space-y-3">
              <p className="text-sm text-muted-foreground">Prepare-se para a dungeon. Cada sala oferece perigos e recompensas diferentes. O boss final é extremamente poderoso.</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rpg-card bg-secondary/50">
                  <p className="text-muted-foreground">Salas</p>
                  <p className="font-bold text-foreground mt-1">{totalRooms} + Boss Final</p>
                </div>
                <div className="rpg-card bg-secondary/50">
                  <p className="text-muted-foreground">Boss HP</p>
                  <p className="font-bold text-red-400 mt-1">❤️ {DUNGEON_BOSS[dungeonId]?.hp || 300}</p>
                </div>
                <div className="rpg-card bg-secondary/50">
                  <p className="text-muted-foreground">Recompensa Base</p>
                  <p className="font-bold text-xp mt-1">✨ {DUNGEON_XP[dungeonId]} XP</p>
                  <p className="font-bold text-accent">🪙 {DUNGEON_GOLD[dungeonId]} ouro</p>
                </div>
                <div className="rpg-card bg-secondary/50">
                  <p className="text-muted-foreground">Aliados</p>
                  <p className={`font-bold mt-1 ${friendCount > 0 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                    {friendCount > 0 ? `${friendCount} aliado(s) ⚔️ +${friendBonus}%` : '⚠️ Solo (mais difícil)'}
                  </p>
                </div>
              </div>
            </div>

            {/* Potions available */}
            <div className="rpg-card space-y-2">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-purple-400" />
                Poções disponíveis
              </p>
              {potions.length === 0 ? (
                <p className="text-xs text-yellow-400">⚠️ Sem poções! Compre na Loja antes de entrar.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {potions.map(p => (
                    <span key={p.invId} className="text-xs px-2 py-1 rounded-full bg-muted/50 border border-border/60 text-foreground">
                      {p.icon} {p.name} ×{p.qty}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setAutoPotion(v => !v)}
                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition-colors ${
                    autoPotion ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-muted/30 border-border text-muted-foreground'
                  }`}
                >
                  <Bot className="w-3 h-3" />
                  Auto-poção {autoPotion ? 'ON' : 'OFF'}
                </button>
                <span className="text-[11px] text-muted-foreground">Usa HP poção automaticamente quando HP {'<'} 25%</span>
              </div>
            </div>

            {friendCount === 0 && (
              <div className="rpg-card bg-yellow-500/10 border-yellow-500/30">
                <p className="text-xs text-yellow-300 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>Dungeons são projetadas para grupos! Sem aliados, o boss é muito mais difícil de derrotar. Convide amigos pelo menu de amigos.</span>
                </p>
              </div>
            )}

            <button
              onClick={startDungeon}
              className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-lg transition-colors shadow-lg"
            >
              🗡️ Entrar na Dungeon
            </button>
          </motion.div>
        )}

        {/* ── EXPLORING SCREEN ── */}
        {phase === 'exploring' && currentRoom && (
          <div className="space-y-4">
            {/* Progress */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progresso da Dungeon</span>
                <span>{isBossRoom ? '👹 Boss Final' : `Sala ${roomIdx + 1}/${totalRooms + 1}`}</span>
              </div>
              <div className="h-3 rounded-full bg-muted/50 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${isBossRoom ? 'bg-red-500' : 'bg-purple-500'}`}
                  animate={{ width: isBossRoom ? '100%' : `${progressPct}%` }}
                  transition={{ type: 'spring', stiffness: 120 }}
                />
              </div>
              <div className="flex gap-1 mt-1">
                {allRooms.map((r, i) => (
                  <div
                    key={i}
                    className={`flex-1 h-1.5 rounded-full ${
                      i < roomIdx ? 'bg-emerald-500' :
                      i === roomIdx ? (isBossRoom ? 'bg-red-500' : 'bg-purple-400') :
                      'bg-muted/40'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Room card */}
            <AnimatePresence mode="wait">
              <motion.div
                key={roomIdx}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                className={`rpg-card border ${isBossRoom ? 'border-red-500/40 bg-red-500/5' : 'border-purple-500/30 bg-purple-500/5'}`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-4xl">{currentRoom.icon}</span>
                  <div className="flex-1">
                    <h3 className={`font-display font-bold text-lg ${isBossRoom ? 'text-red-300' : 'text-purple-300'}`}>
                      {currentRoom.name}
                    </h3>
                    {roomOutcome !== null && (
                      <span className={`text-sm font-bold ${outcomeColor}`}>{outcomeLabel}</span>
                    )}
                  </div>
                </div>

                {/* Enemy HP bar */}
                {isCombatRoom && enemyHp > 0 && (
                  <div className="mb-3 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-red-400 font-semibold">{currentRoom.enemy?.icon} {currentRoom.enemy?.name}</span>
                      <span className="text-red-400 font-bold">{enemyHp}/{maxEnemyHp} HP</span>
                    </div>
                    <div className="h-3 rounded-full bg-muted/50 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-red-500"
                        animate={{ width: `${enemyHpPct}%` }}
                        transition={{ type: 'spring', stiffness: 180 }}
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Combat / action log */}
            <div
              ref={logRef}
              className="bg-black/40 border border-border/40 rounded-xl p-3 h-44 overflow-y-auto font-mono text-xs space-y-0.5 scroll-smooth"
            >
              {log.length === 0 && (
                <p className="text-muted-foreground/60 italic">Aguardando ação...</p>
              )}
              {log.map((line, i) => (
                <motion.p
                  key={i}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`leading-relaxed ${
                    line.startsWith('✅') ? 'text-emerald-400' :
                    line.startsWith('❌') || line.startsWith('💀') ? 'text-red-400' :
                    line.startsWith('⚠️') ? 'text-yellow-400' :
                    line.startsWith('📍') ? 'text-purple-300 font-semibold mt-1' :
                    line.startsWith('🎉') ? 'text-yellow-300 font-bold' :
                    line.startsWith('🤖') ? 'text-emerald-300' :
                    line.startsWith('🧪') ? 'text-blue-300' :
                    'text-muted-foreground'
                  }`}
                >
                  {line}
                </motion.p>
              ))}
            </div>

            {/* Potion + Auto buttons */}
            <div className="flex flex-wrap gap-2 items-center">
              {hpPotions.length > 0 && (
                <button
                  onClick={() => usePotion('hp', false)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 transition-colors"
                >
                  <Heart className="w-3 h-3" />
                  HP Poção ×{hpPotions.reduce((s, p) => s + p.qty, 0)}
                </button>
              )}
              {mpPotions.length > 0 && (
                <button
                  onClick={() => usePotion('mp', false)}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-300 hover:bg-blue-500/30 transition-colors"
                >
                  <Zap className="w-3 h-3" />
                  MP Poção ×{mpPotions.reduce((s, p) => s + p.qty, 0)}
                </button>
              )}
              <button
                onClick={() => setAutoPotion(v => !v)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  autoPotion ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' : 'bg-muted/20 border-border text-muted-foreground'
                }`}
              >
                <Bot className="w-3 h-3" />
                Auto {autoPotion ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={() => setShowLootPanel(v => !v)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition-colors ml-auto"
              >
                <Package className="w-3 h-3" />
                Loot ({allLoot.length})
              </button>
            </div>

            {/* Loot collected so far */}
            <AnimatePresence>
              {showLootPanel && allLoot.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rpg-card bg-amber-500/10 border-amber-500/30"
                >
                  <p className="text-xs font-semibold text-amber-300 mb-2">📦 Materiais coletados:</p>
                  <div className="flex flex-wrap gap-2">
                    {allLoot.map(l => (
                      <span key={l.id} className="text-xs px-2 py-1 rounded-full bg-muted/40 border border-border/40 text-foreground">
                        {l.icon} {l.name} ×{l.qty}
                      </span>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action button */}
            <button
              onClick={roomOutcome !== null ? handleContinue : handleAction}
              disabled={phase !== 'exploring'}
              className={`w-full py-3 rounded-xl font-bold text-base transition-colors disabled:opacity-50 ${
                roomOutcome !== null
                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                  : isBossRoom
                  ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20'
                  : 'bg-purple-500/30 hover:bg-purple-500/50 border border-purple-500/50 text-purple-200'
              }`}
            >
              {roomOutcome !== null ? (
                <span className="flex items-center justify-center gap-2">
                  Continuar <ChevronRight className="w-5 h-5" />
                </span>
              ) : (
                actionLabel()
              )}
            </button>
          </div>
        )}

        {/* ── VICTORY SCREEN ── */}
        {phase === 'victory' && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
            <div className="text-center py-6 space-y-2">
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: 2 }}
                className="text-6xl mx-auto"
              >
                🏆
              </motion.div>
              <h2 className="text-2xl font-display font-bold text-yellow-300">Dungeon Conquistada!</h2>
              <p className="text-sm text-muted-foreground">{boss.name} foi derrotado. A masmorra é sua.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rpg-card bg-xp/10 border-xp/30 text-center">
                <p className="text-xs text-muted-foreground">XP Ganho</p>
                <p className="text-2xl font-bold text-xp">+{xpEarned || (DUNGEON_XP[dungeonId] || 200)}</p>
                {rescued > 0 && <p className="text-xs text-emerald-400">+{rescued * 50} bônus de resgate</p>}
              </div>
              <div className="rpg-card bg-accent/10 border-accent/30 text-center">
                <p className="text-xs text-muted-foreground">Ouro Ganho</p>
                <p className="text-2xl font-bold text-accent">+{goldEarned || (DUNGEON_GOLD[dungeonId] || 80)}</p>
              </div>
            </div>

            {rescued > 0 && (
              <div className="rpg-card bg-emerald-500/10 border-emerald-500/30">
                <p className="text-sm text-emerald-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  Você resgatou <strong>{rescued} NPC(s)</strong> ao longo da dungeon!
                </p>
              </div>
            )}

            {allLoot.length > 0 && (
              <div className="rpg-card space-y-2">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-400" />
                  Materiais de Fabricação Coletados
                </p>
                <div className="flex flex-wrap gap-2">
                  {allLoot.map(l => (
                    <div key={l.id} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200">
                      <span className="text-base">{l.icon}</span>
                      <span>{l.name} <strong>×{l.qty}</strong></span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">Itens salvos no inventário para fabricação de equipamentos.</p>
              </div>
            )}

            {isGranting && <p className="text-xs text-center text-muted-foreground animate-pulse">Salvando recompensas...</p>}

            <button
              onClick={() => onVictory({ xpGained: xpEarned, goldGained: goldEarned, loot: allLoot, rescued })}
              disabled={isGranting}
              className="w-full py-3 rounded-xl bg-yellow-500 hover:bg-yellow-600 text-black font-bold text-base transition-colors disabled:opacity-60"
            >
              <Trophy className="w-5 h-5 inline mr-2" />
              Concluir Dungeon
            </button>
          </motion.div>
        )}

        {/* ── DEFEAT SCREEN ── */}
        {phase === 'defeat' && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
            <div className="text-center py-6 space-y-2">
              <span className="text-6xl block">💀</span>
              <h2 className="text-2xl font-display font-bold text-red-400">Derrota!</h2>
              <p className="text-sm text-muted-foreground">Você sucumbiu à escuridão da dungeon...</p>
            </div>

            {allLoot.length > 0 && (
              <div className="rpg-card space-y-2">
                <p className="text-sm font-semibold text-muted-foreground">Materiais que você coletou antes de cair:</p>
                <div className="flex flex-wrap gap-2">
                  {allLoot.map(l => (
                    <span key={l.id} className="text-xs px-2 py-1 rounded-full bg-muted/30 border border-border/30 text-muted-foreground">
                      {l.icon} ×{l.qty}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">Derrota — materiais não salvos.</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onFlee}
                className="flex-1 py-3 rounded-xl border border-border bg-secondary hover:bg-muted text-foreground font-semibold transition-colors"
              >
                Sair
              </button>
              <button
                onClick={() => {
                  setPhase('prep');
                  setRoomIdx(0);
                  setPlayerHp(initialPlayerHp);
                  setPlayerMp(initialPlayerMp);
                  setAllLoot([]);
                  setRescued(0);
                  setPotions(initialPotions);
                  potionsRef.current = initialPotions;
                  setLog([]);
                  setRoomOutcome(null);
                  setXpEarned(0);
                  setGoldEarned(0);
                }}
                className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold transition-colors"
              >
                <Skull className="w-4 h-4 inline mr-1" /> Tentar Novamente
              </button>
            </div>
          </motion.div>
        )}

      </div>
    </div>
  );
}
