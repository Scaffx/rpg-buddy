
-- Add onboarding_completed to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Add region for regional ranking
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS region text DEFAULT NULL;
