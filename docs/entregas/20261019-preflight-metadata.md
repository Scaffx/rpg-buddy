# Preflight de metadata e owner das migrations ainda não publicadas — 19/10/2026

## Escopo e causa

[Certo] Candidato isolado sobre `988b7eb8ee4c1c49fb265b9b209da831c5c78911`. Somente os preflights de `20261019193625_progressao_reversao_checklist.sql` (A1), `20261019220257_undo_mission_derived_effect_receipts.sql` (A12) e `20261019222715_talent_points_atomic_purchase_equip.sql` (P13), mais a prova focada `supabase/tests/20261019_preflight_metadata.mjs`, mudaram. Não há mudança de cálculos, RPCs de negócio, ordem de migrations, fixtures compartilhadas, owner ou ACL por reparo.

[Certo] No PG17 local antes do patch, A1 aceitou `ALTER FUNCTION public.complete_mission(uuid) OWNER TO authenticated` (psql exit 0); A12 aceitou `ALTER FUNCTION public.complete_mission(uuid,date) OWNER TO authenticated`, instalou `private.mission_effect_receipts` e manteve owner `authenticated` (exit 0). Reexecução local da prova do revisor, com A12 de `git show HEAD`, produziu `A12_PREFLIGHT_ACCEPTED_OWNER_DRIFT` e depois `RUNTIME_DENIED_AFTER_OWNER_DRIFT: permissão negada para esquema private`; exit 0 do probe porque a falha era esperada e assertada, seguida de `ROLLBACK`. Causa: `pg_get_functiondef`/`prosrc` não incorporam owner/ACL, e `CREATE OR REPLACE FUNCTION` os preserva. A1 também escolhia a assinatura antiga por `COALESCE` quando um alvo novo coexistia, ocultando o owner do alvo a ser reescrito.

[Certo] Estratégia aprovada pelo coordenador via Orca ask antes da primeira edição. A1 mantém os três vetores de definição conhecidos, normaliza apenas `CRLF` pareado, rejeita `CR` isolado e exige exatamente uma assinatura em cada par semanal/conclusão, além de owner `postgres` e EXECUTE efetivo `anon=false`, `authenticated=false` para helpers e `anon=false`, `authenticated=true` para RPCs públicas. A12 substitui hashes `prosrc` dos quatro RPCs por hashes da definição completa, verifica os três helpers consumidos, owner `postgres` e ACL efetiva correspondente antes do primeiro `CREATE TABLE`. P13 vincula definição completa, owner e ACL efetiva para curva, trigger de pontos e dois helpers antes do primeiro `CREATE FUNCTION`. A definição completa cobre nomes/defaults dos argumentos, retorno, SECURITY, configuração e corpo; grants de `service_role` não são fixados literalmente.

## Ambiente e proveniência

[Certo] Cluster PostgreSQL 17 em `C:\Users\Murillo\AppData\Local\Temp\rpg_preflight_metadata_ctx8d01_20261019`, log `postgres.log`, `127.0.0.1:55583`, bancos descartáveis com prefixo `integration_`. Bases receberam, na ordem, `supabase/tests/20261019_integracao_fixture.sql`, `20261019_integracao_live_effects_fixture.sql` e `20261019_integracao_talent_schema_fixture.sql`, cada uma exit 0. A fixture local antiga dava EXECUTE por `PUBLIC` a `complete_mission(uuid)` e `undo_mission(uuid,date)`, divergindo da captura viva read-only (`anon=false`, `authenticated=true`). Apenas nos bancos locais, antes de A1, executei:

```sql
REVOKE EXECUTE ON FUNCTION public.complete_mission(uuid), public.undo_mission(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_mission(uuid), public.undo_mission(uuid,date) TO authenticated;
```

[Certo] Nenhum arquivo de fixture foi alterado. Os hashes da definição completa dos helpers A12/P13 foram medidos nas respectivas bases compostas pré-migration; owner/ACL foram comparados com o JSON vivo read-only em `work/sprint-20261019/live-guard-function-metadata.json`. A fixture reduzida não representa todos os grants Supabase, especialmente `service_role`; os testes positivos de grant a esse papel comprovam que o guard usa ACL efetiva de `anon`/`authenticated`, não `proacl` literal.

## Provas focadas

| Etapa | Comando / caso | Exit e resultado |
| --- | --- | --- |
| Baseline A12 | Probe do revisor com `HEAD` em `integration_preflight_raw` | probe 0; A12 antiga aceitou owner errado; runtime negou schema `private`; rollback |
| A1 | `node supabase/tests/20261019_preflight_metadata.mjs 55583 integration_preflight_a1 a1` | 0; 13 casos: LF/CRLF/service_role aceitos, 10 drifts exit 3 com rollback |
| A12 | `node supabase/tests/20261019_preflight_metadata.mjs 55583 integration_preflight_raw a12` | 0; 18 casos: 3 positivos, 15 drifts exit 3 com rollback |
| P13 | `node supabase/tests/20261019_preflight_metadata.mjs 55583 integration_preflight_base p13` | 0; 14 casos: 3 positivos, 11 drifts exit 3 com rollback |
| A1 variantes | `psql -X -q -v ON_ERROR_STOP=1 -c BEGIN -f <A1> -c ROLLBACK` em `integration_preflight_d1` e `integration_preflight_d1weekly` | 0 e 0; hashes de fonte D-1 e D-1 + undo semanal reconhecidos |

[Certo] A matriz altera owner de RPC e helper, ACL de `anon`/`authenticated`, SECURITY, `search_path`, default, nome de argumento, retorno, corpo, `CR` isolado e alvo oculto por overload. Cada candidato foi executado em uma única transação; após exit 3, consulta em nova conexão confirmou ausência do artefato que a migration criaria. LF e CRLF pareado passaram. O teste de retorno recria em transação a curva XP com `RETURNS bigint`; o de nome de argumento recria o helper de Flow com nome alterado. O teste de alvo oculto cria `complete_mission(uuid,date)` sob `authenticated` junto da assinatura antiga conhecida, e A1 rejeita antes de qualquer mutação.

## Replay e regressões locais

[Certo] `node scripts/replay_reforma_sql_local.mjs integration_preflight_final_v2 55583` saiu 0 para cada uma das 13 migrations na ordem congelada. SHA-256 abaixo corresponde aos bytes UTF-8/LF efetivamente enviados ao psql; os outros dez SQLs mantiveram o hash registrado em `docs/entregas/20261019-integracao-final.md`.

| Ordem | Migration | SHA-256 UTF-8/LF | Exit |
| ---: | --- | --- | ---: |
| 1 | `20261019193625_progressao_reversao_checklist.sql` | `c198285d9fbbb348aa2ad33f7319a2a9477f42fbacf6be110ef045ece0ce786d` | 0 |
| 2 | `20261019194052_auto_adventure.sql` | `d02a7ba2f0eb39108c20aee23e775fc174a5b637e0c07d4d1f9941c84491d6a3` | 0 |
| 3 | `20261019200215_mission_priority_daily_caps.sql` | `d436d6b5822e41ce554bf82ee2918b3fefe992058256d69ba523e547f74208ea` | 0 |
| 4 | `20261019204003_close_forged_xp_buff_and_npc_undo.sql` | `ea949b299e9b872bcd26d1949a2de2c7ee5a28b3d46d772ea3c8786e4189c8d3` | 0 |
| 5 | `20261019204951_mission_priority_paid_cap_lock_order.sql` | `3562859ef81048797c075e4d769d1752a6d6a0bf5114ff7f326e415210eea9a9` | 0 |
| 6 | `20261019205224_boss_auto_entitlements.sql` | `1064fd0ff8a949839f23f2400c0ebcb7c2554f4e0811ed774af27f6f08d3eaf0` | 0 |
| 7 | `20261019205347_guard_mission_completion_schedule_and_undo_after_paid_cap.sql` | `cd0858c23bd12f75820430e6b5c78c16a39de97b3846cb1e93cbb54c26b08207` | 0 |
| 8 | `20261019210026_inventory_authorship.sql` | `3df342d304bbf4d70f2dc5d1a11c47cbd46a20334f2896546d18448d5c47840b` | 0 |
| 9 | `20261019210221_attribute_award_receipts.sql` | `93d694789ebae1a2007798b2243950010d32b1de8d083a93b4977512a2d9597d` | 0 |
| 10 | `20261019211310_auto_adventure_reachable_catalog.sql` | `be47c71f1d7df305ef493be2fc6b115ec50071881caeca8c9f699e1b9873bfdb` | 0 |
| 11 | `20261019212523_restore_unpaid_weekly_milestone_after_target_edit.sql` | `1bcceaedeceb7e194f4b84e73660ba0bef85cb518908fc3ea9a6753ffffe0f44` | 0 |
| 12 | `20261019220257_undo_mission_derived_effect_receipts.sql` | `52ea69f175387e5a16073fb3fa32a8bafcaf1544d5d13a87d4f9a6fa25379a89` | 0 |
| 13 | `20261019222715_talent_points_atomic_purchase_equip.sql` | `20abd2d86ab9a152facc5915c0e67fcd0d9d138ce5c9f89af422e015ad839428` | 0 |

[Certo] Na composição `integration_preflight_final`, `node scripts/run_reforma_a12_composed.mjs integration_preflight_final 55583` saiu 0 (dois testes de efeitos/saúde). `psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55583 -U postgres -d integration_preflight_final -f supabase/tests/<arquivo>` saiu 0 para `20261019_integracao_perfect_day_assert.sql`, `20261019_talent_equipped_effects.sql`, `20261019_integracao_gold_undo.sql`, `20261019_talent_atomic_assertions.sql`, `progressao_reversao.sql`, `20261019_attribute_award_receipts.sql` e `20261019_agenda_conclusao.sql`. `node supabase/tests/20261019_talent_concurrency.mjs 55583 integration_preflight_final` saiu 0 nas cinco corridas de compra/undo/equipagem. `supabase/tests/20261019_agenda_concurrent.ps1 -Port 55583 -Database integration_preflight_final` saiu 0. Após o check adicional de coexistência no A1, `integration_preflight_final_v2` recebeu o replay completo atualizado exit 0, e os dois testes de efeitos/saúde, ouro/undo, pontos de talento e cinco corridas de talento passaram novamente com exit 0.

## Limites e encerramento

[Certo] `node --check supabase/tests/20261019_preflight_metadata.mjs` e `git diff --check` saíram 0. Não rodei Vitest/build por se tratar somente de DO preflight e prova SQL; não houve push, deploy, merge, consulta SQL remota ou modificação de negócio. O PostgreSQL local não prova grants/roles/triggers completos da Primary Supabase, gateway, comportamento autenticado de produção ou aprovação independente. Capturas vivas são read-only e datadas de 19/10; revisão fria e preflight remoto read-only ainda são gates de promoção.

[Certo] Teardown concluído: `pg_ctl -D C:\Users\Murillo\AppData\Local\Temp\rpg_preflight_metadata_ctx8d01_20261019 -m fast -t 30 -w stop` exit 0; `pg_ctl status` exit 3 (`no server running`); `pg_isready -h 127.0.0.1 -p 55583` exit 2 (`no response`). Diretório de dados, bancos descartáveis e `postgres.log` permanecem preservados para auditoria.
