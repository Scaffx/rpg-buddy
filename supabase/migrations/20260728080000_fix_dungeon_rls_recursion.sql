-- Corrige recursão infinita (42P17) nas policies das masmorras.
--
-- Havia dois ciclos:
--   1. dungeon_session_players_select consultava a PRÓPRIA tabela no USING
--      (alias dsp2) — auto-recursão;
--   2. dungeon_sessions_select consultava dungeon_session_players, cuja policy
--      de SELECT consultava dungeon_sessions de volta — recursão mútua.
--
-- Resultado prático: qualquer leitura estourava 42P17 e a masmorra multiplayer
-- ficava inoperante.
--
-- A saída padrão é mover a checagem para funções SECURITY DEFINER: elas rodam
-- ignorando RLS, então a policy consulta a tabela sem reentrar na própria
-- policy. As funções são propositalmente estreitas — respondem só "sim/não"
-- sobre o usuário autenticado, sem vazar linha nenhuma.

CREATE OR REPLACE FUNCTION public.is_dungeon_participant(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dungeon_session_players
    WHERE session_id = p_session_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_dungeon_host(p_session_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dungeon_sessions
    WHERE id = p_session_id AND host_user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_dungeon_participant(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_dungeon_host(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_dungeon_participant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_dungeon_host(uuid) TO authenticated;

-- Mesma regra de visibilidade de antes, agora sem o ciclo.
DROP POLICY IF EXISTS dungeon_sessions_select ON public.dungeon_sessions;
CREATE POLICY dungeon_sessions_select ON public.dungeon_sessions
  FOR SELECT TO authenticated
  USING (host_user_id = auth.uid() OR public.is_dungeon_participant(id));

DROP POLICY IF EXISTS dungeon_session_players_select ON public.dungeon_session_players;
CREATE POLICY dungeon_session_players_select ON public.dungeon_session_players
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_dungeon_host(session_id));
