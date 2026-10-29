# Poções automáticas: fixtures públicas locais

- `hp.json` e `mp.json` são respostas completas de `public.sync_auto_adventure()` como `authenticated`, cada uma com `battle`, timeline, estado e limites. Foram capturadas em PostgreSQL 17.9 após v4 → AoE → migration de poções, usando identidades sintéticas e os scripts `capture_hp.sql` / `capture_mp.sql`.
- `public-fixture.json` contém um evento HP, um MP e respostas reais de `public.get_adventure_auto_potions_state()` antes e depois do horário de uso de uma reserva HP. A captura aguardou o relógio do próprio banco, sem alterar a hora do sistema.
- Nenhum arquivo contém token, chave ou dado de conta real. Os UUIDs de item são do catálogo local e o UUID de batalha foi gerado no clone.

## Contrato para a cena

Eventos de consumível são ações do herói `kind='skill'`, `skill_type='heal'`, `damage=0`, `target_slot=null`, `target_slots=[]`, `hits=[]`, `mp_cost=0`. `consumable.hp` informa `healing>0`, `effect='light'`; `consumable.mp` informa `mp_restored>0`, `healing=0`, `effect='arcane'`. Ambos trazem `hero_hp` e `hero_mp` após o uso. O readout de MP deve usar `mp_restored`, sem tratar o evento como ataque ou cura de HP.

O estado do painel vem do RPC próprio: `stock` já exclui unidades reservadas; `reservations[].status` é `reserved` enquanto `event_at>server_now` e `used` quando `event_at<=server_now`. `battle_id` identifica a luta à qual os recibos se referem. A opção `enabled` vale só para batalhas iniciadas após sua seleção efetiva.

## Reprodução

Em um clone PostgreSQL 17.9 com fonte v4 congelada (`mage_pre` no teste), aplicar `20261029035917_mage_area_hero_hits.sql` e depois `20261029043726_adventure_auto_potions.sql` com `psql -X -v ON_ERROR_STOP=1 -f`. Executar os SQLs em `supabase/tests/auto_potions_20261029/`; `capture_hp.sql`, `capture_mp.sql` e `fixture_capture.sql` produzem as três respostas JSON. Os scripts usam somente identidades sintéticas locais.

O catálogo automático aceita apenas os cinco pares protegidos `(id,effect)` de HP `heal_30`, `heal_80`, `heal_200` e MP `mana_20`, `mana_60`; seleciona a menor recuperação disponível e elegível pelo nível da luta. Efeitos mistos, `restore_mp_20` e outros consumíveis não entram no motor nem no estoque compatível do painel.
