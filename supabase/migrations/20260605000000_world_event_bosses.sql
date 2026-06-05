-- Bosses de evento mundial (raides de 10 jogadores, instâncias independentes) + boss final.
-- Fase 1 do redesenho de endgame: os 3 bosses de topo saem da escada normal e viram
-- raides-evento nível 60; Chronos passa a ser o boss final da progressão normal.
ALTER TABLE public.bosses
  ADD COLUMN IF NOT EXISTS is_world_event boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_final_boss  boolean NOT NULL DEFAULT false;

-- Os 3 viram raides-evento nível 60, HP fixo alto (15.000), fora da escada normal.
UPDATE public.bosses
   SET is_world_event = true, level = 60, hp = 15000, hp_max = 15000
 WHERE name IN (
   'Entidade do Vazio Absoluto',
   'Gaia Corrompida',
   'Ragnarök, Destruidor de Mundos'
 );

-- Chronos: boss final da escada normal (os 3 acima saíram da lista).
UPDATE public.bosses
   SET is_final_boss = true
 WHERE name = 'Chronos, Deus do Tempo';
