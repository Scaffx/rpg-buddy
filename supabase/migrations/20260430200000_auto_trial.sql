-- ================================================================
-- Auto-trial: todo novo usuário recebe 7 dias grátis automaticamente.
-- Trigger disparado após INSERT em public.profiles.
-- ================================================================

CREATE OR REPLACE FUNCTION public.grant_trial_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trial_id text := 'trial_' || replace(gen_random_uuid()::text, '-', '');
BEGIN
  -- Só cria trial se o usuário ainda não tiver nenhuma assinatura no ambiente live
  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = NEW.user_id AND environment = 'live'
  ) THEN
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
      NEW.user_id,
      trial_id,
      'trial_' || NEW.user_id::text,
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

-- Trigger dispara após criação de perfil (handle_new_user cria o perfil no signup)
DROP TRIGGER IF EXISTS on_profile_created_grant_trial ON public.profiles;
CREATE TRIGGER on_profile_created_grant_trial
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_trial_subscription();

-- ================================================================
-- Backfill: usuários já existentes sem assinatura live recebem trial agora.
-- Cobre os 17 usuários migrados do projeto anterior.
-- ================================================================
DO $$
DECLARE
  rec    record;
  tid    text;
BEGIN
  FOR rec IN
    SELECT p.user_id
    FROM public.profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = p.user_id AND s.environment = 'live'
    )
  LOOP
    tid := 'trial_' || replace(gen_random_uuid()::text, '-', '');
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
      rec.user_id,
      tid,
      'trial_' || rec.user_id::text,
      'premium_monthly',
      'premium_monthly',
      'trialing',
      now(),
      now() + interval '7 days',
      'live'
    );
  END LOOP;
END;
$$;
