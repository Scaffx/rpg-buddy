-- ============================================================================
-- Missão em conjunto ganha META e PRAZO
--
-- Hoje a missão em conjunto só tem título e descrição. Isso deixa o combinado
-- no texto livre: "correr 10 km todo dia durante uma semana" vira uma frase
-- que ninguém consegue medir, e o grupo não sabe quando terminou nem se
-- cumpriu.
--
-- Passam a existir dois números explícitos:
--   target_count  — quantas vezes cada participante precisa cumprir
--   duration_days — em quantos dias, contados da criação
--   ends_at       — derivado, para ordenar e expirar sem recalcular no cliente
--
-- Os defaults (1 vez em 7 dias) mantêm as missões já criadas coerentes: elas
-- passam a ser "uma vez na semana", que é a leitura mais próxima do que
-- significavam quando não havia meta nenhuma.
-- ============================================================================

ALTER TABLE public.co_op_missions
  ADD COLUMN IF NOT EXISTS target_count  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS duration_days INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS ends_at       TIMESTAMPTZ;

ALTER TABLE public.co_op_missions
  DROP CONSTRAINT IF EXISTS co_op_missions_target_count_check,
  DROP CONSTRAINT IF EXISTS co_op_missions_duration_days_check;

ALTER TABLE public.co_op_missions
  ADD CONSTRAINT co_op_missions_target_count_check  CHECK (target_count  BETWEEN 1 AND 365),
  ADD CONSTRAINT co_op_missions_duration_days_check CHECK (duration_days BETWEEN 1 AND 365);

-- Preenche o prazo das que já existem, a partir da data de criação delas.
UPDATE public.co_op_missions
   SET ends_at = created_at + (duration_days || ' days')::interval
 WHERE ends_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_co_op_missions_ends_at
  ON public.co_op_missions(ends_at);

-- ----------------------------------------------------------------------------
-- create_co_op_mission passa a receber meta e prazo.
--
-- Os parâmetros novos têm DEFAULT para que a assinatura antiga continue
-- válida: cliente desatualizado segue funcionando e cai no 1x em 7 dias.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_co_op_mission(
  p_title         text,
  p_description   text,
  p_member_ids    uuid[],
  p_target_count  int DEFAULT 1,
  p_duration_days int DEFAULT 7
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_mission_id uuid;
  v_uid        uuid;
  v_max        int;
  v_target     int;
  v_dias       int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  -- Limita aqui também, e não só no CHECK: erro de constraint não explica
  -- nada para quem está na tela.
  v_target := LEAST(365, GREATEST(1, COALESCE(p_target_count, 1)));
  v_dias   := LEAST(365, GREATEST(1, COALESCE(p_duration_days, 7)));

  IF v_target > v_dias THEN
    RAISE EXCEPTION 'A meta (% vezes) nao cabe no prazo (% dias)', v_target, v_dias;
  END IF;

  -- max_players = total convidados + criador, limitado entre 2 e 5
  v_max := LEAST(5, GREATEST(2, COALESCE(array_length(p_member_ids, 1), 0) + 1));

  INSERT INTO public.co_op_missions (
    creator_id, title, description, max_players,
    target_count, duration_days, ends_at
  )
  VALUES (
    v_uid, p_title, p_description, v_max,
    v_target, v_dias, now() + (v_dias || ' days')::interval
  )
  RETURNING id INTO v_mission_id;

  INSERT INTO public.co_op_mission_members (mission_id, user_id)
  VALUES (v_mission_id, v_uid)
  ON CONFLICT DO NOTHING;

  IF p_member_ids IS NOT NULL THEN
    FOR i IN 1..COALESCE(array_length(p_member_ids, 1), 0) LOOP
      INSERT INTO public.co_op_mission_members (mission_id, user_id)
      VALUES (v_mission_id, p_member_ids[i])
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  UPDATE public.co_op_missions SET status = 'active' WHERE id = v_mission_id;

  RETURN v_mission_id;
END;
$function$;

NOTIFY pgrst, 'reload schema';
