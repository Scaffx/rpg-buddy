-- ============================================================
-- Phoenix redesign, class fix, boss resets & special items
-- ============================================================

-- ── 1. LIMPAR CLASSE DOS PERFIS QUE "CAÍRAM" DE LEVEL ─────────────────
-- Com a nova curva de XP, muitos usuários estão num nível inferior ao
-- mínimo de suas classes. Removemos a referência para que o sistema
-- volte a mostrar a classe correta.
UPDATE public.profiles p
SET current_class_id = NULL
WHERE p.current_class_id IS NOT NULL
  AND p.level < (
    SELECT c.level_min
    FROM public.classes c
    WHERE c.id = p.current_class_id
  );

-- ── 2. RESETAR TODOS OS COMBATES E BATALHAS DE BOSS ───────────────────
-- Limpa histórico de boss_battles e combates_ativos para todos os users.
DELETE FROM public.boss_battles;
DELETE FROM public.combates_ativos;

-- ── 3. REMOVER FÊNIX + ESFINGE (fusão removida do jogo) ───────────────
DELETE FROM public.bosses WHERE name ILIKE '%esfinge%' AND name ILIKE '%f_nix%';
DELETE FROM public.bosses WHERE name = 'Fênix + Esfinge do Deserto';

-- ── 4. GARANTIR COLUNA phoenix_escape_count em hero_story_choices ─────
ALTER TABLE public.hero_story_choices
  ADD COLUMN IF NOT EXISTS phoenix_escape_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phoenix_permanently_dead BOOLEAN DEFAULT FALSE;

-- ── 5. ADICIONAR/ATUALIZAR POSEIDON E IFRIT NOS BOSSES ────────────────
-- Estes bosses DROPAM itens especiais para derrotar a Fênix permanentemente.

INSERT INTO public.bosses (name, level, hp, xp_reward, gold_reward, icon, description)
VALUES
  ('Poseidon, Senhor dos Mares', 55, 1450, 4420, 840,
   '🔱',
   'O deus dos oceanos em sua forma colérica. Derrota-lo concede seu poderoso Tridente.'),
  ('Ifrit, Senhor do Fogo', 45, 1210, 3620, 685,
   '🔥',
   'Entidade primordial do fogo eterno. Sua Chama Eterna pode ser dada como presente à Fênix.')
ON CONFLICT (name) DO UPDATE
  SET level       = EXCLUDED.level,
      hp          = EXCLUDED.hp,
      xp_reward   = EXCLUDED.xp_reward,
      gold_reward = EXCLUDED.gold_reward,
      icon        = EXCLUDED.icon,
      description = EXCLUDED.description;

-- ── 6. ADICIONAR ITENS ESPECIAIS ─────────────────────────────────────
INSERT INTO public.game_items
  (name, description, icon, price, level_req, rarity, is_consumable, effect, effect_value)
VALUES
  (
    'Tridente de Poseidon',
    'O tridente sagrado do deus dos mares. Usado contra a Fênix Renascente, pode extinguir sua chama imortal para sempre.',
    '🔱', 0, 55, 'legendary', FALSE,
    'derrota_fenix_permanente', 1
  ),
  (
    'Chama Eterna de Ifrit',
    'A chama primordial que Ifrit carregava. Presenteada à Fênix Renascente, ela a apazigua e a transforma em companheira lendária.',
    '🕯️', 0, 45, 'legendary', FALSE,
    'captura_fenix_pet', 1
  )
ON CONFLICT (name) DO NOTHING;
