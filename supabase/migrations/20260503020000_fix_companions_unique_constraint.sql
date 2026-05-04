-- Fix: remove erroneous UNIQUE(user_id) constraint on companions table
-- This was blocking users from having both a lvl3_choice AND a boss_story companion.
-- The correct constraint UNIQUE(user_id, origin) (companions_user_id_origin_key) is kept.
ALTER TABLE public.companions DROP CONSTRAINT IF EXISTS companions_user_id_key;

-- Reset any orphaned adopt choices (skeleton_champion='adopt' but no companion row)
-- so the story dialog re-triggers on next Esqueleto Campeão defeat.
UPDATE public.hero_story_choices
SET skeleton_champion = NULL, updated_at = now()
WHERE skeleton_champion = 'adopt'
  AND user_id NOT IN (
    SELECT user_id FROM public.companions WHERE origin = 'boss_story'
  );
