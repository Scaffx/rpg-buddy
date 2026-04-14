-- Add last_name_change column to profiles to track weekly name change limit
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name_change TIMESTAMPTZ DEFAULT NULL;
