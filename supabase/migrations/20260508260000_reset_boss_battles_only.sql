-- Reset boss battles and active combats for all users
-- Run this whenever the boss system needs a fresh start (e.g. after XP rebalancing)

DELETE FROM public.boss_battles;
DELETE FROM public.combates_ativos;
