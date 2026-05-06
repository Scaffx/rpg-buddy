-- Permite que qualquer usuário autenticado leia perfis de outros jogadores.
-- Necessário para exibir nome, nível e classe nas solicitações de amizade,
-- ranking e outras funcionalidades sociais.
-- Os dados são públicos por natureza (nome, nível, classe, avatar).
CREATE POLICY "Authenticated users can view any profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);
