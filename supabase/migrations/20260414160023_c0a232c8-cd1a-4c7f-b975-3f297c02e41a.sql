-- Add boss_keys to profiles
ALTER TABLE public.profiles ADD COLUMN boss_keys integer NOT NULL DEFAULT 0;

-- Add keys_cost and gold_reward to bosses
ALTER TABLE public.bosses ADD COLUMN keys_cost integer NOT NULL DEFAULT 1;
ALTER TABLE public.bosses ADD COLUMN gold_reward integer NOT NULL DEFAULT 10;

-- Update bosses: reduce XP drastically, set keys_cost = ceil(level/2), set gold_reward
UPDATE public.bosses SET 
  keys_cost = CEIL(level::numeric / 2),
  gold_reward = level * 5 + 10,
  xp_reward = GREATEST(10, CEIL(xp_reward * 0.1));
