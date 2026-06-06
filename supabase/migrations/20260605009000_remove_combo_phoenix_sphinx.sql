-- Roadmap #2: remove o boss-combo estático "Fênix + Esfinge do Deserto" (lv12).
-- Ele vira encadeamento de história (Fênix lv10 -> Sphinx do Deserto lv14 -> se unem),
-- não um boss da lista. Seguro deletar: 0 boss_battles e 0 combates_ativos referenciam.
-- prereq_boss_id de outros bosses nunca aponta para o combo (ele era "não-bloqueante").

DELETE FROM public.bosses WHERE name = 'Fênix + Esfinge do Deserto' AND is_world_event = false;

-- Re-deriva a cadeia de pré-requisitos (idempotente) após a remoção.
UPDATE public.bosses b
SET prereq_boss_id = (
  SELECT e.id
  FROM public.bosses e
  WHERE e.is_world_event = false
    AND e.name NOT IN ('Fênix Renascente', 'Fênix + Esfinge do Deserto', 'Guerreiro Imortal')
    AND (e.level, e.name) < (b.level, b.name)
  ORDER BY e.level DESC, e.name DESC
  LIMIT 1
)
WHERE b.is_world_event = false;
