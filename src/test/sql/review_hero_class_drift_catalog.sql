-- Run after the reduced class fixture and before the class migration.
-- Keep IDs, levels and ancestry intact while swapping their meaning.
UPDATE public.classes SET name = CASE id
  WHEN '00000002-0000-0000-0000-000000000001'::uuid THEN 'Mago'
  WHEN '00000002-0000-0000-0000-000000000002'::uuid THEN 'Espadachim'
  ELSE name END
WHERE id IN ('00000002-0000-0000-0000-000000000001'::uuid,
             '00000002-0000-0000-0000-000000000002'::uuid);
DO $$ BEGIN
  IF (SELECT name FROM public.classes
      WHERE id='00000002-0000-0000-0000-000000000001'::uuid) <> 'Mago' THEN
    RAISE EXCEPTION 'bad negative fixture';
  END IF;
END $$;
