-- Pre-migration legacy balances for deterministic denomination assertions.
-- Apply after economy_live_extension_fixture.sql and before the economy migration.
INSERT INTO public.user_balance(user_id,gold) VALUES
  ('11111111-1111-1111-1111-111111111111',100),
  ('22222222-2222-2222-2222-222222222222',321),
  ('33333333-3333-3333-3333-333333333333',848);
