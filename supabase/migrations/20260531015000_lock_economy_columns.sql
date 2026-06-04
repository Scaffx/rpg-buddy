-- ════════════════════════════════════════════════════════════════
-- TRAVA DE RLS DA ECONOMIA (anti-cheat final).
-- profiles: trigger bloqueia mudança das colunas de progressão por
--   authenticated/anon (permite colunas não-econômicas: nome, região,
--   streak_protector, loadout, etc.). Os RPCs rodam como postgres
--   (SECURITY DEFINER) e passam pelo guard.
-- attributes / user_balance: nenhum caminho client escreve direto → REVOKE
--   UPDATE de authenticated/anon/PUBLIC. INSERT inicial do saldo continua.
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._guard_profiles_economy()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND (
       NEW.total_xp            IS DISTINCT FROM OLD.total_xp OR
       NEW.level               IS DISTINCT FROM OLD.level OR
       NEW.boss_keys           IS DISTINCT FROM OLD.boss_keys OR
       NEW.missions_completed  IS DISTINCT FROM OLD.missions_completed OR
       NEW.xp_today            IS DISTINCT FROM OLD.xp_today OR
       NEW.inspired_available  IS DISTINCT FROM OLD.inspired_available OR
       NEW.inspired_earned_at  IS DISTINCT FROM OLD.inspired_earned_at
     ) THEN
    RAISE EXCEPTION 'Colunas de progressão são protegidas — use os RPCs do jogo.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_profiles_economy ON public.profiles;
CREATE TRIGGER guard_profiles_economy
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._guard_profiles_economy();

REVOKE UPDATE ON public.attributes   FROM PUBLIC, anon, authenticated;
REVOKE UPDATE ON public.user_balance FROM PUBLIC, anon, authenticated;
