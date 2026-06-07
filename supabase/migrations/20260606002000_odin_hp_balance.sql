-- Balanceamento do Odin (3v1): 2400 -> 2200 (~1.7x dos vizinhos lv44-52 ~1300).
-- Climático mas não grind; o motor de combos (DoT/sangramento) recompensa a luta longa.
UPDATE public.bosses SET hp = 2200, hp_max = 2200 WHERE name ILIKE '%Odin%';
