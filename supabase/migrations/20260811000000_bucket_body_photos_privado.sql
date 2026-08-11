-- ============================================================================
-- Bucket body-photos, PRIVADO
--
-- O codigo faz upload para 'body-photos' em dois lugares — fotos de progresso
-- corporal (ProfilePage) e exames medicos (HealthPage) — mas o bucket nunca
-- existiu. Os dois recursos falham em silencio desde sempre.
--
-- Privado de proposito, ao contrario de 'avatars'. Foto de corpo e exame
-- medico sao dado sensivel; num bucket publico, qualquer pessoa com a URL le
-- o arquivo, sem login e sem RLS. O acesso passa a ser por URL assinada.
--
-- As policies espelham as de avatars: o dono e o primeiro segmento do caminho
-- (`${user.id}/arquivo`), que e como todo upload do app monta o nome. A
-- diferenca esta no SELECT — aqui so o dono le.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'body-photos',
  'body-photos',
  false,
  10485760,  -- 10 MB: exame em PDF passa de 2 MB com facilidade
  ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users read own body photos"   ON storage.objects;
DROP POLICY IF EXISTS "Users upload own body photos" ON storage.objects;
DROP POLICY IF EXISTS "Users update own body photos" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own body photos" ON storage.objects;

-- SELECT restrito ao dono: e isso que diferencia de avatars.
CREATE POLICY "Users read own body photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'body-photos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY "Users upload own body photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'body-photos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

CREATE POLICY "Users update own body photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'body-photos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- DELETE precisa existir para a exclusao de conta conseguir limpar os
-- arquivos pela Storage API (ver DeleteAccountSection).
CREATE POLICY "Users delete own body photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'body-photos'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );
