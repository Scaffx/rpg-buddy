
CREATE OR REPLACE FUNCTION public.get_rank(user_level INTEGER)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE
    WHEN user_level >= 50 THEN 'Lendário'
    WHEN user_level >= 30 THEN 'Mestre'
    WHEN user_level >= 20 THEN 'Veterano'
    WHEN user_level >= 10 THEN 'Guerreiro'
    WHEN user_level >= 5 THEN 'Aprendiz'
    ELSE 'Novato'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;
