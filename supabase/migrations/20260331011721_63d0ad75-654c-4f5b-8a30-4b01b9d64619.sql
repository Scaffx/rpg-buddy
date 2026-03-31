
-- Add secondary_attribute_ids column to missions
ALTER TABLE public.missions ADD COLUMN IF NOT EXISTS secondary_attribute_ids jsonb DEFAULT '[]'::jsonb;

-- Update handle_new_user to include Autoaperfeiçoamento and Relacionamento
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', 'Aventureiro'));
  
  INSERT INTO public.attributes (user_id, name, icon, xp, level) VALUES
    (NEW.id, 'Agilidade', '⚡', 0, 1),
    (NEW.id, 'Carisma', '👤', 0, 1),
    (NEW.id, 'Criatividade', '🎨', 0, 1),
    (NEW.id, 'Disciplina', '✨', 0, 1),
    (NEW.id, 'Força', '💪', 0, 1),
    (NEW.id, 'Inteligência', '🧠', 0, 1),
    (NEW.id, 'Resiliência', '🛡️', 0, 1),
    (NEW.id, 'Sabedoria', '📚', 0, 1),
    (NEW.id, 'Vitalidade', '❤️', 0, 1),
    (NEW.id, 'Autoaperfeiçoamento', '⭐', 0, 1),
    (NEW.id, 'Relacionamento', '💜', 0, 1);
  
  RETURN NEW;
END;
$function$;
