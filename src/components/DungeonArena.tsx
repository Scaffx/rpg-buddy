import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Zap, ChevronRight, Trophy, Skull, LogOut, Users, Package, FlaskConical, Bot, ShieldCheck, Swords, Copy, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useRecordPartnership, useDungeonPartnerships, getBondTier, BOND_TIERS, runsToNextTier } from '@/hooks/useDungeonPartnerships';

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

// ── Room Modifiers ─────────────────────────────────────────────────────────
type ModifierKind =
  | 'sagrado'          // ✨ blessing: enemy hp -20%
  | 'eco_cura'         // 💚 blessing: +8% HP on room clear
  | 'recompensa_dupla' // 💰 blessing: loot doubled
  | 'porta_secreta'    // 🚪 blessing: +1 extra loot item
  | 'bencao_heroi'     // ⭐ blessing: first attack is guaranteed crit
  | 'amaldicoado'      // 💀 curse: enemy +20% HP and ATK
  | 'eco_veneno'       // ☠️  curse: lose 6% max HP on room entry
  | 'escuridao'        // 🌑 curse: attack dice -3
  | 'sangramento'      // 🩸 curse: enemy deals +5 flat dmg per hit
  | 'armadilha_oculta';// ⚙️  curse: trap damage +50%

type RoomModifier = { kind: ModifierKind; label: string; icon: string; desc: string; isCurse: boolean };

const ROOM_MODIFIER_POOL: RoomModifier[] = [
  // Curses
  { kind: 'amaldicoado',      label: 'Sala Amaldiçoada',   icon: '💀', desc: 'Inimigo mais poderoso: +20% HP e ATK.',              isCurse: true  },
  { kind: 'eco_veneno',       label: 'Eco de Veneno',       icon: '☠️',  desc: 'Veneno ao entrar: perde 6% do HP máximo.',           isCurse: true  },
  { kind: 'escuridao',        label: 'Escuridão Total',     icon: '🌑', desc: 'Visibilidade zero: -3 nos dados de ataque.',          isCurse: true  },
  { kind: 'sangramento',      label: 'Aura de Sangramento', icon: '🩸', desc: 'Cada golpe inimigo causa +5 de dano extra.',          isCurse: true  },
  { kind: 'armadilha_oculta', label: 'Armadilha Oculta',   icon: '⚙️',  desc: 'Armadilha camuflada: dano +50% se ativada.',         isCurse: true  },
  // Blessings
  { kind: 'sagrado',          label: 'Sala Sagrada',        icon: '✨', desc: 'Luz divina enfraquece o inimigo: -20% de HP.',        isCurse: false },
  { kind: 'eco_cura',         label: 'Eco de Cura',         icon: '💚', desc: 'Energia restauradora: +8% HP ao limpar a sala.',      isCurse: false },
  { kind: 'recompensa_dupla', label: 'Recompensa Dupla',    icon: '💰', desc: 'Sala abençoada: loot dobrado ao vencer.',             isCurse: false },
  { kind: 'porta_secreta',    label: 'Porta Secreta',       icon: '🚪', desc: 'Passagem oculta: +1 item garantido.',                 isCurse: false },
  { kind: 'bencao_heroi',     label: 'Bênção do Herói',     icon: '⭐', desc: 'Energia ancestral: primeiro ataque é crítico.',       isCurse: false },
];

function generateModifiers(totalRooms: number): (RoomModifier | null)[] {
  return Array.from({ length: totalRooms }, (_, i) => {
    const isBoss = i === totalRooms - 1;
    if (Math.random() > (isBoss ? 0.60 : 0.38)) return null;
    const cursePct = isBoss ? 0.65 : 0.50;
    const pool = ROOM_MODIFIER_POOL.filter(m => m.isCurse === (Math.random() < cursePct));
    const filtered = isBoss ? pool.filter(m => m.kind !== 'armadilha_oculta') : pool;
    if (!filtered.length) return null;
    return filtered[Math.floor(Math.random() * filtered.length)];
  });
}

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

// ── Battle history ─────────────────────────────────────────────────────────
export type BattleRound = {
  round:     number;
  enemyName: string;
  pRoll:     number;
  eRoll:     number;
  pDmg:      number;
  eDmg:      number;
  crit:      boolean;
};

type BattleStats = {
  totalRounds:    number;
  totalDmgDealt:  number;
  totalDmgTaken:  number;
  roundHistory:   BattleRound[];
};

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

  // ── PORTAL AZUL (nível 1-15) ──────────────────────────────
  'portal_blue': {
    atmosphere: 'Uma fenda azulada pulsa no ar. Seres dimensionais aguardam do outro lado...',
    xp: 350, gold: 140,
    layouts: [
      [
        { type: 'combat',   name: 'Antecâmara Azul',      desc: 'Elementais de éter saltam das paredes cristalinas!',                                icon: '🔵', enemy: { name: 'Elemental de Éter',   icon: '💧', hp: 60,  atk: 13 } },
        { type: 'trap',     name: 'Corredor de Espelhos',  desc: 'Os espelhos refletem ilusões. Uma armadilha de luz te cega momentaneamente!',       icon: '🪞', trapDmg: 20 },
        { type: 'combat',   name: 'Salão dos Fragmentos',  desc: 'Criaturas do portal formadas de energia bruta avançam!',                            icon: '💎', enemy: { name: 'Guardião do Fragmento', icon: '🔷', hp: 80,  atk: 16 } },
        { type: 'rest',     name: 'Nexo de Restauração',   desc: 'Uma fonte de energia dimensional pulsa suavemente, curando feridas...',             icon: '✨' },
        { type: 'combat',   name: 'Câmara do Portal',      desc: 'Um golem de cristal azul protege a passagem para o boss!',                          icon: '🔮', enemy: { name: 'Golem Cristalino',    icon: '🗿', hp: 100, atk: 19 } },
        { type: 'treasure', name: 'Câmara do Tesouro',     desc: 'Baú dimensional brilha com energia contida!',                                      icon: '📦' },
      ],
      [
        { type: 'combat',   name: 'Limiar Dimensional',    desc: 'Sentinelas etéreas formam barreira ao seu avanço!',                                  icon: '🔵', enemy: { name: 'Sentinela Etérea',    icon: '👻', hp: 55,  atk: 12 } },
        { type: 'combat',   name: 'Corredor Energizado',   desc: 'Arcanistas do portal lançam raios de energia dimensional!',                          icon: '⚡', enemy: { name: 'Arcanista Portal',   icon: '🧙', hp: 70,  atk: 15 } },
        { type: 'rescue',   name: 'Câmara da Névoa',       desc: 'Um aventureiro preso em cristal dimensional grita por ajuda!',                       icon: '🌫️', npcName: 'Aventureiro Aprisionado' },
        { type: 'trap',     name: 'Armadilha de Energias', desc: 'Fios de energia dimensional cruzam o corredor invisíveis!',                          icon: '⚠️', trapDmg: 22 },
        { type: 'combat',   name: 'Sala do Guardião',      desc: 'O guardião do portal não permite passagem sem luta!',                                icon: '🔮', enemy: { name: 'Guardião Azul',       icon: '🛡️', hp: 95,  atk: 18 } },
        { type: 'rest',     name: 'Nexo Tranquilo',        desc: 'Energia restauradora flui por este nexo esquecido...',                               icon: '✨' },
      ],
      [
        { type: 'combat',   name: 'Antecâmara Azul',      desc: 'Elementais de éter saltam das paredes cristalinas!',                                 icon: '🔵', enemy: { name: 'Elemental de Éter',   icon: '💧', hp: 60,  atk: 13 } },
        { type: 'rescue',   name: 'Câmara Aprisionada',    desc: 'Vozes ecoam atrás de uma parede de energia cristalizada!',                           icon: '🔒', npcName: 'Mercador Dimensional' },
        { type: 'combat',   name: 'Corredor da Refração',  desc: 'Criaturas de luz refletida se multiplicam conforme avançam!',                        icon: '💫', enemy: { name: 'Reflexo Vivo',        icon: '🌟', hp: 75,  atk: 14 } },
        { type: 'trap',     name: 'Fissura de Energia',    desc: 'O solo racha liberando rajadas de energia dimensional!',                             icon: '⚠️', trapDmg: 18 },
        { type: 'treasure', name: 'Câmara do Tesouro',     desc: 'Baú dimensional brilha com energia contida!',                                       icon: '📦' },
        { type: 'combat',   name: 'Sala do Guardião',      desc: 'O guardião do portal não permite passagem sem luta!',                                icon: '🔮', enemy: { name: 'Guardião Azul',       icon: '🛡️', hp: 95,  atk: 18 } },
      ],
    ],
    boss: {
      primary: { name: 'Sentinela do Portal Azul', icon: '🔵', hp: 280, atk: 32, matk: 18 },
    },
  },

  // ── PORTAL AMARELO (nível 11-25) ──────────────────────────
  'portal_yellow': {
    atmosphere: 'Calor intenso emana do portal âmbar. Cheiros de enxofre e metal quente dominam o ar...',
    xp: 600, gold: 240,
    layouts: [
      [
        { type: 'combat',   name: 'Forja Dimensional',     desc: 'Constructos de metal fundido emergem do portal amarelo com fúria!',                  icon: '🟡', enemy: { name: 'Constructo de Lava',  icon: '🤖', hp: 90,  atk: 22 } },
        { type: 'trap',     name: 'Corredor de Metal',     desc: 'Engrenagens giratórias cortam o ar! Esquive ou sofra as consequências!',              icon: '⚠️', trapDmg: 30 },
        { type: 'combat',   name: 'Câmara dos Forjadores', desc: 'Espíritos forjadores protegem os segredos do portal com vidas!',                     icon: '⚒️', enemy: { name: 'Espírito Forjador',   icon: '🔥', hp: 110, atk: 25 } },
        { type: 'rest',     name: 'Câmara de Resfriamento', desc: 'Água gelada de fonte dimensional alivia as queimaduras...',                         icon: '💧' },
        { type: 'combat',   name: 'Salão do Ferro',        desc: 'Um Golem de Ferro avançado barra o caminho com força esmagadora!',                   icon: '⚙️', enemy: { name: 'Golem de Ferro',      icon: '🤖', hp: 140, atk: 28 } },
        { type: 'treasure', name: 'Arsenal Dimensional',   desc: 'Equipamentos forjados em energia dimensional!',                                      icon: '📦' },
      ],
      [
        { type: 'combat',   name: 'Antecâmara Incandescente', desc: 'Elementais de fogo emergem do portal com rugidos ensurdecedores!',                icon: '🟡', enemy: { name: 'Elemental de Fogo',   icon: '🔥', hp: 85,  atk: 20 } },
        { type: 'rescue',   name: 'Gaiola de Metal',        desc: 'Um ferreiro aprisionado grita atrás de barras de metal aquecido!',                  icon: '🔒', npcName: 'Ferreiro Dimensional' },
        { type: 'combat',   name: 'Câmara dos Mestres',     desc: 'Mestres do metal dimensional empunham martelos de energia!',                        icon: '⚒️', enemy: { name: 'Mestre do Metal',     icon: '🔨', hp: 120, atk: 26 } },
        { type: 'trap',     name: 'Rio de Metal Fundido',   desc: 'Metal fundido corre pelo piso! Precisa saltar rapidamente!',                        icon: '⚠️', trapDmg: 28 },
        { type: 'combat',   name: 'Sala da Forja Suprema',  desc: 'A criação mais poderosa do portal aguarda para defender seu criador!',               icon: '⚙️', enemy: { name: 'Constructo Supremo',  icon: '🤖', hp: 145, atk: 29 } },
        { type: 'rest',     name: 'Câmara de Refrigeração', desc: 'Uma fonte fria restaura energia e alivia dores...',                                 icon: '💧' },
      ],
      [
        { type: 'combat',   name: 'Forja Dimensional',     desc: 'Constructos de metal fundido emergem do portal amarelo!',                            icon: '🟡', enemy: { name: 'Constructo de Lava',  icon: '🤖', hp: 90,  atk: 22 } },
        { type: 'combat',   name: 'Corredor dos Espinhos', desc: 'Bestas de ferro com espinhos afiados bloqueiam a passagem!',                         icon: '🐾', enemy: { name: 'Besta de Ferro',      icon: '🦎', hp: 100, atk: 23 } },
        { type: 'trap',     name: 'Câmara Pressurizada',   desc: 'Vapores quentes são liberados por válvulas defeituosas!',                             icon: '⚠️', trapDmg: 32 },
        { type: 'combat',   name: 'Guardiões da Forja',    desc: 'Dois guardiões trabalham em conjunto para bloquear a passagem!',                     icon: '⚙️', enemy: { name: 'Guardião da Forja',   icon: '⚒️', hp: 130, atk: 27 } },
        { type: 'rest',     name: 'Câmara de Refrigeração', desc: 'Uma fonte fria restaura energia e alivia dores...',                                 icon: '💧' },
        { type: 'treasure', name: 'Arsenal Dimensional',   desc: 'Equipamentos forjados em energia dimensional!',                                      icon: '📦' },
      ],
    ],
    boss: {
      primary:   { name: 'Senhor da Forja Dimensional', icon: '🟡', hp: 480, atk: 52, matk: 28 },
      secondary: { name: 'Constructo Guardião',          icon: '🤖', hp: 280, atk: 40, matk: 20, enragePrimary: 25 },
    },
  },

  // ── PORTAL VERMELHO (nível 21-35) ─────────────────────────
  'portal_red': {
    atmosphere: 'Sangue e cinzas cobrem tudo além do portal carmesim. Gritos de batalha ecoam eternamente...',
    xp: 1000, gold: 400,
    layouts: [
      [
        { type: 'combat',   name: 'Campo de Ruínas',       desc: 'Demônios de guerra sobreviventes de batalhas eternas avançam com fúria!',           icon: '🔴', enemy: { name: 'Demônio de Guerra',   icon: '😈', hp: 130, atk: 34 } },
        { type: 'trap',     name: 'Chuva de Brasas',       desc: 'O teto derrete liberando chuva de metal incandescente!',                             icon: '⚠️', trapDmg: 40 },
        { type: 'combat',   name: 'Salão do Sangue',       desc: 'O Cavaleiro Carmesim não permite nenhuma passagem!',                                  icon: '🩸', enemy: { name: 'Cavaleiro Carmesim',  icon: '🗡️', hp: 170, atk: 40 } },
        { type: 'rescue',   name: 'Masmorra Carmesim',     desc: 'Um herói capturado luta para se libertar das correntes demoníacas!',                 icon: '🔒', npcName: 'Herói Capturado' },
        { type: 'combat',   name: 'Câmara das Almas',      desc: 'Almas perdidas no portal foram corrompidas em guardiões malignos!',                  icon: '💀', enemy: { name: 'Alma Corrompida',     icon: '👻', hp: 150, atk: 38 } },
        { type: 'rest',     name: 'Santuário Proibido',    desc: 'Uma chama sagrada persiste em meio ao caos. Ela restaura os justos...',               icon: '🕯️' },
        { type: 'combat',   name: 'Antecâmara do Boss',    desc: 'Os servos do lorde dimensional formam uma última linha de defesa!',                  icon: '🔴', enemy: { name: 'Servo do Lorde',      icon: '🧟', hp: 190, atk: 42 } },
        { type: 'treasure', name: 'Tesouro Profano',       desc: 'Riquezas arrancadas de mundos conquistados aguardam em baús malditos!',              icon: '📦' },
      ],
      [
        { type: 'combat',   name: 'Fronteira Carmesim',    desc: 'Sentinelas demoníacas guardam a entrada com lanças de fogo sombrio!',                icon: '🔴', enemy: { name: 'Sentinela Demoníaca', icon: '👿', hp: 125, atk: 32 } },
        { type: 'combat',   name: 'Fortaleza de Ossos',    desc: 'Necromantes convocam esqueletos de guerreiros caídos em batalha!',                   icon: '💀', enemy: { name: 'Necromante Portal',   icon: '💀', hp: 145, atk: 35 } },
        { type: 'trap',     name: 'Câmara das Maldições',  desc: 'Runas de maldição disparam ao toque! Energia sombria penetra cada célula!',          icon: '⚠️', trapDmg: 38 },
        { type: 'combat',   name: 'Arena dos Condenados',  desc: 'Gladiadores eternamente condenados lutam sem possibilidade de repouso!',              icon: '🩸', enemy: { name: 'Gladiador Condenado',  icon: '⚔️', hp: 160, atk: 39 } },
        { type: 'rest',     name: 'Santuário Esquecido',   desc: 'Uma chama sagrada persiste em meio ao caos dimensional...',                           icon: '🕯️' },
        { type: 'combat',   name: 'Torre dos Horrores',    desc: 'Criaturas de pesadelo despencam das alturas da torre carmesim!',                     icon: '🔴', enemy: { name: 'Criatura Carmesim',   icon: '🦇', hp: 175, atk: 41 } },
        { type: 'rescue',   name: 'Masmorra das Almas',    desc: 'Almas presas gritam por libertação!',                                                 icon: '🔒', npcName: 'Alma Aprisionada' },
        { type: 'treasure', name: 'Câmara do Saque',       desc: 'Pilhagem de mil mundos conquistados pelo portal!',                                   icon: '📦' },
      ],
      [
        { type: 'combat',   name: 'Campo de Ruínas',       desc: 'Demônios de guerra sobreviventes avançam com fúria implacável!',                     icon: '🔴', enemy: { name: 'Demônio de Guerra',   icon: '😈', hp: 130, atk: 34 } },
        { type: 'trap',     name: 'Fogo das Profundezas',  desc: 'Fissuras no chão liberam jatos de fogo sombrio sem aviso!',                          icon: '⚠️', trapDmg: 42 },
        { type: 'combat',   name: 'Salão dos Titãs',       desc: 'Titãs demoníacos de 5 metros bloqueiam a passagem com corpos maciços!',              icon: '💢', enemy: { name: 'Titã Demoníaco',      icon: '👹', hp: 180, atk: 43 } },
        { type: 'rest',     name: 'Câmara de Sangue Frio', desc: 'Estranhamente pacífica — energia restauradora de uma fonte de sangue frio...',       icon: '🕯️' },
        { type: 'combat',   name: 'Guardiões Vermelhos',   desc: 'Gêmeos Vermelhos guardam o caminho para o boss em uníssono!',                        icon: '🩸', enemy: { name: 'Guardião Gêmeo',      icon: '⚔️', hp: 155, atk: 37 } },
        { type: 'combat',   name: 'Antecâmara do Lorde',   desc: 'Servos leais do Lorde Carmesim fazem última defesa desesperada!',                    icon: '🔴', enemy: { name: 'Servo Leal',          icon: '🧟', hp: 185, atk: 42 } },
        { type: 'rescue',   name: 'Gaiola Carmesim',       desc: 'Um herói capturado luta para se libertar das correntes!',                             icon: '🔒', npcName: 'Herói Capturado' },
        { type: 'treasure', name: 'Tesouro Profano',       desc: 'Riquezas arrancadas de mundos conquistados pelo portal carmesim!',                   icon: '📦' },
      ],
    ],
    boss: {
      primary:   { name: 'Lorde Carmesim',               icon: '🔴', hp: 750, atk: 75, matk: 45 },
      secondary: { name: 'Arauto da Destruição',          icon: '😈', hp: 450, atk: 60, matk: 35, enragePrimary: 35 },
      secondaryProtects: true,
    },
  },

  // ── PORTAL LENDÁRIO (nível 30+) ───────────────────────────
  'portal_legendary': {
    atmosphere: 'O tecido da realidade se rasga. Um vazio absoluto sussurra nomes esquecidos de heróis mortos...',
    xp: 1800, gold: 700,
    layouts: [
      [
        { type: 'combat',   name: 'Borda do Vazio',         desc: 'Entidades do Vazio sem forma nem rosto convergem com sede de almas!',               icon: '🟣', enemy: { name: 'Entidade do Vazio',   icon: '🌌', hp: 200, atk: 55 } },
        { type: 'trap',     name: 'Colapso Dimensional',    desc: 'O espaço entra em colapso! Energia do vazio fragmenta tudo ao redor!',               icon: '⚠️', trapDmg: 55 },
        { type: 'combat',   name: 'Câmara da Aniquilação',  desc: 'Aniquiladores do Vazio existem apenas para apagar tudo que encontram!',              icon: '💜', enemy: { name: 'Aniquilador do Vazio', icon: '⚫', hp: 250, atk: 62 } },
        { type: 'rescue',   name: 'Fragmento de Consciência', desc: 'Um herói lendário sobrevive consumido pelo vazio, apenas parcialmente...',         icon: '🔒', npcName: 'Herói Lendário' },
        { type: 'combat',   name: 'Salão dos Arquidemônios', desc: 'Arquidemônios do Vazio carregam o poder de mundos destruídos!',                    icon: '🟣', enemy: { name: 'Arquidemônio do Vazio', icon: '👿', hp: 280, atk: 68 } },
        { type: 'rest',     name: 'Olho da Tempestade',     desc: 'Um ponto de calma absoluta no centro do caos dimensional...',                        icon: '✨' },
        { type: 'combat',   name: 'Câmara dos Campeões',    desc: 'Campeões corrompidos pelo vazio — heróis que falharam antes de você!',               icon: '💀', enemy: { name: 'Campeão Corrompido',   icon: '💀', hp: 300, atk: 70 } },
        { type: 'treasure', name: 'Tesouro do Vazio',       desc: 'Artefatos de mundos destruídos aguardam quem for digno de os possuir!',              icon: '📦' },
      ],
      [
        { type: 'combat',   name: 'Limiar do Infinito',     desc: 'Guardiões do Infinito testam cada aventureiro antes de permitir passagem!',          icon: '🟣', enemy: { name: 'Guardião do Infinito', icon: '🌌', hp: 210, atk: 57 } },
        { type: 'combat',   name: 'Corredor dos Augúrios',  desc: 'Augúrios do Vazio preveem sua morte e tentam realizá-la!',                           icon: '🔮', enemy: { name: 'Augúrio Dimensional',  icon: '👁️', hp: 230, atk: 60 } },
        { type: 'trap',     name: 'Paradoxo Temporal',      desc: 'O tempo para brevemente! Dano da realidade colidindo com antimatéria!',               icon: '⚠️', trapDmg: 58 },
        { type: 'combat',   name: 'Salão do Esquecimento',  desc: 'Espíritos esquecidos de batalhas passadas buscam ancoragem na realidade!',            icon: '💜', enemy: { name: 'Espírito Esquecido',  icon: '👻', hp: 260, atk: 64 } },
        { type: 'rest',     name: 'Nexo do Equilíbrio',     desc: 'Um ponto de equilíbrio raro no caos dimensional restaura os vivos...',                icon: '✨' },
        { type: 'combat',   name: 'Câmara dos Titãs Cósmicos', desc: 'Titãs nascidos do vazio cósmico destroem tudo com mera presença!',               icon: '🟣', enemy: { name: 'Titã Cósmico',        icon: '⭐', hp: 290, atk: 69 } },
        { type: 'rescue',   name: 'Prisioneiro do Vazio',   desc: 'Uma consciência aprisionada por séculos no vazio pede libertação!',                  icon: '🔒', npcName: 'Ancião Dimensional' },
        { type: 'treasure', name: 'Cofre do Cosmos',        desc: 'Relíquias cósmicas de eras esquecidas aguardam o herói digno!',                      icon: '📦' },
      ],
      [
        { type: 'combat',   name: 'Entrada do Abismo',      desc: 'O próprio Abismo toma forma para impedir sua passagem!',                             icon: '🟣', enemy: { name: 'Sombra do Abismo',    icon: '🌑', hp: 220, atk: 58 } },
        { type: 'trap',     name: 'Rift Gravitacional',     desc: 'Um rift gravitacional comprime tudo numa área — inclusive você!',                     icon: '⚠️', trapDmg: 52 },
        { type: 'combat',   name: 'Câmara dos Lordes',      desc: 'Lordes do Vazio — cada um um mundo destruído personificado!',                         icon: '💀', enemy: { name: 'Lorde do Vazio',      icon: '👿', hp: 270, atk: 66 } },
        { type: 'rest',     name: 'Lágrima do Portal',      desc: 'Uma cristalização de lágrimas de mundos perdidos cura as feridas...',                icon: '✨' },
        { type: 'combat',   name: 'Salão do Fim',           desc: 'Arautos do fim dos tempos formam uma guarda de honra ao boss final!',                icon: '🟣', enemy: { name: 'Arauto do Fim',       icon: '💀', hp: 310, atk: 72 } },
        { type: 'combat',   name: 'Ante-Boss Cósmico',      desc: 'O guardião pessoal do Ancião do Vazio testa sua dignidade!',                         icon: '⚫', enemy: { name: 'Guardião Cósmico',    icon: '🌌', hp: 330, atk: 74 } },
        { type: 'rescue',   name: 'Fragmento de Alma',      desc: 'Uma alma fragmentada tenta se reconstruir a partir de seus gritos...',               icon: '🔒', npcName: 'Alma Fragmentada' },
        { type: 'treasure', name: 'Tesouro do Vazio',       desc: 'Artefatos de mundos destruídos aguardam quem for digno!',                            icon: '📦' },
      ],
    ],
    boss: {
      primary:   { name: 'Ancião do Vazio',              icon: '🟣', hp: 1200, atk: 95, matk: 65 },
      secondary: { name: 'Fragmento do Caos Primordial', icon: '⚫', hp:  700, atk: 78, matk: 55, enragePrimary: 40 },
      secondaryProtects: true,
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
  // Portal dungeon options
  actionCooldownMs?: number;  // If > 0, enforces a cooldown between actions (ms)
  isPortalDungeon?: boolean;  // Disables pet assistance
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
  actionCooldownMs = 0,
  isPortalDungeon = false,
}: DungeonArenaProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const recordPartnership = useRecordPartnership();
  const { data: myPartnerships = [] } = useDungeonPartnerships();

  // ── Compute dungeon data ─────────────────────────────────────────────
  const dungeonMeta   = DUNGEON_DATA[dungeonId] ?? DUNGEON_DATA['1'];
  const playerCount   = sessionPlayers ? sessionPlayers.length : (1 + Math.max(0, friendCount));
  const aliveAllies   = sessionPlayers ? sessionPlayers.filter(p => !p.isHost && p.isAlive).length : friendCount;

  // ── Sidekick scaling ──────────────────────────────────────────────────
  // Em co-op, calculamos o nível de referência da dungeon pela média da party,
  // com teto no nível mais baixo + SIDEKICK_BUFFER (evita que jogadores de
  // alto nível tornem o conteúdo trivial para jogadores iniciantes).
  const SIDEKICK_BUFFER = 5;   // alto nível pode ser até 5 acima do menor
  const partyLevels  = sessionPlayers ? sessionPlayers.map(p => p.level) : [playerLevel];
  const partyMinLevel = Math.min(...partyLevels);
  const partyAvgLevel = Math.round(partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length);
  // Nível de referência: média da party, mas nunca acima de mínimo + buffer
  const effectiveDungeonLevel = sessionPlayers && sessionPlayers.length > 1
    ? Math.min(partyAvgLevel, partyMinLevel + SIDEKICK_BUFFER)
    : playerLevel;
  // Fator de sidekick para este jogador (só reduz, nunca amplia)
  const sidekickFactor = (sessionPlayers && sessionPlayers.length > 1 && playerLevel > partyMinLevel + SIDEKICK_BUFFER)
    ? Math.min(1, (partyMinLevel + SIDEKICK_BUFFER) / playerLevel)
    : 1;
  const effectivePlayerAtk = Math.round(playerAtk * sidekickFactor);
  const effectivePlayerDef = Math.round(playerDef * sidekickFactor);
  const levelGap = sessionPlayers && sessionPlayers.length > 1
    ? Math.max(...partyLevels) - partyMinLevel
    : 0;

  // Randomly pick a layout once (computed on mount via lazy useState)
  const [layoutIndex] = useState<number>(() => Math.floor(Math.random() * 3));
  const baseRooms     = dungeonMeta.layouts[layoutIndex] ?? dungeonMeta.layouts[0];

  // Scale rooms to player level + party size
  const dungeonRoomList: RoomDef[] = baseRooms.map(room => room.enemy
    ? { ...room, enemy: { ...room.enemy, hp: scaleHp(room.enemy.hp, effectiveDungeonLevel, playerCount), atk: scaleAtk(room.enemy.atk, effectiveDungeonLevel, playerCount) } }
    : room
  );

  const boss         = getDungeonBoss(dungeonId);
  const bossFight    = dungeonMeta.boss;
  const scaledPrimary: EnemyDef & { matk: number } = {
    ...bossFight.primary,
    hp:  scaleHp(bossFight.primary.hp,  effectiveDungeonLevel, playerCount),
    atk: scaleAtk(bossFight.primary.atk, effectiveDungeonLevel, playerCount),
    matk: scaleAtk(bossFight.primary.matk, effectiveDungeonLevel, playerCount),
  };
  const scaledSecondary = bossFight.secondary ? {
    ...bossFight.secondary,
    hp:  scaleHp(bossFight.secondary.hp,  effectiveDungeonLevel, playerCount),
    atk: scaleAtk(bossFight.secondary.atk, effectiveDungeonLevel, playerCount),
    matk: scaleAtk(bossFight.secondary.matk, effectiveDungeonLevel, playerCount),
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

  // ── Room Modifiers ───────────────────────────────────────────────────────────────
  // Gerados uma vez no mount, paralelos ao array allRooms.
  // Não são afetados por rerenders; inputs estáveis durante toda a dungeon.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const roomModifiers = useMemo(() => generateModifiers(baseRooms.length + 1), []);
  // Ref para rastrear se a bênção de crítico já foi usada na sala atual
  const heroiCritUsedRef = useRef(false);
  // Em co-op, não-host sincroniza o modificador pelo broadcast
  const [syncedModifierKind, setSyncedModifierKind] = useState<ModifierKind | null>(null);

  // Bake sagrado / amaldicoado into allRooms enemy stats
  const allRooms: RoomDef[] = [...dungeonRoomList, bossRoomDef].map((room, i) => {
    const mod = roomModifiers[i];
    if (!mod || !room.enemy) return room;
    const enemy = { ...room.enemy };
    if (mod.kind === 'sagrado')     enemy.hp = Math.round(enemy.hp * 0.80);
    if (mod.kind === 'amaldicoado') { enemy.hp = Math.round(enemy.hp * 1.20); enemy.atk = Math.round(enemy.atk * 1.20); }
    return { ...room, enemy };
  });

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

  // ── Action cooldown (for portal dungeons) ─────────────────────────────
  const [lastActionAt, setLastActionAt]         = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // ── Battle history tracking ────────────────────────────────────────────
  const [battleStats, setBattleStats] = useState<BattleStats>({
    totalRounds: 0, totalDmgDealt: 0, totalDmgTaken: 0, roundHistory: [],
  });
  const [showBattleHistory, setShowBattleHistory] = useState(false);
  const roundCounterRef  = useRef(0);
  // pendingRoundRef accumulates data for the current combat round;
  // eDmg is set inside the setEnemyHp functional update (ref mutation is safe there)
  const pendingRoundRef  = useRef<{ pDmg: number; eDmg: number; pRoll: number; eRoll: number; crit: boolean; enemyName: string } | null>(null);

  useEffect(() => {
    if (!actionCooldownMs || lastActionAt === 0) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, actionCooldownMs - (Date.now() - lastActionAt));
      setCooldownRemaining(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 500);
    return () => clearInterval(interval);
  }, [lastActionAt, actionCooldownMs]);

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
        if (payload.modifierKind !== undefined) setSyncedModifierKind(payload.modifierKind ?? null);
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
    const mod  = roomModifiers[idx];
    setRoomIdx(idx);
    setRoomOutcome(null);
    heroiCritUsedRef.current = false;  // reset crit blessing each room

    const logLines: string[] = [`📍 ${room.name}`, `   ${room.desc}`];

    // Announce modifier
    if (mod) {
      logLines.push(mod.isCurse
        ? `🔴 [${mod.icon} ${mod.label}] ${mod.desc}`
        : `🟢 [${mod.icon} ${mod.label}] ${mod.desc}`
      );
    }

    setLog(logLines);

    // Apply eco_veneno: lose 6% max HP on entry
    if (mod?.kind === 'eco_veneno') {
      const poison = Math.max(1, Math.round(initialPlayerMaxHp * 0.06));
      setPlayerHp(ph => Math.max(1, ph - poison));
    }

    // Set enemy HP (room.enemy.hp already has sagrado/amaldicoado baked in)
    if (room.enemy) setEnemyHp(room.enemy.hp);
    // Boss room: initialise dual boss HP (primary uses room.enemy.hp for modifier)
    if (room.type === 'boss' && scaledSecondary) {
      setEnemyHp(room.enemy?.hp ?? scaledPrimary.hp);
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
      modifierKind: mod?.kind ?? null,
    });
  }, [allRooms, roomModifiers, scaledPrimary, scaledSecondary, initialPlayerMaxHp, broadcastAction]);

  // ── Action handler (one round / one action per click) ──────────────────
  const handleAction = useCallback(() => {
    if (!isHost) return;  // only host drives combat in co-op

    // Enforce action cooldown for portal dungeons
    if (actionCooldownMs > 0) {
      const now = Date.now();
      if (now - lastActionAt < actionCooldownMs) return;
      setLastActionAt(now);
      setCooldownRemaining(actionCooldownMs);
    }

    const room = allRooms[roomIdx];
    const isCombat = room.type === 'combat' || room.type === 'boss';
    const isBoss   = room.type === 'boss';

    if (isCombat) {
      // Combined ATK from entire alive party — aplica sidekick cap por jogador
      const baseAtk = sessionPlayers
        ? sessionPlayers.filter(p => p.isAlive).reduce((s, p) => {
            // cap individual: se estiver muito acima do mínimo, reduz proporcionalmente
            const pFactor = p.level > partyMinLevel + SIDEKICK_BUFFER
              ? Math.min(1, (partyMinLevel + SIDEKICK_BUFFER) / p.level)
              : 1;
            return s + Math.round(p.atk * pFactor);
          }, 0)
        : effectivePlayerAtk;
      const friendBonus   = sessionPlayers ? 0 : Math.min(friendCount * 0.18, 0.65);
      const effAtk        = Math.round(baseAtk * (sessionPlayers ? 1 : (1 + friendBonus)));

      // ── Apply room modifier effects on dice ────────────────────────
      const mod = roomModifiers[roomIdx];
      const rawRoll  = d(20);
      // escuridao: -3 to attack dice (min 1)
      const pRoll    = mod?.kind === 'escuridao' ? Math.max(1, rawRoll - 3) : rawRoll;
      // bencao_heroi: first attack in room is guaranteed crit
      const isBencaoHeroi = mod?.kind === 'bencao_heroi' && !heroiCritUsedRef.current;
      if (isBencaoHeroi) heroiCritUsedRef.current = true;
      const eRoll = d(20);
      const crit  = pRoll === 20 || isBencaoHeroi;
      // Loot multiplier for this room
      const lootMult   = mod?.kind === 'recompensa_dupla' ? 2 : 1;
      const lootBonus  = mod?.kind === 'porta_secreta' ? 1 : 0;
      // Modifier prefix for log
      const modTag = mod && mod.kind !== 'sagrado' && mod.kind !== 'amaldicoado' && mod.kind !== 'eco_veneno' && mod.kind !== 'eco_cura' && mod.kind !== 'recompensa_dupla' && mod.kind !== 'porta_secreta' && mod.kind !== 'bencao_heroi'
        ? ` [${mod.icon}]` : '';

      // ── DUAL BOSS: target secondary first ──────────────────────────
      if (isBoss && scaledSecondary && boss2Hp > 0) {
        const basePDmg = Math.max(1, Math.round((pRoll * effAtk) / 15));
        const pDmg     = crit ? basePDmg * 2 : basePDmg;
        const newLog: string[] = [];
        if (mod?.kind === 'escuridao' && rawRoll !== pRoll) newLog.push(`🌑 [Escuridão] Dado reduzido de ${rawRoll} → ${pRoll}!`);
        if (isBencaoHeroi) newLog.push(`⭐ [Bênção do Herói] Ataque crítico garantido!`);

        // Track round data
        pendingRoundRef.current = { pDmg, eDmg: 0, pRoll, eRoll, crit, enemyName: scaledSecondary.name };

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
            const loot = rollLoot(2 * lootMult + lootBonus);
            setAllLoot(al => mergeLoot(al, loot));
            loot.forEach(l => newLog.push(`   📦 +${l.qty}x ${l.icon} ${l.name}`));
          } else {
            // Secondary retaliates
            const enrageAtk = scaledSecondary.atk;
            const sanguinBonus = mod?.kind === 'sangramento' ? 5 : 0;
            const rawEDmg = Math.max(1, Math.round((eRoll * enrageAtk) / 15) - Math.floor(effectivePlayerDef / 6) + sanguinBonus);
            // Record eDmg for history (ref mutation inside functional update is safe)
            if (pendingRoundRef.current) pendingRoundRef.current.eDmg = rawEDmg;
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

        // Flush pending round to battle history
        setTimeout(() => {
          if (pendingRoundRef.current) {
            const rnd = pendingRoundRef.current;
            pendingRoundRef.current = null;
            const rndNum = ++roundCounterRef.current;
            setBattleStats(s => ({
              totalRounds:   s.totalRounds   + 1,
              totalDmgDealt: s.totalDmgDealt + rnd.pDmg,
              totalDmgTaken: s.totalDmgTaken + rnd.eDmg,
              roundHistory:  [...s.roundHistory, { round: rndNum, ...rnd }],
            }));
          }
        }, 0);
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
      if (mod?.kind === 'escuridao' && rawRoll !== pRoll) newLogLines.push(`🌑 [Escuridão] Dado reduzido de ${rawRoll} → ${pRoll}!`);
      if (isBencaoHeroi) newLogLines.push(`⭐ [Bênção do Herói] Ataque crítico garantido!`);

      // Track round data (eDmg filled in below if enemy survives)
      pendingRoundRef.current = { pDmg, eDmg: 0, pRoll, eRoll, crit, enemyName: room.enemy?.name ?? 'Inimigo' };

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
          const baseLootRolls = isBoss ? 4 : 2;
          const loot = rollLoot(baseLootRolls * lootMult + lootBonus);
          setAllLoot(al => mergeLoot(al, loot));
          loot.forEach(l => newLogLines.push(`   📦 +${l.qty}x ${l.icon} ${l.name}`));
          if (mod?.kind === 'recompensa_dupla') newLogLines.push(`💰 [Recompensa Dupla] Loot dobrado!`);
          if (mod?.kind === 'porta_secreta')    newLogLines.push(`🚪 [Porta Secreta] +1 item bônus encontrado!`);
          // eco_cura: heal after clearing room
          if (mod?.kind === 'eco_cura') {
            const ecoCuraHeal = Math.round(initialPlayerMaxHp * 0.08);
            setPlayerHp(ph => Math.min(ph + ecoCuraHeal, initialPlayerMaxHp));
            newLogLines.push(`💚 [Eco de Cura] +${ecoCuraHeal} HP restaurados!`);
          }
          setRoomOutcome('success');
          if (isBoss) { setTimeout(() => setPhase('victory'), 800); }
          setTimeout(() => newLogLines.forEach(l => addLog(l)), 0);
          broadcastAction('action_result', { enemyHp: 0, boss2Hp, bossEnraged, roomOutcome: 'success', phase: isBoss ? 'victory' : 'exploring', logLines: newLogLines });
          return 0;
        }

        // Enemy attacks back
        const sanguinBonus = mod?.kind === 'sangramento' ? 5 : 0;
        const rawEDmg = Math.max(1, Math.round((eRoll * enemyAtkEff) / 15) - Math.floor(effectivePlayerDef / 6) + sanguinBonus);
        const eDmg = Math.max(1, rawEDmg);
        // Record eDmg for history (ref mutation inside functional update is safe)
        if (pendingRoundRef.current) pendingRoundRef.current.eDmg = eDmg;
        if (bossEnraged) newLogLines.push(`😡 [ENFURECIDO] ${room.enemy?.name} rolou ${eRoll} → ${eDmg} dano!${sanguinBonus > 0 ? ` 🩸 +${sanguinBonus} sangramento` : ''}`);
        else newLogLines.push(`👹 ${room.enemy?.name} rolou ${eRoll}${modTag} → ${eDmg} de dano em você!`);

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

      // Flush pending round to battle history
      setTimeout(() => {
        if (pendingRoundRef.current) {
          const rnd = pendingRoundRef.current;
          pendingRoundRef.current = null;
          const rndNum = ++roundCounterRef.current;
          setBattleStats(s => ({
            totalRounds:   s.totalRounds   + 1,
            totalDmgDealt: s.totalDmgDealt + rnd.pDmg,
            totalDmgTaken: s.totalDmgTaken + rnd.eDmg,
            roundHistory:  [...s.roundHistory, { round: rndNum, ...rnd }],
          }));
        }
      }, 0);

    } else if (room.type === 'rescue') {
      const roll = d(20) + Math.floor(effectiveDungeonLevel / 2);
      const success = roll >= 12;
      addLog(`🤝 Tentativa de resgate — rolou ${roll} (min: 12)`);
      if (success) {
        addLog(`✅ ${room.npcName} foi resgatado! Você ganha +50 XP bônus.`);
        setRescued(r => r + 1);
        const loot = rollLoot(2 * lootMult + lootBonus);
        setAllLoot(al => mergeLoot(al, loot));
        loot.forEach(l => addLog(`   📦 ${room.npcName} te dá: +${l.qty}x ${l.icon} ${l.name}`));
        if (mod?.kind === 'eco_cura') {
          const heal = Math.round(initialPlayerMaxHp * 0.08);
          setPlayerHp(ph => Math.min(ph + heal, initialPlayerMaxHp));
          addLog(`💚 [Eco de Cura] +${heal} HP restaurados!`);
        }
        setRoomOutcome('success');
      } else {
        addLog(`❌ Não foi possível resgatar ${room.npcName}.`);
        setRoomOutcome('failure');
      }

    } else if (room.type === 'treasure') {
      addLog(`🔑 Você abre o baú com cuidado...`);
      const loot = rollLoot(3 * lootMult + lootBonus);
      setAllLoot(al => mergeLoot(al, loot));
      loot.forEach(l => addLog(`   📦 +${l.qty}x ${l.icon} ${l.name}`));
      if (mod?.kind === 'recompensa_dupla') addLog(`💰 [Recompensa Dupla] Loot dobrado!`);
      if (mod?.kind === 'porta_secreta')    addLog(`🚪 [Porta Secreta] +1 item bônus!`);
      addLog(`💰 Itens de fabricação encontrados!`);
      setRoomOutcome('success');

    } else if (room.type === 'trap') {
      const roll = d(20) + Math.floor(effectiveDungeonLevel / 3);
      const evaded = roll >= 14;
      addLog(`🏃 Tentativa de desvio — rolou ${roll} (min: 14)`);
      if (mod?.kind === 'armadilha_oculta') addLog(`⚙️ [Armadilha Oculta] Armadilha camuflada detectada! Dano +50%.`);
      if (evaded) {
        addLog(`✅ Você desviou da armadilha! Nenhum dano.`);
        const loot = rollLoot(1 * lootMult + lootBonus);
        setAllLoot(al => mergeLoot(al, loot));
        loot.forEach(l => addLog(`   📦 +${l.qty}x ${l.icon} ${l.name}`));
        setRoomOutcome('success');
      } else {
        const baseTrapDmg = room.trapDmg || 20;
        const dmg = mod?.kind === 'armadilha_oculta' ? Math.round(baseTrapDmg * 1.5) : baseTrapDmg;
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
  }, [allRooms, roomIdx, roomModifiers, effectivePlayerAtk, effectivePlayerDef, effectiveDungeonLevel, partyMinLevel, SIDEKICK_BUFFER, friendCount, sessionPlayers, boss2Hp, bossEnraged, scaledPrimary, scaledSecondary, bossFight, initialPlayerMaxHp, initialPlayerMaxMp, addLog, usePotion, broadcastAction, enemyHp, roomOutcome, isHost]);

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

      // Party bond — registra parceria para todos os membros co-op
      if (sessionPlayers && sessionPlayers.length >= 2) {
        const allIds = sessionPlayers.map(p => p.userId);
        recordPartnership.mutate({ playerIds: allIds, victory: true });
      }

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

  // Current room modifier (host uses own array; non-host syncs from broadcast)
  const currentMod: RoomModifier | null = isHost
    ? (roomModifiers[roomIdx] ?? null)
    : (syncedModifierKind ? ROOM_MODIFIER_POOL.find(m => m.kind === syncedModifierKind) ?? null : null);

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
                  {sessionPlayers && sessionPlayers.length > 1 && (
                    <p className="text-[11px] text-sky-400 mt-0.5">★ Nv. efetivo: {effectiveDungeonLevel}</p>
                  )}
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

            {/* Sidekick gap warning */}
            {levelGap > 8 && sessionPlayers && (
              <div className={`rpg-card ${levelGap > 15 ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                <p className={`text-xs flex items-start gap-2 ${levelGap > 15 ? 'text-red-300' : 'text-amber-300'}`}>
                  <span className="text-base shrink-0">{levelGap > 15 ? '🚨' : '⚠️'}</span>
                  <span>
                    <strong>Gap de nível de {levelGap} niveis detectado.</strong>{' '}
                    {levelGap > 15
                      ? 'Diferença extrema — jogadores de alto nível têm ATK reduzido automaticamente (sidekick scaling).'
                      : 'O combatê será equilibrado automaticamente para a faixa do jogador mais fraco.'}
                    {' '}Todos jogam no nível efetivo <strong>{effectiveDungeonLevel}</strong>.
                  </span>
                </p>
              </div>
            )}

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
                  {sessionPlayers.map(p => {
                    const bond = myPartnerships.find(b => b.partner_id === p.userId);
                    const tier = bond ? BOND_TIERS[bond.bond_tier] : null;
                    const isSidekickPlayer = p.level > partyMinLevel + SIDEKICK_BUFFER;
                    const pFactor = isSidekickPlayer ? Math.min(1, (partyMinLevel + SIDEKICK_BUFFER) / p.level) : 1;
                    return (
                      <div key={p.userId} className="flex items-center gap-2 text-xs">
                        <span className={p.isHost ? 'text-yellow-400' : 'text-purple-300'}>
                          {p.isHost ? '👑' : '⚔️'} {p.displayName}
                        </span>
                        {isSidekickPlayer && (
                          <span className="text-[10px] text-sky-400 border border-sky-400/30 rounded-full px-1.5 py-0.5">
                            sidekick Lv.{partyMinLevel + SIDEKICK_BUFFER}
                          </span>
                        )}
                        {tier && bond!.bond_tier > 0 && (
                          <span className={`ml-1 ${tier.color} flex items-center gap-0.5`}>
                            {tier.icon} <span className="text-[10px]">{tier.label}</span>
                          </span>
                        )}
                        <span className="text-muted-foreground ml-auto">Lv.{p.level} · ATK {p.atk}</span>
                      </div>
                    );
                  })}
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
                {allRooms.map((r, i) => {
                  const dotMod = isHost ? roomModifiers[i] : null;
                  return (
                    <div
                      key={i}
                      className={`flex-1 h-1.5 rounded-full ${
                        i < roomIdx ? 'bg-emerald-500' :
                        i === roomIdx ? (isBossRoom ? 'bg-red-500' : 'bg-purple-400') :
                        dotMod ? (dotMod.isCurse ? 'bg-red-900/60' : 'bg-emerald-900/60') :
                        'bg-muted/40'
                      }`}
                      title={dotMod ? `${dotMod.icon} ${dotMod.label}` : undefined}
                    />
                  );
                })}
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
                    {/* Room modifier badge */}
                    {currentMod && (
                      <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border mt-1 ${
                        currentMod.isCurse
                          ? 'text-red-300 bg-red-500/15 border-red-500/40'
                          : 'text-emerald-300 bg-emerald-500/15 border-emerald-500/40'
                      }`}>
                        {currentMod.icon} {currentMod.label}
                      </span>
                    )}
                    {roomOutcome !== null && (
                      <span className={`text-sm font-bold block mt-1 ${outcomeColor}`}>{outcomeLabel}</span>
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

            {/* Battle stats bar */}
            {battleStats.totalRounds > 0 && (
              <div className="flex items-center justify-between text-xs bg-muted/20 border border-border/40 rounded-lg px-3 py-1.5 select-none">
                <span className="text-muted-foreground">🎲 {battleStats.totalRounds} rodada{battleStats.totalRounds !== 1 ? 's' : ''}</span>
                <span className="text-green-400 font-semibold">⚔️ {battleStats.totalDmgDealt} dado</span>
                <span className="text-red-400 font-semibold">🛡️ {battleStats.totalDmgTaken} sofrido</span>
                <button
                  onClick={() => setShowBattleHistory(v => !v)}
                  className="text-purple-400 hover:text-purple-300 underline underline-offset-2"
                >
                  histórico
                </button>
              </div>
            )}

            {/* Battle history table */}
            {showBattleHistory && battleStats.roundHistory.length > 0 && (
              <div className="rpg-card bg-muted/10 border border-border/40 space-y-2 max-h-52 overflow-y-auto">
                <div className="flex items-center justify-between sticky top-0 bg-background/80 backdrop-blur-sm pb-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Histórico de Batalha</p>
                  <button onClick={() => setShowBattleHistory(false)} className="text-muted-foreground hover:text-foreground text-base leading-none">×</button>
                </div>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border/40">
                      <th className="text-left py-1 pr-2 font-medium">#</th>
                      <th className="text-left py-1 pr-2 font-medium">Inimigo</th>
                      <th className="text-center py-1 pr-2 font-medium">🎲 Atk</th>
                      <th className="text-center py-1 pr-2 font-medium">🎲 Def</th>
                      <th className="text-center py-1 pr-2 font-medium text-green-400">Dado</th>
                      <th className="text-center py-1 font-medium text-red-400">Sofrido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {battleStats.roundHistory.map(r => (
                      <tr key={r.round} className="border-b border-border/20 hover:bg-muted/20">
                        <td className="py-1 pr-2 text-muted-foreground">{r.round}</td>
                        <td className="py-1 pr-2 text-foreground/80 truncate max-w-[80px]">{r.enemyName}</td>
                        <td className="py-1 pr-2 text-center">
                          <span className={r.crit ? 'text-yellow-400 font-bold' : ''}>{r.pRoll}{r.crit ? '💥' : ''}</span>
                        </td>
                        <td className="py-1 pr-2 text-center text-muted-foreground">{r.eRoll}</td>
                        <td className="py-1 pr-2 text-center font-bold text-green-400">{r.pDmg}</td>
                        <td className="py-1 text-center font-bold text-red-400">{r.eDmg > 0 ? r.eDmg : <span className="text-muted-foreground">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border/60 font-bold">
                      <td colSpan={4} className="py-1.5 text-muted-foreground">Total</td>
                      <td className="py-1.5 text-center text-green-400">{battleStats.totalDmgDealt}</td>
                      <td className="py-1.5 text-center text-red-400">{battleStats.totalDmgTaken}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Action button */}
            <button
              onClick={roomOutcome !== null ? handleContinue : handleAction}
              disabled={phase !== 'exploring' || (!isHost && sessionId !== undefined) || (actionCooldownMs > 0 && cooldownRemaining > 0 && roomOutcome === null)}
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
              ) : actionCooldownMs > 0 && cooldownRemaining > 0 ? (
                <span className="flex items-center justify-center gap-2">
                  ⏳ Aguardando... {Math.ceil(cooldownRemaining / 1000)}s
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

            {/* Party Bond card — só aparece em co-op com 2+ pessoas */}
            {sessionPlayers && sessionPlayers.length >= 2 && (() => {
              const allies = sessionPlayers.filter(p => !p.isHost);
              return allies.length > 0 ? (
                <div className="rpg-card bg-purple-500/10 border-purple-500/30 space-y-2">
                  <p className="text-sm font-semibold text-purple-300 flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    Vínculo de Batalha
                  </p>
                  {allies.map(p => {
                    const bond = myPartnerships.find(b => b.partner_id === p.userId);
                    const newRuns = (bond?.runs_together ?? 0) + 1;
                    const newTier = getBondTier(newRuns);
                    const tierInfo = BOND_TIERS[newTier];
                    const nextInfo = runsToNextTier(newRuns);
                    const isNew = !bond;
                    return (
                      <div key={p.userId} className="flex items-start justify-between text-xs border-t border-purple-500/20 pt-2">
                        <div>
                          <p className="font-semibold text-foreground">{p.displayName}</p>
                          <p className={`${tierInfo.color} flex items-center gap-1 mt-0.5`}>
                            {tierInfo.icon} {tierInfo.label}
                            {isNew && <span className="text-[10px] text-emerald-400 ml-1">(novo!)</span>}
                          </p>
                          {nextInfo && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Faltam {nextInfo.runsNeeded} run(s) para {BOND_TIERS[nextInfo.next].icon} {BOND_TIERS[nextInfo.next].label}
                            </p>
                          )}
                        </div>
                        <div className="text-right text-[11px] text-muted-foreground">
                          <p>{newRuns} run(s) juntos</p>
                          {newTier >= 1 && <p className="text-emerald-400">+{[0,5,10,15,20][newTier]}% XP</p>}
                          {newTier >= 2 && <p className="text-yellow-400">+{[0,0,5,10,15][newTier]}% Gold</p>}
                          {newTier >= 3 && <p className="text-amber-400">+{[0,0,0,10,15][newTier]}% Drop</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null;
            })()}

            {/* Battle summary on victory */}
            {battleStats.totalRounds > 0 && (
              <div className="rpg-card bg-slate-500/10 border-slate-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resumo de Batalha</p>
                  <button
                    onClick={() => setShowBattleHistory(v => !v)}
                    className="text-xs text-purple-400 hover:text-purple-300 underline underline-offset-2"
                  >
                    {showBattleHistory ? 'ocultar' : 'ver histórico'}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rpg-card bg-muted/20 py-1.5">
                    <p className="font-bold text-foreground">{battleStats.totalRounds}</p>
                    <p className="text-muted-foreground">Rodadas</p>
                  </div>
                  <div className="rpg-card bg-green-500/10 py-1.5">
                    <p className="font-bold text-green-400">{battleStats.totalDmgDealt}</p>
                    <p className="text-muted-foreground">Dano Dado</p>
                  </div>
                  <div className="rpg-card bg-red-500/10 py-1.5">
                    <p className="font-bold text-red-400">{battleStats.totalDmgTaken}</p>
                    <p className="text-muted-foreground">Dano Sofrido</p>
                  </div>
                </div>
                {showBattleHistory && battleStats.roundHistory.length > 0 && (
                  <div className="max-h-44 overflow-y-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-muted-foreground border-b border-border/40">
                          <th className="text-left py-1 pr-2 font-medium">#</th>
                          <th className="text-left py-1 pr-2 font-medium">Inimigo</th>
                          <th className="text-center py-1 pr-2 font-medium">🎲 Atk</th>
                          <th className="text-center py-1 pr-2 font-medium">🎲 Def</th>
                          <th className="text-center py-1 pr-2 font-medium text-green-400">Dado</th>
                          <th className="text-center py-1 font-medium text-red-400">Sofrido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {battleStats.roundHistory.map(r => (
                          <tr key={r.round} className="border-b border-border/20">
                            <td className="py-1 pr-2 text-muted-foreground">{r.round}</td>
                            <td className="py-1 pr-2 text-foreground/80 truncate max-w-[80px]">{r.enemyName}</td>
                            <td className="py-1 pr-2 text-center">
                              <span className={r.crit ? 'text-yellow-400 font-bold' : ''}>{r.pRoll}{r.crit ? '💥' : ''}</span>
                            </td>
                            <td className="py-1 pr-2 text-center text-muted-foreground">{r.eRoll}</td>
                            <td className="py-1 pr-2 text-center font-bold text-green-400">{r.pDmg}</td>
                            <td className="py-1 text-center font-bold text-red-400">{r.eDmg > 0 ? r.eDmg : <span className="text-muted-foreground">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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

            {/* Battle summary on defeat */}
            {battleStats.totalRounds > 0 && (
              <div className="rpg-card bg-slate-500/10 border-slate-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resumo de Batalha</p>
                  <button
                    onClick={() => setShowBattleHistory(v => !v)}
                    className="text-xs text-purple-400 hover:text-purple-300 underline underline-offset-2"
                  >
                    {showBattleHistory ? 'ocultar' : 'ver histórico'}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rpg-card bg-muted/20 py-1.5">
                    <p className="font-bold text-foreground">{battleStats.totalRounds}</p>
                    <p className="text-muted-foreground">Rodadas</p>
                  </div>
                  <div className="rpg-card bg-green-500/10 py-1.5">
                    <p className="font-bold text-green-400">{battleStats.totalDmgDealt}</p>
                    <p className="text-muted-foreground">Dano Dado</p>
                  </div>
                  <div className="rpg-card bg-red-500/10 py-1.5">
                    <p className="font-bold text-red-400">{battleStats.totalDmgTaken}</p>
                    <p className="text-muted-foreground">Dano Sofrido</p>
                  </div>
                </div>
                {showBattleHistory && battleStats.roundHistory.length > 0 && (
                  <div className="max-h-44 overflow-y-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-muted-foreground border-b border-border/40">
                          <th className="text-left py-1 pr-2 font-medium">#</th>
                          <th className="text-left py-1 pr-2 font-medium">Inimigo</th>
                          <th className="text-center py-1 pr-2 font-medium">🎲 Atk</th>
                          <th className="text-center py-1 pr-2 font-medium">🎲 Def</th>
                          <th className="text-center py-1 pr-2 font-medium text-green-400">Dado</th>
                          <th className="text-center py-1 font-medium text-red-400">Sofrido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {battleStats.roundHistory.map(r => (
                          <tr key={r.round} className="border-b border-border/20">
                            <td className="py-1 pr-2 text-muted-foreground">{r.round}</td>
                            <td className="py-1 pr-2 text-foreground/80 truncate max-w-[80px]">{r.enemyName}</td>
                            <td className="py-1 pr-2 text-center">
                              <span className={r.crit ? 'text-yellow-400 font-bold' : ''}>{r.pRoll}{r.crit ? '💥' : ''}</span>
                            </td>
                            <td className="py-1 pr-2 text-center text-muted-foreground">{r.eRoll}</td>
                            <td className="py-1 pr-2 text-center font-bold text-green-400">{r.pDmg}</td>
                            <td className="py-1 text-center font-bold text-red-400">{r.eDmg > 0 ? r.eDmg : <span className="text-muted-foreground">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
                  setBattleStats({ totalRounds: 0, totalDmgDealt: 0, totalDmgTaken: 0, roundHistory: [] });
                  roundCounterRef.current = 0;
                  pendingRoundRef.current = null;
                  setShowBattleHistory(false);
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
