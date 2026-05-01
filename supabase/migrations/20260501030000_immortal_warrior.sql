-- =============================================================
-- Guerreiro Imortal: mecânica de renascimento + itens especiais
-- =============================================================

-- 1. Rastrear derrota verdadeira do Guerreiro Imortal por usuário
ALTER TABLE public.hero_story_choices
  ADD COLUMN IF NOT EXISTS guerreiro_imortal_defeated boolean NOT NULL DEFAULT false;

-- 2. Cabeça de Basilisco — consumível lendário, uso único, apenas vs Guerreiro Imortal
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.game_items WHERE name = 'Cabeça de Basilisco') THEN
    INSERT INTO public.game_items (
      name, description, icon, category, rarity,
      stat_label, atk_bonus, matk_bonus, def_bonus, hp_bonus, mp_bonus, agi_bonus, crit_bonus,
      shop_price, stackable, is_consumable, effect,
      level_required, is_starter, starter_class, boss_drop_level
    ) VALUES (
      'Cabeça de Basilisco',
      'A cabeça petrificante de um Basilisco lendário. Emana uma névoa de pedra capaz de deter até o ser mais imortal. Uso único — somente contra o Guerreiro Imortal. Após o uso, se transforma em pedra e quebra para sempre.',
      '🗿', 'special', 'lendario',
      'Uso Único • Apenas vs Guerreiro Imortal',
      0, 0, 0, 0, 0, 0, 0,
      NULL, false, true, 'derrota_guerreiro_imortal',
      1, false, NULL, NULL
    );
  END IF;
END $$;

-- 3. Fragmentos do Pergaminho Ancestral (drops do Guerreiro Imortal após derrota verdadeira)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.game_items WHERE effect = 'quest_scroll_fragment_1') THEN
    INSERT INTO public.game_items (
      name, description, icon, category, rarity,
      stat_label, atk_bonus, matk_bonus, def_bonus, hp_bonus, mp_bonus, agi_bonus, crit_bonus,
      shop_price, stackable, is_consumable, effect,
      level_required, is_starter, starter_class, boss_drop_level
    ) VALUES
    (
      'Fragmento I — A Arma Proibida',
      'Um fragmento de um antigo pergaminho, arrancado de um corpo guerreiro petrificado. O texto diz: "...existe uma arma esquecida pelos deuses, forjada no núcleo do mundo. Somente ela pode ferir os Três Reis: Ragnarok, Gaia e Chronos Deus do Tempo. Para obtê-la, o herói deve..." (o restante está rasgado).',
      '📜', 'quest', 'lendario',
      NULL, 0, 0, 0, 0, 0, 0, 0,
      NULL, false, false, 'quest_scroll_fragment_1',
      1, false, NULL, NULL
    ),
    (
      'Fragmento II — O Preço do Poder',
      'Um fragmento de pergaminho com bordas queimadas. "...a Arma Ancestral não pode ser empunhada por alguém fraco de coração. O portador deve ter enfrentado os três guardiões e sobrevivido à sua fúria. Apenas então..." (o texto continua rasgado).',
      '📜', 'quest', 'lendario',
      NULL, 0, 0, 0, 0, 0, 0, 0,
      NULL, false, false, 'quest_scroll_fragment_2',
      1, false, NULL, NULL
    ),
    (
      'Fragmento III — O Local da Forja',
      'O último fragmento do pergaminho ancestral. "...encontrará a Forja Eterna nas profundezas do Abismo de Gaia. Leve os três fragmentos ao Guardião da Forja. Sem a Arma Ancestral completa, os Três Reis são imortais — Ragnarok, Gaia e Chronos Deus do Tempo permanecerão invencíveis para sempre."',
      '📜', 'quest', 'lendario',
      NULL, 0, 0, 0, 0, 0, 0, 0,
      NULL, false, false, 'quest_scroll_fragment_3',
      1, false, NULL, NULL
    );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
