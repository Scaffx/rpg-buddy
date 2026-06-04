-- Corrige o nome de herói em signups OAuth (Discord): o trigger só lia
-- display_name (do form de email). Para Discord, esse campo é null e o nome
-- caía em "Aventureiro". Agora usa, em ordem: display_name → global_name →
-- full_name → name → "Aventureiro". NULLIF(TRIM(...),'') ignora vazios.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE trial_paddle_id text;
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'global_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    'Aventureiro'
  ))
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.attributes (user_id, name, icon, xp, level) VALUES
    (NEW.id, 'Agilidade', '⚡', 0, 1), (NEW.id, 'Carisma', '👤', 0, 1),
    (NEW.id, 'Criatividade', '🎨', 0, 1), (NEW.id, 'Disciplina', '✨', 0, 1),
    (NEW.id, 'Força', '💪', 0, 1), (NEW.id, 'Inteligência', '🧠', 0, 1),
    (NEW.id, 'Resiliência', '🛡️', 0, 1), (NEW.id, 'Sabedoria', '📚', 0, 1),
    (NEW.id, 'Vitalidade', '❤️', 0, 1), (NEW.id, 'Autoaperfeiçoamento', '⭐', 0, 1),
    (NEW.id, 'Relacionamento', '💜', 0, 1)
  ON CONFLICT DO NOTHING;

  BEGIN
    trial_paddle_id := 'trial_' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.subscriptions (user_id, paddle_subscription_id, paddle_customer_id, product_id, price_id, status, current_period_start, current_period_end, environment)
    VALUES (NEW.id, trial_paddle_id, 'trial_' || NEW.id::text, 'premium_monthly', 'premium_monthly', 'trialing', now(), now() + interval '7 days', 'live')
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NEW;
END; $function$;
