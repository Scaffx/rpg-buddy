-- ============================================================
-- Item de Escaneamento de Portal
-- Adiciona o "Escaner de Portal" à loja para que jogadores
-- possam revelar a raridade do portal diário antes de entrar.
-- ============================================================

INSERT INTO public.game_items
  (name, description, icon, category, rarity, stat_label, stackable, is_consumable, effect, shop_price, level_required)
VALUES
  (
    'Escaner de Portal',
    'Escaneia o portal dimensional ativo e revela sua raridade (Azul, Amarelo, Vermelho ou Lendário) antes de entrar. Consumido ao usar.',
    '🔍',
    'consumable',
    'incomum',
    'Revela raridade do portal',
    true,
    true,
    'portal_scan',
    120,
    5
  )
ON CONFLICT DO NOTHING;
