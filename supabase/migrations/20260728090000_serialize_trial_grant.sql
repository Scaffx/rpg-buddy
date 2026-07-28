-- Estanca a duplicação de trial no cadastro.
--
-- Dois caminhos concedem trial: o trigger grant_trial_subscription (AFTER
-- INSERT em profiles) e a RPC ensure_trial_subscription (chamada no login).
-- Ambos fazem IF NOT EXISTS e inserem. No cadastro os dois rodam quase juntos,
-- e nenhum enxerga o INSERT do outro antes do commit — TOCTOU clássico. Guard
-- lógico não substitui serialização.
--
-- O lock consultivo por usuário faz o segundo caminho esperar o primeiro
-- commitar; aí o IF NOT EXISTS finalmente vê a linha e desiste. É a correção
-- NÃO destrutiva: impede duplicatas novas sem tocar nas que já existem
-- (limpá-las mexe em dado de billing e fica para decisão do Murillo).
--
-- Guard definitivo, a aplicar DEPOIS da deduplicação:
--   CREATE UNIQUE INDEX subscriptions_um_trial_por_usuario
--     ON public.subscriptions (user_id)
--     WHERE environment = 'live' AND paddle_subscription_id LIKE 'trial_%';

CREATE OR REPLACE FUNCTION public.grant_trial_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  trial_id text := 'trial_' || replace(gen_random_uuid()::text, '-', '');
BEGIN
  -- Serializa com ensure_trial_subscription para o mesmo usuário.
  PERFORM pg_advisory_xact_lock(hashtext('trial_grant:' || NEW.user_id::text));

  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = NEW.user_id AND environment = 'live'
  ) THEN
    INSERT INTO public.subscriptions (
      user_id, paddle_subscription_id, paddle_customer_id, product_id, price_id,
      status, current_period_start, current_period_end, environment
    ) VALUES (
      NEW.user_id, trial_id, 'trial_' || NEW.user_id::text, 'premium_monthly',
      'premium_monthly', 'trialing', now(), now() + interval '7 days', 'live'
    );
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_trial_subscription()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  trial_paddle_id text;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('trial_grant:' || v_uid::text));

  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = v_uid AND environment = 'live'
  ) THEN
    trial_paddle_id := 'trial_' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.subscriptions (
      user_id, paddle_subscription_id, paddle_customer_id, product_id, price_id,
      status, current_period_start, current_period_end, environment
    ) VALUES (
      v_uid, trial_paddle_id, 'trial_' || v_uid::text, 'premium_monthly',
      'premium_monthly', 'trialing', now(), now() + interval '7 days', 'live'
    );
  END IF;
END;
$function$;
