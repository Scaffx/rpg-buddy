-- Fase 2a: fundação de schema para raides-evento de 10 jogadores + trava de curandeiro.

-- 1) Classes: marca o ramo curandeiro (Noviço → Sacerdote/Monge → Sumo Sacerdote/Mestre Monge).
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS is_healer boolean NOT NULL DEFAULT false;

UPDATE public.classes SET is_healer = true
 WHERE name IN ('Noviço', 'Sacerdote', 'Sumo Sacerdote', 'Monge', 'Mestre Monge');

-- 2) Sessões: tamanho máximo (4 normal, 10 evento) e vínculo opcional com boss de evento.
ALTER TABLE public.dungeon_sessions
  ADD COLUMN IF NOT EXISTS max_players integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS event_boss_id uuid REFERENCES public.bosses(id);

-- 3) Jogadores da sessão: guarda a classe e se é curandeiro (para a trava de composição).
ALTER TABLE public.dungeon_session_players
  ADD COLUMN IF NOT EXISTS player_class_id uuid,
  ADD COLUMN IF NOT EXISTS is_healer boolean NOT NULL DEFAULT false;
