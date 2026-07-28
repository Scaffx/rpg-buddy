-- F3 — preferência de tela cheia do combate no celular.
-- Na tela pequena, abrir a arena inteira nem sempre é o que a pessoa quer:
-- às vezes ela só quer acompanhar a luta enquanto usa o resto do app. Aqui ela escolhe.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS combat_fullscreen_mobile boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.combat_fullscreen_mobile IS
  'Se true (padrão), tocar na janela flutuante do combate no celular abre a arena em tela cheia; se false, o painel apenas expande no lugar.';
