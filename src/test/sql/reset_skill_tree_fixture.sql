-- Minimal isolated representation of the read-only Primary definition.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END;
$roles$;
CREATE SCHEMA auth;
CREATE SCHEMA app_private;
CREATE SCHEMA extensions;
GRANT USAGE ON SCHEMA public, auth, app_private TO authenticated;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY, level integer NOT NULL, xp integer NOT NULL,
  current_class_id text NOT NULL, permanent_strength integer NOT NULL,
  combat_skill_loadout jsonb NOT NULL DEFAULT '[]'::jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_balance (
  user_id uuid PRIMARY KEY, gold integer NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.skill_tree_nodes (
  id text PRIMARY KEY, cost integer NOT NULL, node_type text NOT NULL,
  tree text NOT NULL, effect jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.player_skill_nodes (
  user_id uuid NOT NULL, node_id text NOT NULL REFERENCES public.skill_tree_nodes(id),
  rank integer NOT NULL, source text NOT NULL DEFAULT 'points',
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,node_id)
);
CREATE TABLE public.battle_snapshot (user_id uuid PRIMARY KEY, snapshot jsonb NOT NULL);

CREATE OR REPLACE FUNCTION public.reset_skill_tree()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_level int;
  v_cost int := 150;
  v_gold int;
  v_charged int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT GREATEST(1, COALESCE(level, 1)) INTO v_level FROM public.profiles WHERE user_id = v_uid;
  IF v_level > 15 THEN
    SELECT COALESCE(gold, 0) INTO v_gold FROM public.user_balance WHERE user_id = v_uid;
    IF COALESCE(v_gold, 0) < v_cost THEN RAISE EXCEPTION 'INSUFFICIENT_GOLD'; END IF;
    UPDATE public.user_balance SET gold = gold - v_cost, updated_at = now() WHERE user_id = v_uid;
    v_charged := v_cost;
  END IF;
  -- Preserva Cinzas de Guerra (source='scroll'/'drop'); só devolve pontos gastos na árvore.
  DELETE FROM public.player_skill_nodes WHERE user_id = v_uid AND source = 'points';
  RETURN jsonb_build_object('ok', true, 'charged', v_charged);
END;
$function$;
REVOKE ALL ON FUNCTION public.reset_skill_tree() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_skill_tree() TO anon, authenticated, service_role;
