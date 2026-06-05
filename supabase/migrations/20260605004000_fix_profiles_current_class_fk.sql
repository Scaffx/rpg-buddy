-- Fix do social: o cliente faz embedded join 'classes!profiles_current_class_id_fkey'
-- (useFriends: amigos, pedidos pendentes e enviados), mas a FK não existia → a query
-- de perfis falhava silenciosamente e os nomes não apareciam. Cria a FK esperada.
-- (0 órfãos verificados; ON DELETE SET NULL para não travar exclusão de classe.)
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_current_class_id_fkey
  FOREIGN KEY (current_class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
