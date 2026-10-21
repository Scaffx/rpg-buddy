# Ciclo autoritativo de cinco reinos — 21/10/2026

## Escopo e fonte

[Certo] Worktree `rpg-continuo-motor-20261020`, base limpa `9bbf27c82e4cb8cf27fcaa768740c3c36042114e`, branch `Scaffx/ciclo-reinos-20261021`. Migration nova gerada por `npx --no-install supabase migration new five_realm_adventure_cycle`: `20261021222452_five_realm_adventure_cycle.sql`, SHA-256 `6DDA68A81F7B9CF39CBE3E75634E92B1F8B000B031A3F83F9D428C43E8788BED`. Nenhuma migration antiga foi editada. Nenhuma escrita remota, push, merge ou deploy ocorreu.

[Certo] Primary `jfnospjxdkelxlhcwuia`, conta `link_6abe70536ca4819193b60c2d9ba7d54a`, foi consultada somente por SQL de leitura antes da criação. `app_private.sync_auto_adventure()` tinha hash `abcc93a77791b8e2c89da31d58ddc0a5`; `adventure_battle_payload` `25fb3388b1cefaa4cb00ae45640d428b`; wrappers/advance `1879a24abc08fec402ea5d96f4a199c6`, `a6f6dd7ab3b787084d47ed47dab100cd`, `f71174f3366e61e0756fd00674c429ae`. Owner `postgres`, `search_path=""`, modo SECURITY e EXECUTE de `anon`/`authenticated` coincidiram com o preflight. `app_private` e as duas tabelas tinham owner `postgres`, sem CREATE cliente, sem SELECT/INSERT cliente; `adventure_battles` tinha RLS. Catálogo vivo: 12 linhas, índices 0 forest, 1 aquatic, 2 ruins, 3 volcanic, hash com resistências `621a73d2352993ddbb473ed991e55cff`. Constraints vivas: `adventure_enemy_catalog_biome_check` permitia 0..3; `adventure_battles_biome_check` permitia forest/aquatic/ruins/volcanic.

## Mudança

[Certo] Os índices 0..3 permanecem. A migration amplia as constraints para 0..5 e para os seis nomes de bioma, acrescenta 4 desert e 5 ice com três slots cada, e substitui `app_private.sync_auto_adventure()` preservando toda sua lógica exceto as duas expressões de seleção: biomas `[forest,desert,aquatic,ice,volcanic]` e catálogo `[0,4,1,5,3]`, ambos por `((stage-1)/10)%5`. Um diff normalizado do corpo da função confirmou igualdade byte a byte fora dessas expressões. Hash local pós-migration da função: `e7310c842cf9ec89259bf44fa0c41954`. Ruins permanece válido para batalhas já iniciadas, sem aparecer no novo ciclo. Não houve UPDATE em batalhas existentes; snapshots de timeline, stats, resistência, identidade e bioma continuam congelados.

[Certo] Slots novos: 4/0 `Escorpião das dunas` 🦂, 4/1 `Cobra da areia` 🐍, 4/2 `Besouro do deserto` 🪲, 5/0 `Lobo da neve` 🐺, 5/1 `Coruja glacial` 🦉, 5/2 `Golem de gelo` 🧊. Resistências novas `{}`; nenhuma mecânica, XP, recompensa, relógio, hold, boss ID ou limite foi alterado. O preflight exige hashes de fonte/catálogo, ACL, owner, security mode, RLS, shape e definições exatas das constraints antes de qualquer DDL. `lock_timeout=5s` e `statement_timeout=120s` limitam a execução e são resetados no fim da migration.

## PostgreSQL 17 isolado

[Certo] Cluster local em `%TEMP%\ciclo_reinos_task339_55782`, porta `127.0.0.1:55782`, database base `reinos_base`. `pg_isready` pré-start exit 2; `initdb`, `pg_ctl start` e `createdb` exit 0. A cadeia abaixo foi aplicada com `psql -X -q -v ON_ERROR_STOP=1`, exit 0 por arquivo, com logs `<basename>.out` preservados no diretório do cluster:

1. `src/test/sql/auto_adventure_fixture.sql`
2. `supabase/migrations/20261019194052_auto_adventure.sql`
3. `src/test/sql/boss_auto_fixture.sql`
4. `supabase/migrations/20261019205224_boss_auto_entitlements.sql`
5. `supabase/migrations/20261019211310_auto_adventure_reachable_catalog.sql`
6. `src/test/sql/continuous_adventure_fixture.sql`
7. `supabase/migrations/20261020040128_continuous_adventure_battle_engine.sql`
8. `src/test/sql/adventure_skill_motor_fixture.sql`
9. `src/test/sql/adventure_skill_motor_legacy_setup.sql`
10. `supabase/migrations/20261021142812_continuous_adventure_skill_stats_engine.sql`

[Certo] Após essa cadeia, os hashes locais da função/payload/catálogo foram exatamente `abcc93a77791b8e2c89da31d58ddc0a5`, `25fb3388b1cefaa4cb00ae45640d428b` e `621a73d2352993ddbb473ed991e55cff`, iguais aos lidos da Primary. Em `reinos_final3`, cópia da base, `five_realm_inflight_setup.sql`, a migration final e `five_realm_cycle_assert.sql` rodaram com `psql -1 -v ON_ERROR_STOP=1`, exit 0 cada; resultado `FIVE_REALMS_CYCLE_PASS`. Os logs `final3-*` foram preservados. O setup congelou o JSON inteiro de batalhas antigas nos biomas aquatic, ruins e volcanic; a assertion confirmou hash idêntico depois da migration e sobrevida de uma luta v2 forest.

[Certo] O teste final exercitou as etapas 1, 9, 10, 11, 19, 20, 21, 29, 30, 31, 39, 40, 41, 42, 49, 50, 51, 100, 101, 110, 111, 150 e 151 via RPC autenticado. Conferiu bioma, slot, nome/ícone, resistência, chefes em cada 10, IDs pela ordem `level,id`, etapa/progresso inalterado, exatamente uma batalha por retry, nenhuma recompensa/recibo antes da conclusão, catálogo legado intacto, seis nomes/slots novos exatos, EXECUTE de `anon` negado, ausência de UID recusada e avanço de batalha de outro usuário recusado. A etapa 42 adicional valida o catálogo de fogo; a Asa de brasa ocupa slot 1 na etapa 41.

[Certo] Em `reinos_reg2`, migration + `adventure_skill_motor_legacy_assert.sql`, cópia local de `adventure_skill_motor_assert.sql` com somente o probe antigo da Asa movido de etapa 32 para 41, `state_assert`, `clock_assert`, `draw_assert` e `canonical_assert`: exit 0 em cada. A cópia está em `%TEMP%\ciclo_reinos_task339_55782\adventure_skill_motor_assert_five_realm_adapted.sql`; logs `reg2-corrected-*` preservados. O primeiro probe temporário tinha escolhido 42, slot 2, e falhou corretamente; após corrigir para o slot 1 da etapa 41, todos passaram. Esses testes cobrem XP/atributos, recompensa 30 min/120 ouro/2 itens, idempotência, hold/derrota, clock, snapshot, draw e skills, sem afirmar teste integral do banco remoto.

[Certo] Em `reinos_race`, migration e `adventure_skill_motor_concurrent_setup.sql` exit 0; duas sessões `psql` simultâneas com `statement_timeout=30s` e `lock_timeout=5s` deram exit 0/0, e `adventure_skill_motor_concurrent_assert.sql` exit 0: um primeiro clear, um crédito de quatro ouros e uma batalha ativa. Logs `race-*` preservados. Em cópias `reinos_final_drift_source` e `reinos_final_drift_constraint`, alterações locais respectivamente de `search_path` da função e da constraint de índice provocaram exit 3 esperado (`FIVE_REALMS_SOURCE_DRIFT` e `FIVE_REALMS_CATALOG_OR_CONSTRAINT_DRIFT`); após rollback, cada catálogo continuou com 12 linhas/bioma máximo 3. Logs `final-drift-*` preservados.

## Teardown e limites

[Certo] `pg_ctl -D %TEMP%\ciclo_reinos_task339_55782 -m fast -w stop` exit 0; `pg_ctl status` exit 3; `pg_isready -h 127.0.0.1 -p 55782` exit 2; `Get-NetTCPConnection -LocalPort 55782 -State Listen` retornou zero listeners. Diretório de dados e `postgres.log` permanecem preservados.

[Certo] Esta prova usa fixture reduzida, não reproduz integralmente RLS/dados da Primary, gateway/PostgREST ou browser autenticado. A Primary deve ser relida antes da promoção. O cliente compatível com `desert` e `ice` precisa estar publicado antes de ativar a migration; integração, promoção e validação remota pertencem ao coordenador.
