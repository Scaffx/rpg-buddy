create table if not exists public.subscription_access_keys (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  granted_by_subscription_id text not null,
  code text not null unique,
  grant_months integer not null default 2,
  status text not null default 'issued',
  recipient_user_id uuid,
  redeemed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_access_keys_status_check check (status in ('issued', 'redeemed', 'expired', 'revoked')),
  constraint subscription_access_keys_months_check check (grant_months > 0)
);

create index if not exists idx_subscription_access_keys_owner on public.subscription_access_keys (owner_user_id);
create index if not exists idx_subscription_access_keys_subscription on public.subscription_access_keys (granted_by_subscription_id);
create index if not exists idx_subscription_access_keys_status on public.subscription_access_keys (status);

alter table public.subscription_access_keys enable row level security;

create policy "Users can view own access keys"
  on public.subscription_access_keys
  for select
  using (auth.uid() = owner_user_id or auth.uid() = recipient_user_id);
