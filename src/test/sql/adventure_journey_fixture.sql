-- Reduced PG17 fixture for the narrative migration; no combat or Supabase gateway.
DO $roles$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $roles$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$fn$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE TABLE public.adventure_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stage integer NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 100000)
);
ALTER TABLE public.adventure_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adventure_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.adventure_state TO authenticated;
CREATE POLICY adventure_state_own_read ON public.adventure_state
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

INSERT INTO auth.users(id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000002'),
  ('aaaaaaaa-0000-0000-0000-000000000003');
INSERT INTO public.adventure_state(user_id,stage) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001',4),
  ('aaaaaaaa-0000-0000-0000-000000000002',15),
  ('aaaaaaaa-0000-0000-0000-000000000003',5);

-- Existing Supabase-style defaults must not leave effective public grants.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
