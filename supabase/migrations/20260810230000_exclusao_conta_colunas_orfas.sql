-- ============================================================================
-- delete_my_account: fecha seis colunas de dono que a varredura não pegava
--
-- A função varre o catálogo procurando colunas de dono em vez de listar
-- tabela por tabela — a ideia era justamente sobreviver a tabelas novas. Mas
-- a varredura casa por NOME de coluna, e seis colunas fugiram do padrão
-- previsto, sobrevivendo à exclusão e apontando para um usuário que não
-- existe mais:
--
--   co_op_missions.creator_id
--   dungeon_partnerships.user_a_id
--   dungeon_partnerships.user_b_id
--   dungeon_sessions.host_user_id
--   subscription_access_keys.owner_user_id
--   subscription_access_keys.recipient_user_id
--
-- subscription_access_keys é a mais séria: guarda vínculo de assinatura.
--
-- Não dá para derivar essa lista de foreign keys porque NENHUMA tabela de
-- public referencia auth.users — foi o que criou o problema original. E casar
-- por tipo uuid sozinho seria pior: apagaria linha por id que não é de dono.
-- Então a lista é explícita e precisa de auditoria quando entrar tabela nova.
--
-- Consulta de auditoria (roda quando criar tabela com dono):
--
--   SELECT c.table_name, c.column_name
--   FROM information_schema.columns c
--   JOIN information_schema.tables t
--     ON t.table_schema = c.table_schema AND t.table_name = c.table_name
--    AND t.table_type = 'BASE TABLE'
--   WHERE c.table_schema = 'public' AND c.data_type = 'uuid'
--     AND c.column_name ~ '(user|owner|player|hero|profile|author|creator|member|friend|opponent|challenger|host|recipient)'
--     AND c.column_name NOT IN ( ...lista abaixo... );
--
-- Falso positivo conhecido: dungeon_session_players.player_class_id aponta
-- para classe, não para usuário. Não incluir.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  uid       UUID := auth.uid();
  r         RECORD;
  passada   INT := 0;
  pendentes INT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sem sessao: exclusao exige usuario autenticado';
  END IF;

  LOOP
    passada := passada + 1;
    pendentes := 0;

    FOR r IN
      SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name  = c.table_name
       AND t.table_type  = 'BASE TABLE'
      WHERE c.table_schema = 'public'
        AND c.data_type = 'uuid'
        AND c.column_name IN (
          -- dono direto
          'user_id','owner_user_id','creator_id','host_user_id',
          -- relações entre dois usuários
          'requester_id','receiver_id','sender_id','challenger_id',
          'opponent_id','user_a_id','user_b_id','recipient_user_id',
          -- moderação
          'reporter_id','reported_user_id','blocker_id','blocked_id'
        )
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.table_name, r.column_name)
          USING uid;
      EXCEPTION
        WHEN foreign_key_violation THEN
          -- Dependência entre tabelas de public: tenta de novo na volta
          -- seguinte, quando a tabela dependente já tiver sido esvaziada.
          pendentes := pendentes + 1;
      END;
    END LOOP;

    EXIT WHEN pendentes = 0 OR passada >= 5;
  END LOOP;

  DELETE FROM storage.objects WHERE owner = uid;
  DELETE FROM auth.users WHERE id = uid;
END $fn$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

NOTIFY pgrst, 'reload schema';
