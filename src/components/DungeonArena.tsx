import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Zap, ChevronRight, Trophy, Skull, LogOut, Users, Package, FlaskConical, Bot, ShieldCheck, Swords, Copy } from 'lucide-react';
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

type BossFight = {
  primary: EnemyDef & { matk: number };
  secondary?: EnemyDef & { matk: number; enragePrimary?: number };
  secondaryProtects?: boolean; // primary takes 50% dmg while secondary lives
};

type LootDrop = { id: string; name: string; icon: string; qty: number };

export type PotionItem = {
  invId: string;
  name: string;
  effect: string;
  icon: string;
  qty: number;
};

export type SessionPlayer = {
  userId: string;
  displayName: string;
  hp: number;
  maxHp: number;
  level: number;
  atk: number;
  def: number;
  isHost: boolean;
  isAlive: boolean;
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

// ── Scaling helpers ─────────────────────────────────────────────────────────
function scaleHp(base: number, level: number, playerCount: number): number {
  return Math.round(base * (1 + (Math.max(1, level) - 1) * 0.07) * (1 + Math.max(0, playerCount - 1) * 0.22));
}
function scaleAtk(base: number, level: number, playerCount: number): number {
  return Math.round(base * (1 + (Math.max(1, level) - 1) * 0.05) * (1 + Math.max(0, playerCount - 1) * 0.15));
}

// ── Dungeon Configurations ──────────────────────────────────────────────────
type DungeonMeta = {
  atmosphere: string;
  layouts: RoomDef[][];   // 3 layout variants
  boss: BossFight;
  xp: number;
  gold: number;
};

const DUNGEON_DATA: Record<string, DungeonMeta> = {

  // ── DUNGEON 1: COVIL DOS ORCS SELVAGENS ────────────────────────────────
  '1': {
    atmosphere: 'O cheiro de suor, sangue e carne podre impregna o ar úmido da caverna...',
    xp: 240,
    gold: 95,
    layouts: [
      // Layout A — Infiltração
      [
        { type: 'combat',   name: 'Entrada da Caverna',     desc: 'Sentinelas goblin saltam dos arbustos ao som de suas botas!',                                    icon: '🌑', enemy: { name: 'Goblin Sentinela',    icon: '👺', hp: 40,  atk: 9  } },
        { type: 'combat',   name: 'Ninho das Aranhas',       desc: 'Teias brancas encobrem o teto. Aranhas descem lentamente...',                                    icon: '🕸️', enemy: { name: 'Aranha das Cavernas', icon: '🕷️', hp: 55,  atk: 12 } },
        { type: 'rescue',   name: 'Cela dos Cativos',        desc: 'Gritos abafados vêm de trás de grades enferrujadas. Um mercador está acorrentado!',              icon: '🔒', npcName: 'Mercador Capturado' },
        { type: 'combat',   name: 'Acampamento de Guerra',   desc: 'Crânios de inimigos decoram o acampamento. Um orc enfurecido avança gritando!',                  icon: '🏕️', enemy: { name: 'Orc Selvagem',         icon: '🧌', hp: 80,  atk: 18 } },
        { type: 'trap',     name: 'Corredor da Pedra',       desc: 'O piso treme... Uma enorme pedra rola pelo corredor!',                                           icon: '⚠️', trapDmg: 25 },
        { type: 'rest',     name: 'Fonte Corrompida',        desc: 'Uma fonte de água escura brilha com magia estranha, mas parece reconfortante...',                 icon: '💧' },
      ],
      // Layout B — Emboscada
      [
        { type: 'combat',   name: 'Entrada da Caverna',     desc: 'Sentinelas goblin saltam dos arbustos!',                                                          icon: '🌑', enemy: { name: 'Goblin Sentinela',    icon: '👺', hp: 40,  atk: 9  } },
        { type: 'combat',   name: 'Passagem do Slime',       desc: 'A passagem está coberta de slime fétido. Slimes pulam em sua direção!',                           icon: '🟢', enemy: { name: 'Slime Fétido',        icon: '🟢', hp: 30,  atk: 7  } },
        { type: 'trap',     name: 'Armadilha de Redes',      desc: 'Redes cheias de espinhos orc caem do teto sobre você!',                                          icon: '⚠️', trapDmg: 18 },
        { type: 'rescue',   name: 'Cela dos Cativos',        desc: 'Entre os ossos de aventureiros anteriores, um mercador sobrevive acorrentado!',                  icon: '🔒', npcName: 'Mercador Capturado' },
        { type: 'combat',   name: 'Acampamento de Guerra',   desc: 'Um orc selvagem protege o covil do chefe!',                                                      icon: '🏕️', enemy: { name: 'Orc Selvagem',         icon: '🧌', hp: 80,  atk: 18 } },
        { type: 'rest',     name: 'Totem Curativo',          desc: 'Um totem orc com cristal roubado de curandeiro. Você absorve sua energia!',                      icon: '🗿' },
      ],
      // Layout C — Profundezas
      [
        { type: 'combat',   name: 'Entrada da Caverna',     desc: 'Sentinelas goblin saltam dos arbustos!',                                                          icon: '🌑', enemy: { name: 'Goblin Sentinela',    icon: '👺', hp: 40,  atk: 9  } },
        { type: 'combat',   name: 'Fosso dos Zumbis Orc',   desc: 'Orcs mortos se levantam de um fosso escuro, guiados por feitiçaria negra!',                       icon: '🌀', enemy: { name: 'Zumbi Orc',           icon: '🧟', hp: 65,  atk: 14 } },
        { type: 'rescue',   name: 'Cela dos Cativos',        desc: 'Um mercador ferido te olha com olhos cheios de esperança pelas grades!',                         icon: '🔒', npcName: 'Mercador Capturado' },
        { type: 'combat',   name: 'Ninho das Aranhas',       desc: 'Aranhas gigantes descem rapidamente do teto encharcado de teias!',                               icon: '🕸️', enemy: { name: 'Aranha das Cavernas', icon: '🕷️', hp: 55,  atk: 12 } },
        { type: 'trap',     name: 'Corredor da Pedra',       desc: 'Uma pedra colossal rola pelo corredor! Não há como recuar!',                                     icon: '⚠️', trapDmg: 25 },
        { type: 'treasure', name: 'Pilha de Espólio Orc',    desc: 'Itens saqueados de aventureiros anteriores formam uma pilha gloriosa!',                          icon: '💰' },
      ],
    ],
    boss: {
      primary:   { name: 'Shagor, o Grande Orc',   icon: '🧌', hp: 300, atk: 35, matk: 18 },
      secondary: { name: 'Zoth, Chefe dos Goblins', icon: '👺', hp: 160, atk: 22, matk: 12, enragePrimary: 25 },
    },
  },

  // ── DUNGEON 2: TEMPLO DAS AREIAS PERDIDAS ──────────────────────────────
  '2': {
    atmosphere: 'As areias cantam enquanto você penetra nas ruínas milenares... O calor sufocante faz o ar vibrar.',
    xp: 390,
    gold: 145,
    layouts: [
      // Layout A — Câmaras do Templo
      [
        { type: 'combat',   name: 'Portal do Templo',       desc: 'Escorpiões gigantes emergem das dunas internas ao sentir sua presença!',                         icon: '🏺', enemy: { name: 'Escorpião do Deserto', icon: '🦂', hp: 60,  atk: 14 } },
        { type: 'combat',   name: 'Câmara das Múmias',      desc: 'Sarcófagos se abrem sozinhos. Múmias com olhos vazios avançam silenciosamente...',               icon: '⚰️', enemy: { name: 'Múmia Enfaixada',     icon: '🧟', hp: 85,  atk: 18 } },
        { type: 'rescue',   name: 'Câmara Proibida',        desc: 'Um erudito preso por correntes mágicas suplica por ajuda entre os hieróglifos!',                 icon: '📚', npcName: 'Erudito Perdido' },
        { type: 'trap',     name: 'Corredor de Areia',      desc: 'O chão se abre! Uma fossa de areia movediça tenta engolir seus pés!',                            icon: '⚠️', trapDmg: 30 },
        { type: 'combat',   name: 'Câmara do Golem',        desc: 'Um gigante feito de areia animada bloqueia a câmara sagrada com braços imensos!',                icon: '🗿', enemy: { name: 'Golem de Areia',       icon: '🟫', hp: 100, atk: 20 } },
        { type: 'rest',     name: 'Oásis Místico',          desc: 'Um oásis escondido na câmara. A água restaura sua energia como um milagre!',                     icon: '🌴' },
      ],
      // Layout B — Labirinto das Serpenetes
      [
        { type: 'combat',   name: 'Portal do Templo',       desc: 'Escorpiões do deserto emergem das pedras ao som do primeiro passo!',                             icon: '🏺', enemy: { name: 'Escorpião do Deserto', icon: '🦂', hp: 60,  atk: 14 } },
        { type: 'trap',     name: 'Lâminas de Obsidiana',   desc: 'Lâminas de obsidiana disparam das paredes ao menor toque nas runas!',                            icon: '⚠️', trapDmg: 22 },
        { type: 'combat',   name: 'Corredor das Serpentes', desc: 'Uma serpente colossal surge da areia, cuspindo veneno ácido!',                                   icon: '🐍', enemy: { name: 'Serpente de Areia',    icon: '🐍', hp: 70,  atk: 16 } },
        { type: 'rescue',   name: 'Câmara Proibida',        desc: 'O erudito está semienterrado na areia, chamando por socorro freneticamente!',                    icon: '📚', npcName: 'Erudito Perdido' },
        { type: 'combat',   name: 'Câmara dos Servos',      desc: 'Servos mortos do templo caminham em procissão silenciosa. Eles te viram!',                       icon: '⚰️', enemy: { name: 'Zumbi do Templo',      icon: '🧟', hp: 55,  atk: 13 } },
        { type: 'rest',     name: 'Fonte Ancestral',        desc: 'Uma fonte ancestral emana luz dourada. Beba e recupere suas forças...',                          icon: '⭐' },
      ],
      // Layout C — Relicário Profundo
      [
        { type: 'combat',   name: 'Portal do Templo',       desc: 'Escorpiões emergem das pedras ao sentir tua chegada!',                                           icon: '🏺', enemy: { name: 'Escorpião do Deserto', icon: '🦂', hp: 60,  atk: 14 } },
        { type: 'combat',   name: 'Câmara do Golem',        desc: 'Um golem de areia desperta violentamente! O chão treme!',                                        icon: '🗿', enemy: { name: 'Golem de Areia',       icon: '🟫', hp: 100, atk: 20 } },
        { type: 'treasure', name: 'Relicário Antigo',       desc: 'Relíquias do Império Antigo em baús de pedra dourada selados há séculos!',                       icon: '💰' },
        { type: 'rescue',   name: 'Câmara Proibida',        desc: 'O erudito está aprisionado em runas antigas que drenam sua magia lentamente!',                   icon: '📚', npcName: 'Erudito Perdido' },
        { type: 'combat',   name: 'Câmara das Múmias',      desc: 'Múmias guardam o corredor do chefe. Elas não param de se aproximar!',                            icon: '⚰️', enemy: { name: 'Múmia Enfaixada',     icon: '🧟', hp: 85,  atk: 18 } },
        { type: 'trap',     name: 'Fossa de Areia',         desc: 'A areia movediça acelera! Você afunda rapidamente!',                                             icon: '⚠️', trapDmg: 30 },
      ],
    ],
    boss: {
      primary:   { name: 'Esfinge Guardiã',    icon: '🦁', hp: 420, atk: 48, matk: 62 },
      secondary: { name: 'Djinn do Deserto',   icon: '🌪️', hp: 230, atk: 34, matk: 30, enragePrimary: 20 },
    },
  },

  // ── DUNGEON 3: ABISMO DAS SOMBRAS ─────────────────────────────────────
  '3': {
    atmosphere: 'A escuridão aqui é viva. Raios silenciosos rasgam o vazio enquanto sombras sussurram seu nome...',
    xp: 580,
    gold: 210,
    layouts: [
      // Layout A — O Vazio Profundo
      [
        { type: 'combat',   name: 'Portal das Sombras',     desc: 'O escuro se move. Sombras ganharam forma e querem devorar sua alma!',                            icon: '🌑', enemy: { name: 'Sombra Rastejante',   icon: '👤', hp: 70,  atk: 16 } },
        { type: 'combat',   name: 'Corredor dos Espectros', desc: 'Um espectro de olhos brancos emerge do vazio, emitindo um grito silencioso!',                    icon: '👻', enemy: { name: 'Espectro Sombrio',    icon: '👻', hp: 90,  atk: 22 } },
        { type: 'rescue',   name: 'Prisão do Vazio',        desc: 'Um guerreiro corrompido pelo vazio está aprisionado em correntes de sombra. Pode ser salvo!',    icon: '⛓️', npcName: 'Guerreiro Perdido' },
        { type: 'combat',   name: 'Fosso das Trevas',       desc: 'Zumbis corrompidos surgem do chão, pele negra como carvão queimado!',                            icon: '🕳️', enemy: { name: 'Zumbi das Trevas',     icon: '🧟', hp: 75,  atk: 18 } },
        { type: 'combat',   name: 'Ninho do Wyvern',        desc: 'Um Wyvern jovem mas letal protege o corredor! Seus raios são mortais!',                          icon: '⚡', enemy: { name: 'Wyvern Juvenil',      icon: '🐉', hp: 110, atk: 25 } },
        { type: 'rest',     name: 'Brasa das Trevas',       desc: 'Uma brasa persistente no meio do vazio. O calor reconforta sua alma ferida...',                  icon: '🔥' },
      ],
      // Layout B — Sombras Corrompidas
      [
        { type: 'combat',   name: 'Portal das Sombras',     desc: 'Sombras ganham forma e atacam imediatamente!',                                                   icon: '🌑', enemy: { name: 'Sombra Rastejante',   icon: '👤', hp: 70,  atk: 16 } },
        { type: 'combat',   name: 'Covil dos Zumbis',       desc: 'Zumbis das trevas sobem de um fosso profundo, emitindo sons guturais!',                          icon: '🕳️', enemy: { name: 'Zumbi das Trevas',     icon: '🧟', hp: 75,  atk: 18 } },
        { type: 'trap',     name: 'Câmara das Correntes',   desc: 'Correntes sombrias disparam das paredes, drenando sua força vital!',                             icon: '⚠️', trapDmg: 35 },
        { type: 'rescue',   name: 'Prisão do Vazio',        desc: 'O guerreiro perdido te olha com olhos meio corrompidos, mas ainda humanos!',                     icon: '⛓️', npcName: 'Guerreiro Perdido' },
        { type: 'combat',   name: 'Corredor dos Espectros', desc: 'Espectros sombrios surgem das paredes cristalizadas de sombra!',                                 icon: '👻', enemy: { name: 'Espectro Sombrio',    icon: '👻', hp: 90,  atk: 22 } },
        { type: 'rest',     name: 'Altar Profano',          desc: 'Um altar sombrio. Ao tocá-lo, energia estranha e fria cura suas feridas...',                     icon: '🕯️' },
      ],
      // Layout C — Criaturas do Vazio
      [
        { type: 'combat',   name: 'Portal das Sombras',     desc: 'Criaturas sem forma emergem do vazio entre os mundos!',                                          icon: '🌑', enemy: { name: 'Criatura do Vazio',    icon: '🌀', hp: 95,  atk: 20 } },
        { type: 'combat',   name: 'Emboscada Espectral',    desc: 'Espectros te emboscam em um corredor estreito de pedra negra!',                                  icon: '👻', enemy: { name: 'Espectro Sombrio',    icon: '👻', hp: 90,  atk: 22 } },
        { type: 'rescue',   name: 'Prisão do Vazio',        desc: 'O guerreiro perdido está semiconsciente nas correntes de vazio!',                                 icon: '⛓️', npcName: 'Guerreiro Perdido' },
        { type: 'combat',   name: 'Covil dos Zumbis',       desc: 'Zumbis das trevas emergem das sombras com força sobre-humana!',                                  icon: '🕳️', enemy: { name: 'Zumbi das Trevas',     icon: '🧟', hp: 75,  atk: 18 } },
        { type: 'combat',   name: 'Ninho do Wyvern',        desc: 'Um Wyvern juvenil protege a passagem com raios implacáveis de energia sombria!',                 icon: '⚡', enemy: { name: 'Wyvern Juvenil',      icon: '🐉', hp: 110, atk: 25 } },
        { type: 'trap',     name: 'Fissura do Vazio',       desc: 'O piso desaparece! Você cai no vazio antes de se agarrar à borda por um fio!',                   icon: '⚠️', trapDmg: 28 },
      ],
    ],
    boss: {
      primary:          { name: 'Cavaleiro do Vazio',   icon: '🗡️', hp: 520, atk: 58, matk: 32 },
      secondary:        { name: 'Wyvern Relâmpago',     icon: '⚡', hp: 310, atk: 50, matk: 38, enragePrimary: 30 },
      secondaryProtects: true, // Cavaleiro takes 50% dmg while Wyvern is alive
    },
  },
};

// Backwards-compat helpers (used in victory/prep screens)
function getDungeonXp(id: string):   number { return DUNGEON_DATA[id]?.xp   ?? 200; }
function getDungeonGold(id: string): number { return DUNGEON_DATA[id]?.gold  ?? 80;  }
function getDungeonBoss(id: string): EnemyDef & { matk: number } {
  return DUNGEON_DATA[id]?.boss.primary ?? { name: 'Boss Final', icon: '👹', hp: 300, atk: 30, matk: 20 };
}

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
  // Co-op props (optional)
  sessionId?: string;
  sessionPlayers?: SessionPlayer[];
  isHost?: boolean;
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
  sessionId,
  sessionPlayers,
  isHost = true,
}: DungeonArenaProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Compute dungeon data ─────────────────────────────────────────────
  const dungeonMeta   = DUNGEON_DATA[dungeonId] ?? DUNGEON_DATA['1'];
  const playerCount   = sessionPlayers ? sessionPlayers.length : (1 + Math.max(0, friendCount));
  const aliveAllies   = sessionPlayers ? sessionPlayers.filter(p => !p.isHost && p.isAlive).length : friendCount;

  // Randomly pick a layout once (computed on mount via lazy useState)
  const [layoutIndex] = useState<number>(() => Math.floor(Math.random() * 3));
  const baseRooms     = dungeonMeta.layouts[layoutIndex] ?? dungeonMeta.layouts[0];

  // Scale rooms to player level + party size
  const dungeonRoomList: RoomDef[] = baseRooms.map(room => room.enemy
    ? { ...room, enemy: { ...room.enemy, hp: scaleHp(room.enemy.hp, playerLevel, playerCount), atk: scaleAtk(room.enemy.atk, playerLevel, playerCount) } }
    : room
  );

  const boss         = getDungeonBoss(dungeonId);
  const bossFight    = dungeonMeta.boss;
  const scaledPrimary: EnemyDef & { matk: number } = {
    ...bossFight.primary,
    hp:  scaleHp(bossFight.primary.hp,  playerLevel, playerCount),
    atk: scaleAtk(bossFight.primary.atk, playerLevel, playerCount),
    matk: scaleAtk(bossFight.primary.matk, playerLevel, playerCount),
  };
  const scaledSecondary = bossFight.secondary ? {
    ...bossFight.secondary,
    hp:  scaleHp(bossFight.secondary.hp,  playerLevel, playerCount),
    atk: scaleAtk(bossFight.secondary.atk, playerLevel, playerCount),
    matk: scaleAtk(bossFight.secondary.matk, playerLevel, playerCount),
  } : undefined;

  const bossRoomDef: RoomDef = {
    type:  'boss',
    name:  scaledSecondary
      ? `Boss Final — ${scaledSecondary.name} & ${scaledPrimary.name}`
      : `Boss Final — ${scaledPrimary.name}`,
    desc:  scaledSecondary
      ? `A câmara treme! ${scaledSecondary.name} e ${scaledPrimary.name} aguardam. ${bossFight.secondaryProtects ? `⚠️ Derrote ${scaledSecondary.name} primeiro — ${scaledPrimary.name} está sendo protegido!` : `Foque ${scaledSecondary.name} primeiro!`}`
      : `A câmara treme com a presença de ${scaledPrimary.name}. Este é o momento da verdade.`,
    icon:  scaledSecondary ? '⚔️' : scaledPrimary.icon,
    enemy: { ...scaledPrimary },
  };
  const allRooms: RoomDef[] = [...dungeonRoomList, bossRoomDef];

  // Realtime co-op channel ref
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── State ──────────────────────────────────────────────────────────────
  const [phase, setPhase]             = useState<DungeonPhase>('prep');
  const [roomIdx, setRoomIdx]         = useState(0);
  const [playerHp, setPlayerHp]       = useState(initialPlayerHp);
  const [playerMp, setPlayerMp]       = useState(initialPlayerMp);
  const [enemyHp, setEnemyHp]         = useState(0);
  const [boss2Hp, setBoss2Hp]         = useState(0);      // secondary boss HP
  const [bossEnraged, setBossEnraged] = useState(false);  // primary enrages when secondary dies
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
  const [coopLog, setCoopLog]         = useState<string[]>([]);  // extra co-op entries

  const logRef = useRef<HTMLDivElement>(null);
  const potionsRef = useRef<PotionItem[]>(initialPotions);
  useEffect(() => { potionsRef.current = potions; }, [potions]);
  const autoPotionRef = useRef(true);
  useEffect(() => { autoPotionRef.current = autoPotion; }, [autoPotion]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // ── Co-op Realtime channel ─────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase.channel(`dungeon_combat:${sessionId}`, { config: { broadcast: { self: false } } });
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'action_result' }, ({ payload }: any) => {
        if (isHost) return; // host already applied locally
        // Non-host: sync enemy HP and log from host
        if (payload.enemyHp    !== undefined) setEnemyHp(payload.enemyHp);
        if (payload.boss2Hp    !== undefined) setBoss2Hp(payload.boss2Hp);
        if (payload.bossEnraged !== undefined) setBossEnraged(payload.bossEnraged);
        if (payload.roomOutcome !== undefined) setRoomOutcome(payload.roomOutcome);
        if (payload.phase       !== undefined && payload.phase !== 'exploring') setPhase(payload.phase);
        if (payload.logLines) setLog(prev => [...prev, ...payload.logLines]);
      })
      .on('broadcast', { event: 'room_change' }, ({ payload }: any) => {
        if (isHost) return;
        setRoomIdx(payload.roomIdx);
        setRoomOutcome(null);
        setLog([`📍 ${payload.roomName}`, `   ${payload.roomDesc}`]);
        if (payload.enemyHp !== undefined) setEnemyHp(payload.enemyHp);
        if (payload.boss2Hp !== undefined) setBoss2Hp(payload.boss2Hp);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); channelRef.current = null; };
  }, [sessionId, isHost]);

  // Helper: broadcast to co-op channel
  const broadcastAction = useCallback((event: string, payload: Record<string, unknown>) => {
    if (!sessionId || !isHost || !channelRef.current) return;
    channelRef.current.send({ type: 'broadcast', event, payload }).catch(() => {});
  }, [sessionId, isHost]);

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
    // Boss room: initialise dual boss HP
    if (room.type === 'boss' && scaledSecondary) {
      setEnemyHp(scaledPrimary.hp);
      setBoss2Hp(scaledSecondary.hp);
      setBossEnraged(false);
    } else {
      setBoss2Hp(0);
      setBossEnraged(false);
    }
    broadcastAction('room_change', {
      roomIdx: idx,
      roomName: room.name,
      roomDesc: room.desc,
      enemyHp: room.enemy?.hp ?? 0,
      boss2Hp: (room.type === 'boss' && scaledSecondary) ? scaledSecondary.hp : 0,
    });
  }, [allRooms, scaledPrimary, scaledSecondary, broadcastAction]);

  // ── Action handler (one round / one action per click) ──────────────────
  const handleAction = useCallback(() => {
    if (!isHost) return;  // only host drives combat in co-op
    const room = allRooms[roomIdx];
    const isCombat = room.type === 'combat' || room.type === 'boss';
    const isBoss   = room.type === 'boss';

    if (isCombat) {
      // Combined ATK from entire alive party
      const baseAtk = sessionPlayers
        ? sessionPlayers.filter(p => p.isAlive).reduce((s, p) => s + p.atk, 0)
        : playerAtk;
      const friendBonus   = sessionPlayers ? 0 : Math.min(friendCount * 0.18, 0.65);
      const effAtk        = Math.round(baseAtk * (sessionPlayers ? 1 : (1 + friendBonus)));

      const pRoll = d(20);
      const eRoll = d(20);
      const crit  = pRoll === 20;

      // ── DUAL BOSS: target secondary first ──────────────────────────
      if (isBoss && scaledSecondary && boss2Hp > 0) {
        const basePDmg = Math.max(1, Math.round((pRoll * effAtk) / 15));
        const pDmg     = crit ? basePDmg * 2 : basePDmg;
        const newLog: string[] = [];

        setBoss2Hp(prev => {
          const newB2Hp = Math.max(0, prev - pDmg);
          newLog.push(`⚔️ Você atacou ${scaledSecondary.name} — rolou ${pRoll}${crit ? ' 💥CRÍTICO' : ''} → ${pDmg} dano! (${newB2Hp} HP)`);

          if (newB2Hp <= 0) {
            // Secondary dies — primary enrages
            newLog.push(`💀 ${scaledSecondary.name} foi derrotado!`);
            if (scaledSecondary.enragePrimary) {
              newLog.push(`😡 ${scaledPrimary.name} ENFURECEU! +${scaledSecondary.enragePrimary}% de ATK!`);
            }
            setBossEnraged(true);
            const loot = rollLoot(2);
            setAllLoot(al => mergeLoot(al, loot));
            loot.forEach(l => newLog.push(`   📦 +${l.qty}x ${l.icon} ${l.name}`));
          } else {
            // Secondary retaliates
            const enrageAtk = scaledSecondary.atk;
            const rawEDmg = Math.max(1, Math.round((eRoll * enrageAtk) / 15) - Math.floor(playerDef / 6));
            newLog.push(`👹 ${scaledSecondary.name} rolou ${eRoll} → ${rawEDmg} dano em você!`);
            setPlayerHp(ph => {
              const newHp = Math.max(0, ph - rawEDmg);
              newLog.push(`   ❤️ Seu HP: ${newHp}/${initialPlayerMaxHp}`);
              if (newHp <= 0) {
                newLog.push(`💀 Você foi derrotado por ${scaledSecondary.name}...`);
                setRoomOutcome('failure');
                setTimeout(() => setPhase('defeat'), 800);
              } else if (autoPotionRef.current && newHp <= initialPlayerMaxHp * 0.25) {
                setTimeout(() => { const h = usePotion('hp', true); if (!h) addLog('⚠️ Sem poções de HP!'); }, 100);
              }
              return newHp;
            });
          }
          setTimeout(() => newLog.forEach(l => addLog(l)), 0);
          broadcastAction('action_result', { enemyHp, boss2Hp: newB2Hp, bossEnraged: newB2Hp <= 0, roomOutcome: newB2Hp <= 0 ? null : roomOutcome, logLines: newLog });
          return newB2Hp;
        });
        return;
      }

      // ── PRIMARY BOSS OR REGULAR COMBAT ─────────────────────────────
      const enrageMult  = bossEnraged && scaledSecondary?.enragePrimary ? 1 + scaledSecondary.enragePrimary / 100 : 1;
      const enemyAtkEff = Math.round((room.enemy?.atk ?? 15) * enrageMult);

      // If secondaryProtects and secondary alive → primary takes 50% dmg
      const protectionFactor = (isBoss && bossFight.secondaryProtects && boss2Hp > 0) ? 0.5 : 1;
      const basePDmg = Math.max(1, Math.round((pRoll * effAtk) / 15));
      const pDmg     = Math.round((crit ? basePDmg * 2 : basePDmg) * protectionFactor);

      const newLogLines: string[] = [];

      setEnemyHp(prev => {
        const newEnemyHp = Math.max(0, prev - pDmg);
        newLogLines.push(
          protectionFactor < 1
            ? `⚔️ ${scaledPrimary.name} está sendo protegido! ${pDmg} dano (50% absorvido). HP: ${newEnemyHp}`
            : `⚔️ Você rolou ${pRoll}${crit ? ' 💥CRÍTICO' : ''} → ${pDmg} de dano! (${room.enemy?.name}: ${newEnemyHp} HP)`
        );

        if (newEnemyHp <= 0) {
          newLogLines.push(`✅ ${room.enemy?.name} derrotado!`);
          if (isBoss) newLogLines.push(`🏆 Boss Final eliminado! A masmorra é sua!`);
          const loot = rollLoot(isBoss ? 4 : 2);
          setAllLoot(al => mergeLoot(al, loot));
          loot.forEach(l => newLogLines.push(`   📦 +${l.qty}x ${l.icon} ${l.name}`));
          setRoomOutcome('success');
          if (isBoss) { setTimeout(() => setPhase('victory'), 800); }
          setTimeout(() => newLogLines.forEach(l => addLog(l)), 0);
          broadcastAction('action_result', { enemyHp: 0, boss2Hp, bossEnraged, roomOutcome: 'success', phase: isBoss ? 'victory' : 'exploring', logLines: newLogLines });
          return 0;
        }

        // Enemy attacks back
        const rawEDmg = Math.max(1, Math.round((eRoll * enemyAtkEff) / 15) - Math.floor(playerDef / 6));
        const eDmg = Math.max(1, rawEDmg);
        if (bossEnraged) newLogLines.push(`😡 [ENFURECIDO] ${room.enemy?.name} rolou ${eRoll} → ${eDmg} dano!`);
        else newLogLines.push(`👹 ${room.enemy?.name} rolou ${eRoll} → ${eDmg} de dano em você!`);

        setPlayerHp(ph => {
          const newHp = Math.max(0, ph - eDmg);
          newLogLines.push(`   ❤️ Seu HP: ${newHp}/${initialPlayerMaxHp}`);
          if (newHp <= 0) {
            newLogLines.push(`💀 Você foi derrotado por ${room.enemy?.name}...`);
            setRoomOutcome('failure');
            setTimeout(() => setPhase('defeat'), 800);
          } else if (autoPotionRef.current && newHp <= initialPlayerMaxHp * 0.25) {
            setTimeout(() => { const h = usePotion('hp', true); if (!h) addLog('⚠️ Sem poções de HP! Situação crítica!'); }, 100);
          }
          return newHp;
        });

        setTimeout(() => newLogLines.forEach(l => addLog(l)), 0);
        broadcastAction('action_result', { enemyHp: newEnemyHp, boss2Hp, bossEnraged, roomOutcome, logLines: newLogLines });
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
            setTimeout(() => { const h = usePotion('hp', true); if (!h) addLog('⚠️ Sem poções de HP!'); }, 100);
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
  }, [allRooms, roomIdx, playerAtk, playerDef, playerLevel, friendCount, sessionPlayers, boss2Hp, bossEnraged, scaledPrimary, scaledSecondary, bossFight, initialPlayerMaxHp, initialPlayerMaxMp, addLog, usePotion, broadcastAction, enemyHp, roomOutcome, isHost]);

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
    const totalXp   = getDungeonXp(dungeonId)   + rescuedBonus;
    const copperQty = allLoot.find(l => l.id === 'moeda_cobre')?.qty || 0;
    const totalGold = getDungeonGold(dungeonId) + Math.floor(copperQty * 0.5);

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
  const maxBoss2Hp     = scaledSecondary?.hp || 1;
  const combatOngoing  = isCombatRoom && enemyHp > 0 && roomOutcome === null;
  const roomsDone      = Math.min(roomIdx, dungeonRoomList.length);
  const totalRooms     = dungeonRoomList.length;
  const progressPct    = phase === 'exploring' ? Math.round((roomsDone / totalRooms) * 100) : 0;
  const hpPct          = Math.round((playerHp / initialPlayerMaxHp) * 100);
  const mpPct          = Math.round((playerMp / initialPlayerMaxMp) * 100);
  const enemyHpPct     = maxEnemyHp > 0 ? Math.round((enemyHp / maxEnemyHp) * 100) : 0;
  const boss2HpPct     = maxBoss2Hp > 0 ? Math.round((boss2Hp / maxBoss2Hp) * 100) : 0;
  const hpPotions      = potions.filter(p => p.effect.startsWith('heal_') || p.effect.includes('full_rest'));
  const mpPotions      = potions.filter(p => p.effect.startsWith('mana_') && !p.effect.includes('full_rest'));
  const isBossRoom     = currentRoom?.type === 'boss';
  const friendBonus    = sessionPlayers
    ? Math.min(aliveAllies * 18, 65)
    : Math.min(friendCount * 18, 65);
  const isDualBoss     = isBossRoom && !!scaledSecondary;

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
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Users className="w-3 h-3" /> {aliveAllies > 0 ? `${aliveAllies} aliado(s) — +${friendBonus}% de dano` : (sessionId ? 'Aguardando aliados...' : `${friendCount} aliado(s) — +${friendBonus}% de dano`)}
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
              {dungeonMeta.atmosphere && (
                <p className="text-xs text-purple-300 italic border-b border-purple-500/20 pb-2">&quot;{dungeonMeta.atmosphere}&quot;</p>
              )}
              <p className="text-sm text-muted-foreground">Prepare-se para a dungeon. Cada sala oferece perigos e recompensas diferentes. O boss final é extremamente poderoso.</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rpg-card bg-secondary/50">
                  <p className="text-muted-foreground">Salas</p>
                  <p className="font-bold text-foreground mt-1">{totalRooms} + Boss Final</p>
                  <p className="text-[11px] text-purple-400">Layout {layoutIndex + 1}/3 (aleatório)</p>
                </div>
                <div className="rpg-card bg-secondary/50">
                  <p className="text-muted-foreground">Boss HP</p>
                  {isDualBoss ? (
                    <>
                      <p className="font-bold text-red-400 mt-1">⚔️ Boss duplo!</p>
                      <p className="text-[11px] text-muted-foreground">{scaledSecondary?.name} ❤️{scaledSecondary?.hp}</p>
                      <p className="text-[11px] text-muted-foreground">{scaledPrimary.name} ❤️{scaledPrimary.hp}</p>
                    </>
                  ) : (
                    <p className="font-bold text-red-400 mt-1">❤️ {scaledPrimary.hp}</p>
                  )}
                </div>
                <div className="rpg-card bg-secondary/50">
                  <p className="text-muted-foreground">Recompensa Base</p>
                  <p className="font-bold text-xp mt-1">✨ {getDungeonXp(dungeonId)} XP</p>
                  <p className="font-bold text-accent">🪙 {getDungeonGold(dungeonId)} ouro</p>
                </div>
                <div className="rpg-card bg-secondary/50">
                  <p className="text-muted-foreground">Grupo</p>
                  <p className={`font-bold mt-1 ${playerCount > 1 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                    {playerCount > 1 ? `${playerCount} jogadores ⚔️ +${friendBonus}%` : '⚠️ Solo (mais difícil)'}
                  </p>
                  {playerCount > 1 && <p className="text-[11px] text-orange-400">Boss escalado p/ {playerCount} jogadores!</p>}
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

            {playerCount === 1 && (
              <div className="rpg-card bg-yellow-500/10 border-yellow-500/30">
                <p className="text-xs text-yellow-300 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>Dungeons são projetadas para grupos! Solo é muito mais difícil. Crie uma sessão co-op e convide amigos!</span>
                </p>
              </div>
            )}

            {/* Co-op roster */}
            {sessionPlayers && sessionPlayers.length > 0 && (
              <div className="rpg-card space-y-2">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" />
                  Grupo ({sessionPlayers.length}/4)
                </p>
                <div className="flex flex-col gap-1.5">
                  {sessionPlayers.map(p => (
                    <div key={p.userId} className="flex items-center gap-2 text-xs">
                      <span className={p.isHost ? 'text-yellow-400' : 'text-purple-300'}>
                        {p.isHost ? '👑' : '⚔️'} {p.displayName}
                      </span>
                      <span className="text-muted-foreground ml-auto">Lv.{p.level} · ATK {p.atk}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={startDungeon}
              disabled={!isHost}
              className={`w-full py-3 rounded-xl font-bold text-lg transition-colors shadow-lg ${isHost ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
            >
              {isHost ? '🗡️ Entrar na Dungeon' : '⏳ Aguardando o host iniciar...'}
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
                  <div className="mb-3 space-y-2">
                    {/* Secondary boss (target first) */}
                    {isDualBoss && boss2Hp > 0 && (
                      <div className="space-y-1 p-2 rounded-lg bg-orange-500/10 border border-orange-500/30">
                        <div className="flex justify-between text-xs">
                          <span className="text-orange-400 font-semibold flex items-center gap-1">
                            {scaledSecondary?.icon} {scaledSecondary?.name}
                            <span className="text-[10px] text-orange-300 ml-1">← ATACAR PRIMEIRO</span>
                          </span>
                          <span className="text-orange-400 font-bold">{boss2Hp}/{maxBoss2Hp} HP</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-muted/50 overflow-hidden">
                          <motion.div className="h-full rounded-full bg-orange-500" animate={{ width: `${boss2HpPct}%` }} transition={{ type: 'spring', stiffness: 180 }} />
                        </div>
                      </div>
                    )}
                    {isDualBoss && boss2Hp <= 0 && scaledSecondary && (
                      <div className="text-xs text-muted-foreground line-through px-2">💀 {scaledSecondary.name} — derrotado</div>
                    )}
                    {/* Primary enemy */}
                    <div className={`space-y-1 ${isDualBoss ? 'p-2 rounded-lg bg-red-500/10 border border-red-500/30' : ''}`}>
                      <div className="flex justify-between text-xs">
                        <span className={`font-semibold flex items-center gap-1 ${bossEnraged ? 'text-red-300 animate-pulse' : 'text-red-400'}`}>
                          {currentRoom.enemy?.icon} {currentRoom.enemy?.name}
                          {bossEnraged && <span className="text-[10px] text-red-200 ml-1">😡 ENFURECIDO</span>}
                        </span>
                        <span className="text-red-400 font-bold">{enemyHp}/{maxEnemyHp} HP</span>
                      </div>
                      <div className="h-3 rounded-full bg-muted/50 overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${bossEnraged ? 'bg-red-400' : 'bg-red-500'}`}
                          animate={{ width: `${enemyHpPct}%` }}
                          transition={{ type: 'spring', stiffness: 180 }}
                        />
                      </div>
                      {isDualBoss && bossFight.secondaryProtects && boss2Hp > 0 && (
                        <p className="text-[10px] text-yellow-400">🛡️ Protegido pelo {scaledSecondary?.name} — dano reduzido 50%!</p>
                      )}
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
              disabled={phase !== 'exploring' || (!isHost && sessionId !== undefined)}
              className={`w-full py-3 rounded-xl font-bold text-base transition-colors disabled:opacity-50 ${
                (!isHost && sessionId) ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : roomOutcome !== null
                ? 'bg-purple-600 hover:bg-purple-700 text-white'
                : isBossRoom
                ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20'
                : 'bg-purple-500/30 hover:bg-purple-500/50 border border-purple-500/50 text-purple-200'
              }`}
            >
              {(!isHost && sessionId) ? (
                <span className="flex items-center justify-center gap-2">
                  <Users className="w-4 h-4" /> Aguardando host agir...
                </span>
              ) : roomOutcome !== null ? (
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
              <p className="text-sm text-muted-foreground">{scaledPrimary.name} foi derrotado. A masmorra é sua.</p>
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
