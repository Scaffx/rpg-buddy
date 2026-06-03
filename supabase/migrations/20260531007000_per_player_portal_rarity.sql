-- ================================================================
-- Raridade de portal POR JOGADOR, escalada por nível.
-- Antes: uma cor por evento semanal (igual pra todos).
-- Agora: cada jogador sorteia a própria raridade (cor) com base no nível,
-- gravada em player_portal_rolls. A escrita só acontece dentro de funções
-- SECURITY DEFINER (RLS bloqueia insert direto → não dá pra re-rolar).
-- Mapa raridade→cor: comum=blue, raro=yellow, mítico=red, lendário=legendary.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.player_portal_rolls (
  user_id      uuid NOT NULL,
  event_id     uuid NOT NULL,
  portal_color text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

ALTER TABLE public.player_portal_rolls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own portal rolls" ON public.player_portal_rolls;
CREATE POLICY "Users can view own portal rolls"
  ON public.player_portal_rolls FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- Sem policy de INSERT/UPDATE: só as funções SECURITY DEFINER escrevem.

-- Sorteio de raridade por nível (tabela de probabilidades acordada)
CREATE OR REPLACE FUNCTION public._roll_portal_color(p_level integer)
RETURNS text
LANGUAGE plpgsql VOLATILE SET search_path = public
AS $$
DECLARE
  v int := GREATEST(1, COALESCE(p_level, 1));
  r numeric := random() * 100;
BEGIN
  IF v <= 10 THEN
    -- 70 / 25 / 5 / 0
    IF r < 70 THEN RETURN 'blue';
    ELSIF r < 95 THEN RETURN 'yellow';
    ELSE RETURN 'red'; END IF;
  ELSIF v <= 25 THEN
    -- 45 / 35 / 15 / 5
    IF r < 45 THEN RETURN 'blue';
    ELSIF r < 80 THEN RETURN 'yellow';
    ELSIF r < 95 THEN RETURN 'red';
    ELSE RETURN 'legendary'; END IF;
  ELSIF v <= 40 THEN
    -- 25 / 35 / 28 / 12
    IF r < 25 THEN RETURN 'blue';
    ELSIF r < 60 THEN RETURN 'yellow';
    ELSIF r < 88 THEN RETURN 'red';
    ELSE RETURN 'legendary'; END IF;
  ELSE
    -- 15 / 30 / 33 / 22
    IF r < 15 THEN RETURN 'blue';
    ELSIF r < 45 THEN RETURN 'yellow';
    ELSIF r < 78 THEN RETURN 'red';
    ELSE RETURN 'legendary'; END IF;
  END IF;
END;
$$;

-- Retorna a cor já sorteada do usuário para o evento, ou sorteia e grava.
CREATE OR REPLACE FUNCTION public._get_or_roll_portal_color(p_uid uuid, p_event_id uuid)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_color text;
  v_level int;
BEGIN
  SELECT portal_color INTO v_color
  FROM public.player_portal_rolls WHERE user_id = p_uid AND event_id = p_event_id;

  IF v_color IS NULL THEN
    SELECT COALESCE(level, 1) INTO v_level FROM public.profiles WHERE user_id = p_uid;
    v_color := public._roll_portal_color(COALESCE(v_level, 1));
    INSERT INTO public.player_portal_rolls (user_id, event_id, portal_color)
    VALUES (p_uid, p_event_id, v_color)
    ON CONFLICT (user_id, event_id) DO NOTHING;
    SELECT portal_color INTO v_color
    FROM public.player_portal_rolls WHERE user_id = p_uid AND event_id = p_event_id;
  END IF;

  RETURN v_color;
END;
$$;

-- ── get_active_portal_event: usa a cor sorteada do jogador ──
CREATE OR REPLACE FUNCTION public.get_active_portal_event()
RETURNS TABLE(event_id uuid, starts_at timestamptz, ends_at timestamptz, hours_left numeric,
              portal_color text, color_revealed boolean, already_completed boolean,
              participant_count bigint, runs_this_week jsonb, pending_dungeon text,
              dungeon_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_event_id UUID;
  v_color TEXT;
  v_revealed BOOLEAN;
BEGIN
  SELECT pe.id INTO v_event_id FROM portal_events pe
   WHERE pe.is_active = TRUE AND pe.starts_at <= NOW() AND pe.ends_at > NOW()
   ORDER BY pe.starts_at DESC LIMIT 1;

  IF v_event_id IS NULL THEN RETURN; END IF;

  -- Garante o sorteio por jogador
  v_color := public._get_or_roll_portal_color(v_uid, v_event_id);

  v_revealed := EXISTS(SELECT 1 FROM portal_scans ps WHERE ps.event_id = v_event_id AND ps.user_id = v_uid)
             OR EXISTS(SELECT 1 FROM portal_runs pr WHERE pr.event_id = v_event_id AND pr.user_id = v_uid AND pr.completed = TRUE);

  RETURN QUERY
  SELECT
    pe.id,
    pe.starts_at,
    pe.ends_at,
    ROUND(EXTRACT(EPOCH FROM (pe.ends_at - NOW())) / 3600, 1),
    CASE WHEN v_revealed THEN v_color ELSE NULL END,
    v_revealed,
    EXISTS(SELECT 1 FROM portal_runs pr WHERE pr.event_id = pe.id AND pr.user_id = v_uid AND pr.completed = TRUE),
    (SELECT COUNT(*) FROM portal_run_participants p2 WHERE p2.event_id = pe.id),
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
          'color', pr.portal_color, 'xp', pr.xp_earned,
          'fragments_received', pr.fragments_received, 'legendary_item', pr.legendary_item_received))
       FROM portal_runs pr
       WHERE pr.user_id = v_uid AND pr.ran_at >= date_trunc('week', NOW()) AND pr.completed = TRUE),
      '[]'::jsonb),
    ppf.pending_dungeon,
    ppf.dungeon_expires_at
  FROM portal_events pe
  LEFT JOIN player_portal_fragments ppf ON ppf.user_id = v_uid
  WHERE pe.id = v_event_id;
END;
$$;

-- ── scan_portal: revela a cor sorteada DO USUÁRIO ──
CREATE OR REPLACE FUNCTION public.scan_portal(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_scanner_id UUID;
  v_inv_id UUID;
  v_color TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM portal_events WHERE id = p_event_id AND is_active = TRUE AND ends_at > NOW()) THEN
    RETURN jsonb_build_object('error', 'Portal não encontrado ou já expirado.');
  END IF;

  v_color := public._get_or_roll_portal_color(v_uid, p_event_id);

  IF EXISTS(SELECT 1 FROM portal_scans WHERE event_id = p_event_id AND user_id = v_uid) THEN
    RETURN jsonb_build_object('portal_color', v_color, 'already_scanned', TRUE);
  END IF;

  SELECT gi.id INTO v_scanner_id FROM game_items gi
  WHERE gi.effect = 'portal_scan' AND gi.is_consumable = TRUE LIMIT 1;
  IF v_scanner_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Item Escaner de Portal não encontrado no sistema.');
  END IF;

  SELECT pi.id INTO v_inv_id FROM player_inventory pi
  WHERE pi.user_id = v_uid AND pi.item_id = v_scanner_id AND pi.quantity > 0 LIMIT 1;
  IF v_inv_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Você não possui um Escaner de Portal.');
  END IF;

  UPDATE player_inventory SET quantity = quantity - 1 WHERE id = v_inv_id;
  DELETE FROM player_inventory WHERE id = v_inv_id AND quantity <= 0;

  INSERT INTO portal_scans (event_id, user_id) VALUES (p_event_id, v_uid) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('portal_color', v_color, 'already_scanned', FALSE);
END;
$$;

-- ── complete_portal_run (3 args): usa a cor sorteada do usuário ──
CREATE OR REPLACE FUNCTION public.complete_portal_run(p_event_id uuid, p_xp_earned integer, p_gold_earned integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid              UUID := auth.uid();
  v_already_won      BOOLEAN;
  v_portal_color     TEXT;
  v_max_frags        INTEGER;
  v_frag_chance      NUMERIC;
  v_frags_dropped    INTEGER := 0;
  v_frag_per_player  INTEGER := 0;
  v_legendary_drop   BOOLEAN := FALSE;
  v_participant_count BIGINT;
  v_dungeon_tier     TEXT;
  v_roll             NUMERIC;
  v_week_start       DATE;
  v_dungeon_already  TEXT;
  r                  RECORD;
BEGIN
  SELECT EXISTS(SELECT 1 FROM portal_runs WHERE user_id = v_uid AND event_id = p_event_id AND completed = TRUE)
  INTO v_already_won;
  IF v_already_won THEN RETURN jsonb_build_object('already_claimed', TRUE); END IF;

  IF NOT EXISTS (SELECT 1 FROM portal_events WHERE id = p_event_id AND is_active = TRUE) THEN
    RETURN jsonb_build_object('error', 'Portal não encontrado.');
  END IF;

  -- Cor sorteada DO USUÁRIO (não a global)
  v_portal_color := public._get_or_roll_portal_color(v_uid, p_event_id);

  CASE v_portal_color
    WHEN 'blue'      THEN v_frag_chance := 0.05; v_max_frags := 2;
    WHEN 'yellow'    THEN v_frag_chance := 0.10; v_max_frags := 3;
    WHEN 'red'       THEN v_frag_chance := 0.15; v_max_frags := 4;
    WHEN 'legendary' THEN v_frag_chance := 0.25; v_max_frags := 6;
    ELSE                  v_frag_chance := 0.05; v_max_frags := 1;
  END CASE;

  IF v_portal_color IN ('red','legendary') AND random() < 0.05 THEN
    v_legendary_drop := TRUE;
  END IF;

  INSERT INTO portal_run_participants (event_id, user_id) VALUES (p_event_id, v_uid) ON CONFLICT DO NOTHING;

  INSERT INTO portal_runs
    (user_id, event_id, portal_color, completed, xp_earned, gold_earned, fragment_earned, fragments_received, legendary_item_received)
  VALUES
    (v_uid, p_event_id, v_portal_color, TRUE, p_xp_earned, p_gold_earned, FALSE, 0, v_legendary_drop);

  IF random() < v_frag_chance THEN
    v_frags_dropped := 1 + floor(random() * v_max_frags)::INTEGER;
  END IF;

  SELECT COUNT(*) INTO v_participant_count FROM portal_run_participants WHERE event_id = p_event_id;

  IF v_frags_dropped > 0 AND v_participant_count > 0 THEN
    v_frag_per_player := GREATEST(1, floor(v_frags_dropped::NUMERIC / v_participant_count)::INTEGER);
    FOR r IN SELECT prp.user_id FROM portal_run_participants prp WHERE prp.event_id = p_event_id LOOP
      UPDATE portal_runs SET fragment_earned = TRUE, fragments_received = v_frag_per_player
      WHERE user_id = r.user_id AND event_id = p_event_id AND completed = TRUE;

      v_week_start := date_trunc('week', NOW())::DATE;
      INSERT INTO player_portal_fragments (user_id, fragments, lifetime_fragments, weekly_fragments, week_start)
      VALUES (r.user_id, v_frag_per_player, v_frag_per_player, v_frag_per_player, v_week_start)
      ON CONFLICT (user_id) DO UPDATE SET
        fragments          = player_portal_fragments.fragments + v_frag_per_player,
        lifetime_fragments = player_portal_fragments.lifetime_fragments + v_frag_per_player,
        weekly_fragments   = CASE WHEN player_portal_fragments.week_start = v_week_start
                                  THEN player_portal_fragments.weekly_fragments + v_frag_per_player
                                  ELSE v_frag_per_player END,
        week_start = v_week_start, updated_at = NOW();
    END LOOP;
  END IF;

  SELECT ppf.pending_dungeon INTO v_dungeon_already FROM player_portal_fragments ppf WHERE ppf.user_id = v_uid;
  IF v_dungeon_already IS NULL THEN
    v_roll := random() * 100;
    IF    v_roll < 45 THEN v_dungeon_tier := 'medium';
    ELSIF v_roll < 80 THEN v_dungeon_tier := 'hard';
    ELSIF v_roll < 95 THEN v_dungeon_tier := 'legendary';
    ELSE                   v_dungeon_tier := 'ultra';
    END IF;
    UPDATE player_portal_fragments
    SET pending_dungeon = v_dungeon_tier, dungeon_revealed_at = NOW(), dungeon_expires_at = NOW() + INTERVAL '7 days'
    WHERE user_id = v_uid;
  ELSE
    v_dungeon_tier := v_dungeon_already;
  END IF;

  RETURN jsonb_build_object(
    'already_claimed', FALSE, 'portal_color', v_portal_color, 'frags_dropped', v_frags_dropped,
    'frag_per_player', v_frag_per_player, 'participant_count', v_participant_count,
    'legendary_item', v_legendary_drop, 'dungeon_tier', v_dungeon_tier);
END;
$$;
