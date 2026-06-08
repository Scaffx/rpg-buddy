-- Fase B (Cinzas de Guerra): armas concedem uma HABILIDADE própria + afinidade/elemento.
-- weapon_skill (jsonb): { name, power, mpCost, effectType, cooldown, element, desc }
-- weapon_element: afinidade do dano da arma (futuro: aplica a ataques + combina com 2º item)
-- weapon_passive: passiva da arma (ex.: 'bleed', 'burn') — sabor/efeito leve
ALTER TABLE public.game_items
  ADD COLUMN IF NOT EXISTS weapon_skill   jsonb,
  ADD COLUMN IF NOT EXISTS weapon_element text,
  ADD COLUMN IF NOT EXISTS weapon_passive text;

-- Seed: armas iniciais ganham sua Cinza de Guerra + afinidade.
UPDATE public.game_items SET weapon_skill = '{"name":"Corte Brutal","power":42,"mpCost":4,"effectType":"dano","cooldown":2,"element":"neutro","desc":"Golpe cortante que provoca Sangramento."}'::jsonb, weapon_element = 'neutro', weapon_passive = 'bleed' WHERE name = 'Espada Curta';
UPDATE public.game_items SET weapon_skill = '{"name":"Corte Veloz","power":38,"mpCost":4,"effectType":"dano","cooldown":2,"element":"neutro","desc":"Talho rápido que provoca Sangramento."}'::jsonb, weapon_element = 'neutro', weapon_passive = 'bleed' WHERE name = 'Adaga de Sombra';
UPDATE public.game_items SET weapon_skill = '{"name":"Flecha Perfurante","power":40,"mpCost":4,"effectType":"dano","cooldown":2,"element":"neutro","desc":"Disparo penetrante de longo alcance."}'::jsonb, weapon_element = 'neutro' WHERE name = 'Arco Curto';
UPDATE public.game_items SET weapon_skill = '{"name":"Pancada","power":50,"mpCost":5,"effectType":"dano","cooldown":3,"element":"neutro","desc":"Golpe pesado que esmaga a guarda."}'::jsonb, weapon_element = 'neutro' WHERE name = 'Martelo de Aço';
UPDATE public.game_items SET weapon_skill = '{"name":"Dardo Arcano","power":40,"mpCost":5,"effectType":"dano","cooldown":2,"element":"arcano","desc":"Projétil de energia arcana."}'::jsonb, weapon_element = 'arcano' WHERE name = 'Grimório Básico';
UPDATE public.game_items SET weapon_skill = '{"name":"Raio Sereno","power":36,"mpCost":5,"effectType":"dano","cooldown":2,"element":"sagrado","desc":"Feixe de luz sagrada (forte vs mortos-vivos)."}'::jsonb, weapon_element = 'sagrado' WHERE name = 'Cajado de Luz';
UPDATE public.game_items SET weapon_skill = '{"name":"Estocada","power":34,"mpCost":3,"effectType":"dano","cooldown":1,"element":"neutro","desc":"Investida simples de treino."}'::jsonb, weapon_element = 'neutro' WHERE name = 'Adaga de Treino';
