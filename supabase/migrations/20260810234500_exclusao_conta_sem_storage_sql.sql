-- ============================================================================
-- delete_my_account: tira o DELETE em storage.objects, que quebrava tudo
--
-- O Supabase protege as tabelas de storage com o trigger
-- storage.protect_delete(), que levanta excecao em DELETE direto:
--
--   ERROR: Direct deletion from storage tables is not allowed.
--          Use the Storage API instead.
--
-- Como esse DELETE vinha ANTES do DELETE em auth.users e tudo roda na mesma
-- transacao, a excecao abortava a funcao inteira: quem clicava em "Excluir
-- minha conta" recebia erro e NADA era apagado. A exclusao de conta, que
-- existe justamente para cumprir exigencia da Google Play, estava quebrada
-- desde que foi criada.
--
-- Nao da para contornar por SQL — nem com bloco de excecao, porque aceitar a
-- falha calada deixaria o arquivo para tras e a exclusao seria incompleta.
-- Arquivo de usuario passa a ser removido pelo cliente, via Storage API,
-- ANTES de chamar esta funcao (ver src/components/DeleteAccountSection.tsx).
--
-- Todos os uploads do app usam o id do usuario como primeiro segmento do
-- caminho (`${user.id}/...`), entao a limpeza por prefixo cobre tudo.
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
          'user_id','owner_user_id','creator_id','host_user_id',
          'requester_id','receiver_id','sender_id','challenger_id',
          'opponent_id','user_a_id','user_b_id','recipient_user_id',
          'reporter_id','reported_user_id','blocker_id','blocked_id'
        )
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.table_name, r.column_name)
          USING uid;
      EXCEPTION
        WHEN foreign_key_violation THEN
          pendentes := pendentes + 1;
      END;
    END LOOP;

    EXIT WHEN pendentes = 0 OR passada >= 5;
  END LOOP;

  -- storage.objects NAO entra aqui de proposito: ver cabecalho.

  DELETE FROM auth.users WHERE id = uid;
END $fn$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

NOTIFY pgrst, 'reload schema';
