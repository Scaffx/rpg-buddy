-- Fase 2a: RPCs das raides-evento (cap dinâmico, classe/curandeiro, trava de composição).

-- create_dungeon_session: agora também grava a classe/healer do host (consistência).
CREATE OR REPLACE FUNCTION public.create_dungeon_session(p_dungeon_id text, p_display_name text, p_current_hp integer, p_max_hp integer, p_player_level integer, p_player_atk integer, p_player_def integer)
 RETURNS TABLE(session_id uuid, invite_code text, layout_index integer)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_session_id UUID;
  v_code TEXT;
  v_layout INTEGER;
  v_attempt INTEGER := 0;
  v_class_id uuid; v_is_healer boolean;
BEGIN
  UPDATE dungeon_sessions SET status = 'failed'
  WHERE host_user_id = auth.uid() AND dungeon_id = p_dungeon_id AND status = 'waiting';

  LOOP
    v_code := generate_dungeon_invite_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM dungeon_sessions ds WHERE ds.invite_code = v_code);
    v_attempt := v_attempt + 1;
    IF v_attempt > 20 THEN RAISE EXCEPTION 'Could not generate unique invite code'; END IF;
  END LOOP;

  v_layout := floor(random() * 3)::integer;

  SELECT p.current_class_id, COALESCE(c.is_healer, false) INTO v_class_id, v_is_healer
  FROM profiles p LEFT JOIN classes c ON c.id = p.current_class_id WHERE p.user_id = auth.uid();

  INSERT INTO dungeon_sessions (dungeon_id, host_user_id, invite_code, layout_index)
  VALUES (p_dungeon_id, auth.uid(), v_code, v_layout) RETURNING id INTO v_session_id;

  INSERT INTO dungeon_session_players
    (session_id, user_id, display_name, current_hp, max_hp, player_level, player_atk, player_def, is_host, player_class_id, is_healer)
  VALUES
    (v_session_id, auth.uid(), p_display_name, p_current_hp, p_max_hp, p_player_level, p_player_atk, p_player_def, TRUE, v_class_id, v_is_healer);

  RETURN QUERY SELECT v_session_id, v_code, v_layout;
END;
$function$;

-- create_event_session: cria uma raide-evento (10 vagas) para um boss is_world_event. Host precisa ser nível 60.
CREATE OR REPLACE FUNCTION public.create_event_session(p_boss_id uuid, p_display_name text, p_current_hp integer, p_max_hp integer, p_player_level integer, p_player_atk integer, p_player_def integer)
 RETURNS TABLE(session_id uuid, invite_code text, layout_index integer)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_session_id UUID; v_code TEXT; v_attempt INTEGER := 0;
  v_class_id uuid; v_is_healer boolean; v_level int; v_is_event boolean;
BEGIN
  SELECT is_world_event INTO v_is_event FROM bosses WHERE id = p_boss_id;
  IF NOT COALESCE(v_is_event, false) THEN
    RAISE EXCEPTION 'Boss inválido para evento mundial.';
  END IF;

  SELECT level, current_class_id INTO v_level, v_class_id FROM profiles WHERE user_id = auth.uid();
  IF COALESCE(v_level, 1) < 60 THEN
    RAISE EXCEPTION 'Apenas heróis nível 60 podem abrir raides de evento mundial.';
  END IF;
  SELECT COALESCE(c.is_healer, false) INTO v_is_healer FROM classes c WHERE c.id = v_class_id;

  UPDATE dungeon_sessions SET status = 'failed'
  WHERE host_user_id = auth.uid() AND event_boss_id = p_boss_id AND status = 'waiting';

  LOOP
    v_code := generate_dungeon_invite_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM dungeon_sessions ds WHERE ds.invite_code = v_code);
    v_attempt := v_attempt + 1;
    IF v_attempt > 20 THEN RAISE EXCEPTION 'Could not generate unique invite code'; END IF;
  END LOOP;

  INSERT INTO dungeon_sessions (dungeon_id, host_user_id, invite_code, layout_index, max_players, event_boss_id)
  VALUES ('event:' || p_boss_id::text, auth.uid(), v_code, 0, 10, p_boss_id) RETURNING id INTO v_session_id;

  INSERT INTO dungeon_session_players
    (session_id, user_id, display_name, current_hp, max_hp, player_level, player_atk, player_def, is_host, player_class_id, is_healer)
  VALUES
    (v_session_id, auth.uid(), p_display_name, p_current_hp, p_max_hp, p_player_level, p_player_atk, p_player_def, TRUE, v_class_id, v_is_healer);

  RETURN QUERY SELECT v_session_id, v_code, 0;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_event_session(uuid,text,integer,integer,integer,integer,integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_event_session(uuid,text,integer,integer,integer,integer,integer) TO authenticated;

-- join_dungeon_session: cap dinâmico por max_players + grava classe/healer do entrante.
CREATE OR REPLACE FUNCTION public.join_dungeon_session(p_invite_code text, p_display_name text, p_current_hp integer, p_max_hp integer, p_player_level integer, p_player_atk integer, p_player_def integer)
 RETURNS TABLE(session_id uuid, dungeon_id text, layout_index integer, host_name text)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_session dungeon_sessions%ROWTYPE;
  v_player_count INTEGER;
  v_host_name TEXT;
  v_class_id uuid; v_is_healer boolean;
BEGIN
  SELECT * INTO v_session FROM dungeon_sessions
  WHERE invite_code = upper(p_invite_code) AND status = 'waiting';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão não encontrada ou já iniciada. Verifique o código.';
  END IF;

  SELECT COUNT(*) INTO v_player_count FROM dungeon_session_players WHERE session_id = v_session.id;
  IF v_player_count >= v_session.max_players THEN
    RAISE EXCEPTION 'Sessão cheia — máximo % jogadores.', v_session.max_players;
  END IF;

  IF EXISTS (SELECT 1 FROM dungeon_session_players WHERE session_id = v_session.id AND user_id = auth.uid()) THEN
    SELECT display_name INTO v_host_name FROM dungeon_session_players WHERE session_id = v_session.id AND is_host = TRUE LIMIT 1;
    RETURN QUERY SELECT v_session.id, v_session.dungeon_id, v_session.layout_index, v_host_name;
    RETURN;
  END IF;

  SELECT p.current_class_id, COALESCE(c.is_healer, false) INTO v_class_id, v_is_healer
  FROM profiles p LEFT JOIN classes c ON c.id = p.current_class_id WHERE p.user_id = auth.uid();

  INSERT INTO dungeon_session_players
    (session_id, user_id, display_name, current_hp, max_hp, player_level, player_atk, player_def, is_host, player_class_id, is_healer)
  VALUES
    (v_session.id, auth.uid(), p_display_name, p_current_hp, p_max_hp, p_player_level, p_player_atk, p_player_def, FALSE, v_class_id, v_is_healer);

  SELECT display_name INTO v_host_name FROM dungeon_session_players WHERE session_id = v_session.id AND is_host = TRUE LIMIT 1;
  RETURN QUERY SELECT v_session.id, v_session.dungeon_id, v_session.layout_index, v_host_name;
END;
$function$;

-- start_dungeon_session: em eventos, exige ao menos 1 curandeiro (trava de composição).
CREATE OR REPLACE FUNCTION public.start_dungeon_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_player_count INTEGER;
  v_event_boss uuid;
  v_healers INTEGER;
BEGIN
  SELECT event_boss_id INTO v_event_boss FROM dungeon_sessions
  WHERE id = p_session_id AND host_user_id = auth.uid() AND status = 'waiting';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Apenas o host pode iniciar a sessão.';
  END IF;

  SELECT COUNT(*) INTO v_player_count FROM dungeon_session_players WHERE session_id = p_session_id;
  IF v_player_count < 2 THEN
    RAISE EXCEPTION 'Precisa de pelo menos 2 jogadores para iniciar.';
  END IF;

  IF v_event_boss IS NOT NULL THEN
    SELECT COUNT(*) INTO v_healers FROM dungeon_session_players WHERE session_id = p_session_id AND is_healer = TRUE;
    IF v_healers < 1 THEN
      RAISE EXCEPTION 'Raides de evento exigem ao menos 1 curandeiro na composição.';
    END IF;
  END IF;

  UPDATE dungeon_sessions SET status = 'in_progress', updated_at = NOW() WHERE id = p_session_id;
END;
$function$;
