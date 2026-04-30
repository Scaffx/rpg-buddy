-- ================================================================
-- Coloca a criação do trial diretamente em handle_new_user.
-- Mais confiável do que depender do trigger on_profile_created_grant_trial.
-- ================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trial_paddle_id text;
BEGIN
  -- 1. Criar perfil
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', 'Aventureiro'))
  ON CONFLICT (user_id) DO NOTHING;

  -- 2. Criar atributos iniciais
  INSERT INTO public.attributes (user_id, name, icon, xp, level) VALUES
    (NEW.id, 'Agilidade',           '⚡', 0, 1),
    (NEW.id, 'Carisma',             '👤', 0, 1),
    (NEW.id, 'Criatividade',        '🎨', 0, 1),
    (NEW.id, 'Disciplina',          '✨', 0, 1),
    (NEW.id, 'Força',               '💪', 0, 1),
    (NEW.id, 'Inteligência',        '🧠', 0, 1),
    (NEW.id, 'Resiliência',         '🛡️', 0, 1),
    (NEW.id, 'Sabedoria',           '📚', 0, 1),
    (NEW.id, 'Vitalidade',          '❤️', 0, 1),
    (NEW.id, 'Autoaperfeiçoamento', '⭐', 0, 1),
    (NEW.id, 'Relacionamento',      '💜', 0, 1)
  ON CONFLICT DO NOTHING;

  -- 3. Conceder 7 dias de trial automaticamente (apenas se ainda não tiver)
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = NEW.id AND environment = 'live'
  ) THEN
    trial_paddle_id := 'trial_' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.subscriptions (
      user_id,
      paddle_subscription_id,
      paddle_customer_id,
      product_id,
      price_id,
      status,
      current_period_start,
      current_period_end,
      environment
    ) VALUES (
      NEW.id,
      trial_paddle_id,
      'trial_' || NEW.id::text,
      'premium_monthly',
      'premium_monthly',
      'trialing',
      now(),
      now() + interval '7 days',
      'live'
    );
  END IF;

  RETURN NEW;
END;
$$;
