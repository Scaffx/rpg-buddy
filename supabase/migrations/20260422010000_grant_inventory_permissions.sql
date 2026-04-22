-- Garante permissões table-level para anon e authenticated
-- Novas colunas adicionadas por ADD COLUMN não herdam column-level grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_inventory TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
