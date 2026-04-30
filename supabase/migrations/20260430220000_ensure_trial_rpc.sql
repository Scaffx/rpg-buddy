-- Função que cria trial on-demand para o usuário autenticado.
-- Chamada pelo cliente como safety net caso o trigger handle_new_user falhe.
CREATE OR REPLACE FUNCTION public.ensure_trial_subscription()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trial_paddle_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = auth.uid() AND environment = 'live'
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
      auth.uid(),
      trial_paddle_id,
      'trial_' || auth.uid()::text,
      'premium_monthly',
      'premium_monthly',
      'trialing',
      now(),
      now() + interval '7 days',
      'live'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_trial_subscription() TO authenticated;
