-- +2 pets de loja: Necromante Eterno (lv24) e Wyrm de Gelo Eterno (lv32). Preços/stats tunáveis.
INSERT INTO public.pet_catalog (pet_type, name, emoji, role, atk, def, hp, mp, price, sort) VALUES
  ('mini_necromante', 'Mini Necromante Eterno', '🧟', 'magic', 48, 20, 200, 95, 4500, 6),
  ('mini_wyrm_gelo',  'Mini Wyrm de Gelo Eterno', '❄️', 'magic', 45, 30, 240, 85, 5500, 7)
ON CONFLICT (pet_type) DO NOTHING;
