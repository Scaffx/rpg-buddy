-- ============================================================
-- FIX: REAL NUMERIC STATS FOR SHOP ITEMS
-- All shop items had stat_label text but all bonus columns were 0.
-- This migration writes the actual numeric values + sets level_required.
-- ============================================================

-- ── WEAPONS ─────────────────────────────────────────────────

UPDATE public.game_items SET
  atk_bonus  = 7, matk_bonus = 0, def_bonus = 0, hp_bonus = 0, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 3
WHERE name = 'Espada Longa' AND category = 'weapon';

UPDATE public.game_items SET
  atk_bonus  = 0, matk_bonus = 7, def_bonus = 0, hp_bonus = 0, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 3
WHERE name = 'Cajado de Cristal' AND category = 'weapon';

UPDATE public.game_items SET
  atk_bonus  = 5, matk_bonus = 0, def_bonus = 0, hp_bonus = 0, mp_bonus = 0, agi_bonus = 3, crit_bonus = 0,
  level_required = 3
WHERE name = 'Arco Composto' AND category = 'weapon';

UPDATE public.game_items SET
  atk_bonus  = 6, matk_bonus = 0, def_bonus = 0, hp_bonus = 0, mp_bonus = 0, agi_bonus = 4, crit_bonus = 0,
  level_required = 8
WHERE name = 'Adaga Envenenada' AND category = 'weapon';

UPDATE public.game_items SET
  atk_bonus  = 10, matk_bonus = 0, def_bonus = 0, hp_bonus = 0, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 8
WHERE name = 'Martelo de Guerra' AND category = 'weapon';

UPDATE public.game_items SET
  atk_bonus  = 0, matk_bonus = 10, def_bonus = 0, hp_bonus = 0, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 8
WHERE name = 'Báculo do Crepúsculo' AND category = 'weapon';

UPDATE public.game_items SET
  atk_bonus  = 14, matk_bonus = 0, def_bonus = 0, hp_bonus = 0, mp_bonus = 0, agi_bonus = 3, crit_bonus = 0,
  level_required = 14, requer_sintonizacao = TRUE
WHERE name = 'Lâmina do Trovão' AND category = 'weapon';

UPDATE public.game_items SET
  atk_bonus  = 10, matk_bonus = 0, def_bonus = 0, hp_bonus = 0, mp_bonus = 0, agi_bonus = 7, crit_bonus = 0,
  level_required = 14, requer_sintonizacao = TRUE
WHERE name = 'Arco dos Ventos' AND category = 'weapon';

-- ── ARMORS ──────────────────────────────────────────────────

UPDATE public.game_items SET
  atk_bonus  = 0, matk_bonus = 0, def_bonus = 6, hp_bonus = 0, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 3
WHERE name = 'Cota de Malha' AND category = 'armor';

UPDATE public.game_items SET
  atk_bonus  = 0, matk_bonus = 4, def_bonus = 4, hp_bonus = 0, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 3
WHERE name = 'Manto do Sábio' AND category = 'armor';

UPDATE public.game_items SET
  atk_bonus  = 0, matk_bonus = 0, def_bonus = 4, hp_bonus = 0, mp_bonus = 0, agi_bonus = 3, crit_bonus = 0,
  level_required = 3
WHERE name = 'Colete de Caçador' AND category = 'armor';

UPDATE public.game_items SET
  atk_bonus  = 0, matk_bonus = 0, def_bonus = 12, hp_bonus = 0, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 8
WHERE name = 'Armadura de Placas' AND category = 'armor';

UPDATE public.game_items SET
  atk_bonus  = 0, matk_bonus = 7, def_bonus = 6, hp_bonus = 0, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 8
WHERE name = 'Túnica do Arcano' AND category = 'armor';

UPDATE public.game_items SET
  atk_bonus  = 0, matk_bonus = 0, def_bonus = 5, hp_bonus = 0, mp_bonus = 0, agi_bonus = 7, crit_bonus = 0,
  level_required = 8
WHERE name = 'Manto da Sombra' AND category = 'armor';

UPDATE public.game_items SET
  atk_bonus  = 3, matk_bonus = 0, def_bonus = 18, hp_bonus = 0, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 15, requer_sintonizacao = TRUE
WHERE name = 'Peitoral do Dragão' AND category = 'armor';

UPDATE public.game_items SET
  atk_bonus  = 0, matk_bonus = 10, def_bonus = 10, hp_bonus = 0, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 15, requer_sintonizacao = TRUE
WHERE name = 'Vestes Celestiais' AND category = 'armor';

-- ── ACCESSORIES ─────────────────────────────────────────────

UPDATE public.game_items SET
  atk_bonus  = 0, matk_bonus = 0, def_bonus = 0, hp_bonus = 15, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 3
WHERE name = 'Anel de Vitalidade' AND category = 'accessory';

UPDATE public.game_items SET
  atk_bonus  = 3, matk_bonus = 2, def_bonus = 0, hp_bonus = 0, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 3
WHERE name = 'Amuleto de Foco' AND category = 'accessory';

UPDATE public.game_items SET
  atk_bonus  = 0, matk_bonus = 0, def_bonus = 0, hp_bonus = 0, mp_bonus = 0, agi_bonus = 8, crit_bonus = 0,
  level_required = 8
WHERE name = 'Bota de Velocidade' AND category = 'accessory';

UPDATE public.game_items SET
  atk_bonus  = 0, matk_bonus = 6, def_bonus = 3, hp_bonus = 0, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 8
WHERE name = 'Colar do Sábio' AND category = 'accessory';

UPDATE public.game_items SET
  atk_bonus  = 10, matk_bonus = 0, def_bonus = 0, hp_bonus = 0, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 8
WHERE name = 'Anel do Berserker' AND category = 'accessory';

UPDATE public.game_items SET
  atk_bonus  = 0, matk_bonus = 0, def_bonus = 8, hp_bonus = 5, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 15, requer_sintonizacao = TRUE
WHERE name = 'Amuleto do Guardião' AND category = 'accessory';

-- ── FIX STARTER ITEMS that may also be missing stats ────────
-- These come from the 20260415 migration and should already have values,
-- but let's ensure they're correct for consistency.

UPDATE public.game_items SET
  atk_bonus  = 3, matk_bonus = 0, def_bonus = 0, hp_bonus = 0, mp_bonus = 0, agi_bonus = 1, crit_bonus = 0,
  level_required = 1
WHERE name = 'Adaga do Iniciante' AND category = 'weapon';

UPDATE public.game_items SET
  atk_bonus  = 4, matk_bonus = 0, def_bonus = 0, hp_bonus = 0, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 1
WHERE name = 'Espada Curta' AND category = 'weapon';

UPDATE public.game_items SET
  atk_bonus  = 3, matk_bonus = 0, def_bonus = 0, hp_bonus = 0, mp_bonus = 0, agi_bonus = 1, crit_bonus = 0,
  level_required = 1
WHERE name = 'Arco Simples' AND category = 'weapon';

UPDATE public.game_items SET
  atk_bonus  = 0, matk_bonus = 4, def_bonus = 0, hp_bonus = 0, mp_bonus = 0, agi_bonus = 0, crit_bonus = 0,
  level_required = 1
WHERE name = 'Cajado de Aprendiz' AND category = 'weapon';

-- ═══════════════════════════════════════════════════════════════════════════════
-- NEW: DUNGEON-EXCLUSIVE DROP ITEMS (shop_price = NULL — cannot be bought)
-- These create the reason to run dungeons for gear progression.
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO public.game_items
  (name, description, icon, category, rarity, stat_label,
   atk_bonus, matk_bonus, def_bonus, hp_bonus, mp_bonus, agi_bonus, crit_bonus,
   shop_price, level_required, requer_sintonizacao, stackable, is_consumable, is_starter)
VALUES

-- ── Dungeon 1 drops: Covil dos Orcs ─────────────────────────
('Escudo do Shagor',
 'O escudo pessoal do Grande Orc. Forjado com ferro negro e medo.',
 '🛡️', 'armor', 'raro', '+14 DEF, +8 HP',
 0, 0, 14, 8, 0, 0, 0,
 NULL, 5, FALSE, FALSE, FALSE, FALSE),

('Adaga de Zoth',
 'Adaga cerimonial do Chefe dos Goblins. Afiada e traiçoeira.',
 '🗡️', 'weapon', 'raro', '+8 ATK, +5 AGI',
 8, 0, 0, 0, 0, 5, 0,
 NULL, 5, FALSE, FALSE, FALSE, FALSE),

('Amuleto da Tribo',
 'Talismã orc que fortalece o portador com raiva tribal.',
 '📿', 'accessory', 'incomum', '+5 ATK, +5 HP',
 5, 0, 0, 5, 0, 0, 0,
 NULL, 3, FALSE, FALSE, FALSE, FALSE),

-- ── Dungeon 2 drops: Templo das Areias ──────────────────────
('Amuleto da Esfinge',
 'Joia mística que guarda os segredos do deserto eterno.',
 '🧿', 'accessory', 'epico', '+10 MATK, +8 DEF, +10 HP',
 0, 10, 8, 10, 0, 0, 0,
 NULL, 10, TRUE, FALSE, FALSE, FALSE),

('Báculo do Djinn',
 'Conjurado do próprio vórtice do Djinn do Deserto.',
 '🌪️', 'weapon', 'epico', '+16 MATK, +4 AGI',
 0, 16, 0, 0, 0, 4, 0,
 NULL, 10, TRUE, FALSE, FALSE, FALSE),

('Lâmina de Areia',
 'Espada de obsidiana do deserto. Ágil e mortal.',
 '🏺', 'weapon', 'raro', '+11 ATK, +4 AGI',
 11, 0, 0, 0, 0, 4, 0,
 NULL, 8, FALSE, FALSE, FALSE, FALSE),

-- ── Dungeon 3 drops: Abismo das Sombras ─────────────────────
('Espada do Vazio',
 'A própria lâmina do Cavaleiro do Vazio. Rasga dimensões.',
 '🗡️', 'weapon', 'lendario', '+22 ATK, +6 AGI, +5 CRIT',
 22, 0, 0, 0, 0, 6, 5,
 NULL, 15, TRUE, FALSE, FALSE, FALSE),

('Armadura do Cavaleiro Vazio',
 'Armadura sombria que absorve magia e golpes físicos.',
 '⚫', 'armor', 'lendario', '+22 DEF, +5 ATK, +20 HP',
 5, 0, 22, 20, 0, 0, 0,
 NULL, 15, TRUE, FALSE, FALSE, FALSE),

('Escama do Wyvern Relâmpago',
 'Escama condutora que carrega energia elétrica.',
 '⚡', 'accessory', 'epico', '+12 ATK, +8 AGI, +4 CRIT',
 12, 0, 0, 0, 0, 8, 4,
 NULL, 12, TRUE, FALSE, FALSE, FALSE);

-- ═══════════════════════════════════════════════════════════════════════════════
-- NEW: IMPROVE STAT LABELS to match real values (cleanup cosmético)
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE public.game_items SET stat_label = '+7 ATK'            WHERE name = 'Espada Longa'       AND category = 'weapon';
UPDATE public.game_items SET stat_label = '+7 MATK'           WHERE name = 'Cajado de Cristal'  AND category = 'weapon';
UPDATE public.game_items SET stat_label = '+5 ATK, +3 AGI'    WHERE name = 'Arco Composto'      AND category = 'weapon';
UPDATE public.game_items SET stat_label = '+6 ATK, +4 AGI'    WHERE name = 'Adaga Envenenada'   AND category = 'weapon';
UPDATE public.game_items SET stat_label = '+10 ATK'           WHERE name = 'Martelo de Guerra'  AND category = 'weapon';
UPDATE public.game_items SET stat_label = '+10 MATK'          WHERE name = 'Báculo do Crepúsculo' AND category = 'weapon';
UPDATE public.game_items SET stat_label = '+14 ATK, +3 AGI'   WHERE name = 'Lâmina do Trovão'   AND category = 'weapon';
UPDATE public.game_items SET stat_label = '+10 ATK, +7 AGI'   WHERE name = 'Arco dos Ventos'    AND category = 'weapon';

UPDATE public.game_items SET stat_label = '+6 DEF'            WHERE name = 'Cota de Malha'      AND category = 'armor';
UPDATE public.game_items SET stat_label = '+4 DEF, +4 MATK'   WHERE name = 'Manto do Sábio'     AND category = 'armor';
UPDATE public.game_items SET stat_label = '+4 DEF, +3 AGI'    WHERE name = 'Colete de Caçador'  AND category = 'armor';
UPDATE public.game_items SET stat_label = '+12 DEF'           WHERE name = 'Armadura de Placas' AND category = 'armor';
UPDATE public.game_items SET stat_label = '+6 DEF, +7 MATK'   WHERE name = 'Túnica do Arcano'   AND category = 'armor';
UPDATE public.game_items SET stat_label = '+5 DEF, +7 AGI'    WHERE name = 'Manto da Sombra'    AND category = 'armor';
UPDATE public.game_items SET stat_label = '+18 DEF, +3 ATK'   WHERE name = 'Peitoral do Dragão' AND category = 'armor';
UPDATE public.game_items SET stat_label = '+10 DEF, +10 MATK' WHERE name = 'Vestes Celestiais'  AND category = 'armor';

UPDATE public.game_items SET stat_label = '+15 HP'            WHERE name = 'Anel de Vitalidade' AND category = 'accessory';
UPDATE public.game_items SET stat_label = '+3 ATK, +2 MATK'   WHERE name = 'Amuleto de Foco'    AND category = 'accessory';
UPDATE public.game_items SET stat_label = '+8 AGI'            WHERE name = 'Bota de Velocidade' AND category = 'accessory';
UPDATE public.game_items SET stat_label = '+6 MATK, +3 DEF'   WHERE name = 'Colar do Sábio'     AND category = 'accessory';
UPDATE public.game_items SET stat_label = '+10 ATK'           WHERE name = 'Anel do Berserker'  AND category = 'accessory';
UPDATE public.game_items SET stat_label = '+8 DEF, +5 HP'     WHERE name = 'Amuleto do Guardião' AND category = 'accessory';
