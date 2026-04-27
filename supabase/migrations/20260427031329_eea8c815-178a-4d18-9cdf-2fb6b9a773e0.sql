create or replace function public.has_active_subscription(
  user_uuid uuid,
  check_env text default 'live'
)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = user_uuid
    and environment = check_env
    and (
      (status in ('active', 'trialing', 'past_due')
        and (current_period_end is null
          or (date_trunc('day', current_period_end) + interval '1 day - 1 microsecond') > now()))
      or (status = 'canceled'
        and current_period_end is not null
        and (date_trunc('day', current_period_end) + interval '1 day - 1 microsecond') > now())
    )
  );
$$;