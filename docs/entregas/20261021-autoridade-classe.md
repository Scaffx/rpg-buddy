# Autoridade de classe e árvore — CENA

## Estado e contrato

- Base deste trabalho: `df024b19f3b9c8e3344f7406013a2bb62ce47779`; migration criada por `npx --no-install supabase migration new hero_class_authority`: `20261021145143_hero_class_authority.sql`.
- MOTOR confirmou `app_private.hero_class_key(uuid) -> text` e `app_private.has_hero_class(uuid) -> boolean`, sem EXECUTE cliente. Sua migration `20261021142812_continuous_adventure_skill_stats_engine.sql` ordena antes desta e usa fallback estrito até os helpers existirem.
- O ledger `app_private.hero_class_identity` nasce de `profiles` existentes válidos, sem alterar XP, nós, equipamentos, rotinas, itens ou loadout. O perfil continua espelho legível; um trigger compara classe inicial, classe atual e item inicial ao ledger, inclusive para writers SECURITY DEFINER. Não há GUC de bypass.
- `choose_starter_class(text)` permite uma escolha inicial por `auth.uid()`, deriva item no servidor e mantém `current_class_id=NULL` no onboarding. `advance_hero_class(uuid)` exige catálogo, nível mínimo e próximo nó da própria ancestralidade. `allocate_skill_node(text)` exige a árvore da identidade, sob lock do perfil, além dos gates de pontos, pré-requisito, exclusividade e rank legados. ClassesPage, Perfil e o hub leem a classe do perfil persistido, sem fallback de autoridade em localStorage.
- `perform_class_respec(text)` preserva primeiro respec gratuito, depois 120 ouro, itens vigentes e `activity_log`/`gold_history`; troca ledger e perfil na mesma transação e zera a classe evoluída anterior. Alocações históricas e loadout permanecem. O cliente só consome o resultado confirmado. Respec de habilidades permanece separado e sem troca de classe.
- `app_private.hero_class_key` retorna `mago` para mago de onboarding Lv1 com `current_class_id=NULL`; `clerico` projeta árvore `novato`. Retorna NULL quando não há identidade nem classe Aprendiz explícita, ou quando o ramo/nível atual é inválido; `current_class_id=Aprendiz` em nível 1 ou mais retorna `aprendiz` até o avanço escolhido pelo jogador.

## Evidência de Primary, somente leitura

- Projeto `jfnospjxdkelxlhcwuia`, link Primary `link_6abe70536ca4819193b60c2d9ba7d54a`. Nenhum DDL, DML, JWT ou chamada de combate foi executado ali.
- `perform_class_respec(text)` tinha `pg_get_functiondef` MD5 `c7e950d4a2dfc78a6eb6a0c2e7dca369`: cobrava e registrava atividade, mas não mudava a classe. `allocate_skill_node(text)` tinha MD5 `a0ccf800bd1185f5ee3f0229eed1fdb5`: não validava árvore nem travava perfil. Owners eram `postgres`; respec tinha EXECUTE para authenticated e não para anon; allocate tinha EXECUTE indevido para anon.
- Perfil de mago Lv1 já tinha `m_dardo` rank 1 e loadout, com `current_class_id=NULL`. O nó `m_dardo` é tier 0, custo 1 e gate 0; a classe Mago de progressão no catálogo exige Lv5. O helper distingue identidade inicial de promoção.
- Leitura agregada de cinco perfis: starter inválido 0, current sem starter 0, ramo/nível atual incompatível 0, Aprendiz acima de Lv4 0. O seed não requer reparo nos cinco registros observados.
- `player_skill_nodes` tinha grants ALL a anon/authenticated/service_role, incluindo TRUNCATE. A única política RLS era SELECT próprio; DML por linha já era negado, mas TRUNCATE não é restringido por RLS. A migration revoga ALL de PUBLIC/anon/authenticated e devolve só SELECT próprio a authenticated. Writers SECURITY DEFINER localizados: `allocate_skill_node(text)`, `reset_skill_tree()`, `use_scroll(uuid)`; os dois últimos seguem com o corpo intacto.
- BUG-38 no Notion: `400812ac-94d8-812f-bad0-e39313aed9e8`. O erro separado de cobrança sem troca de classe foi registrado em `400812ac-94d8-812b-a4a6-e6d64638783d`, após busca de duplicatas.

## PostgreSQL 17 local

Fixture declarada: `src/test/sql/hero_class_authority_fixture.sql` (esquema reduzido com catálogo Aprendiz, seis bases, Bruxo, três perfis, saldo, logs e três nós). Os RPCs legados da fixture são cópias byte-exatas do `pg_get_functiondef` lido no Primary em `hero_class_live_allocate.sql` e `hero_class_live_respec.sql`; seus MD5 foram reproduzidos no PG17. `.gitattributes` marca somente esses dois arquivos como `-text` para preservar CRLF do corpo vivo: hashes Git raw e staged conferidos. Asserções: `src/test/sql/hero_class_authority_assert.sql`. Concorrência: `src/test/sql/hero_class_authority_concurrency.ps1`.

Cluster isolado: `%TEMP%\hero-class-pg-task_718aa1f13c4c`, porta 55438, banco final `hero_class_assert5`. Comandos finais (após `initdb`, `pg_ctl start`, `createdb hero_class_assert5`):

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55438 -U postgres -d hero_class_assert5 -f src/test/sql/hero_class_authority_fixture.sql
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55438 -U postgres -d hero_class_assert5 -f supabase/migrations/20261021145143_hero_class_authority.sql
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55438 -U postgres -d hero_class_assert5 -f src/test/sql/hero_class_authority_assert.sql
pwsh -NoProfile -File src/test/sql/hero_class_authority_concurrency.ps1 -Port 55438 -Database hero_class_assert5
```

Exits: 0, 0, 0 com `HERO_CLASS_AUTHORITY_PASS`, e 0 com `HERO_CLASS_CONCURRENCY_PASS`. Asserções cobrem m_dardo legítimo sem classe evoluída, perfil e árvore forjados negados, escrita comum do perfil, níveis/ramo, isolamento auth.uid, ACL, rank/source INSERT/UPDATE/DELETE e TRUNCATE cliente negados, classe e cobrança atômicas, rollback forçado após débito, e dois respecs concorrentes. Em bancos separados, drift de corpo do RPC e swap de nomes no catálogo produziram exit 1 com `HERO_CLASS_PREFLIGHT_RPC` e `HERO_CLASS_PREFLIGHT_CATALOG`, respectivamente. Bancos anteriores foram usados para preparação; apenas `hero_class_assert5` representa a rodada positiva final. Teardown: `pg_ctl -D %TEMP%\hero-class-pg-task_718aa1f13c4c stop -m fast -w`, exit 0; cluster e log temporários preservados para reprodução, servidor parado.

## Frontend e limites

- `npm test -- src/test/heroClassAuthority.test.tsx src/test/selectClassRpc.test.tsx`: exit 0, quatro testes. Cobrem localStorage incapaz de conceder classe/onboarding, Aprendiz sem base escolhida, mago persistido sem current_class_id e seleção via RPC sem UPDATE de classe.
- `npm run build`: exit 0. `npx --no-install eslint src/test/heroClassAuthority.test.tsx src/test/selectClassRpc.test.tsx src/lib/onboarding.ts`: exit 0.
- `npx --no-install tsc --noEmit -p tsconfig.app.json`: exit 1 por erros globais preexistentes; nos arquivos alterados apareceu apenas o `Settings` duplicado em ProfilePage. Lint do conjunto de arquivos grandes: exit 1 por `no-explicit-any` disseminado e por `prefer-const` preexistente em ProfilePage; não declarado verde.
- Teste com fixture reduzida não prova aplicação sobre todo o esquema vivo nem comportamento do motor após integração. Primary não foi alterado. Root fará Cua; worker não fez browser QA. Arquivos `.qa-effects.html` e `src/qa-effects.tsx` permanecem não rastreados para QA do root.
- Necessário antes de rollout: revalidar hashes/ACL/catálogo no Primary e aplicar migrations na ordem MOTOR → CENA em ambiente apropriado, com revisão root. Alterações de skill/equipamento chegam à próxima luta após sync do servidor; nenhum resultado foi simulado como autoridade no cliente.

## Correção estreita: lacuna histórica de coluna

O revisor reproduziu Bruxo com `column_index=4`, `level_min=35` e pai Mago na coluna 2: a cadeia/nível passavam no seed e `hero_class_key` retornava `mago`. `class_path_matches` agora acumula a condição `filho.column_index = pai.column_index + 1` em cada aresta e exige que todas sejam verdadeiras. A regra anterior continua exigindo a raiz Aprendiz única, a base correta, o nível de todos os nós, ausência de ciclos e alcance da raiz em no máximo 16 nós; portanto uma cadeia truncada também falha. Nenhum perfil, ponto, nó, item ou XP é reparado ou reatribuído.

Teste próprio PostgreSQL 17 no cluster isolado existente `%TEMP%\hero-class-pg-task_718aa1f13c4c`, porta 55438, com bancos novos `skills_class_gap_negative` e `skills_class_gap_positive`; o cluster do root na porta 55621 não foi tocado. Arquivos novos: `hero_class_historical_gap_setup.sql`, `hero_class_historical_gap_rollback_assert.sql` e `hero_class_historical_gap_helper_assert.sql`. Sufixos dos comandos `& $psql`, com `$psql='C:\Program Files\PostgreSQL\17\bin\psql.exe'` e flags comuns `-X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55438 -U postgres`:

| Banco | Sufixo do comando | Exit | Evidência |
| --- | --- | ---: | --- |
| negativo | `-d skills_class_gap_negative -f src/test/sql/hero_class_authority_fixture.sql` | 0 | fixture |
| negativo | `-d skills_class_gap_negative -f src/test/sql/hero_class_historical_gap_setup.sql` | 0 | perfil Lv35 e salto 2→4 |
| negativo | `-d skills_class_gap_negative -1 -f supabase/migrations/20261021145143_hero_class_authority.sql` | 3 esperado | `HERO_CLASS_HISTORICAL_REVIEW_REQUIRED` antes do INSERT de identidade |
| negativo | `-d skills_class_gap_negative -f src/test/sql/hero_class_historical_gap_rollback_assert.sql` | 0 | `HERO_CLASS_GAP_ROLLBACK_PASS`: ledger/helper ausentes, perfil/catálogo preservados |
| positivo | `-d skills_class_gap_positive -f src/test/sql/hero_class_authority_fixture.sql` | 0 | fixture |
| positivo | `-d skills_class_gap_positive -1 -f supabase/migrations/20261021145143_hero_class_authority.sql` | 0 | seed legítimo |
| positivo | `-d skills_class_gap_positive -f src/test/sql/hero_class_authority_assert.sql` | 0 | `HERO_CLASS_AUTHORITY_PASS` |
| positivo | `-d skills_class_gap_positive -f src/test/sql/hero_class_historical_gap_helper_assert.sql` | 0 | `HERO_CLASS_GAP_HELPER_PASS`: helper/has_hero_class negam catálogo com gap |
| positivo | `pwsh -NoProfile -File src/test/sql/hero_class_authority_concurrency.ps1 -Port 55438 -Database skills_class_gap_positive` | 0 | `HERO_CLASS_CONCURRENCY_PASS` |

`git diff --check`: exit 0. SHA256 dos arquivos (bytes locais): migration `8B97F20E84516294033A9DABE4975486A85D9ECB025F36676431E2A678690AFE`; setup `BD7A16715F2F2A468C734F2DADE38DAA8974AEF11A035F0DD28B7D05C3550418`; rollback `9F85DF171EE3636FACF5696FBA3B2E22F84DD83598913C5721F6AD51AF9A3242`; helper `82836CBFC927A2F663CBF92F92FBA01924437D0C891653F08D21FD20077B6CC2`. Teardown: `pg_ctl -D %TEMP%\hero-class-pg-task_718aa1f13c4c stop -m fast -w`, exit 0; `status`, exit 3 (`no server running`). Bancos e arquivos temporários preservados para reprodução, sem delete. Esta prova local não substitui a prova composta do root nem uma promoção remota; Primary permaneceu somente leitura e não houve browser QA.

## Correção estreita: Aprendiz após nível 4

O fluxo da ClassesPage considera `current_class_id=Aprendiz` ativo até a escolha de evolução; rotina pode aumentar o nível sem escolher classe. Os dois ramos de `hero_class_key` agora retornam `aprendiz` para `current_class_id=Aprendiz` em nível `>=1`, com ou sem ledger. `has_hero_class` continua false nessa fase. O RPC `advance_hero_class` preserva os requisitos de nível 5, ramo e escolha para promover a Mago; não há promoção automática nem mudança de dados históricos.

Fixture local declarada: `src/test/sql/hero_class_authority_fixture.sql` mais `hero_class_apprentice_transition_setup.sql` (um Aprendiz Lv5 sem starter/ledger e um Aprendiz Lv4 com starter mago). `hero_class_apprentice_transition_assert.sql` verifica seed sem reescrever perfil, helper nos dois ramos, avanço negado em Lv4, subida de rotina simulada por UPDATE apenas do nível para 5, árvore Aprendiz e orçamento (`a_golpe`, custo 1, disponível 4), avanço escolhido via RPC em Lv5 e chave final `mago`/`has_hero_class=true`. O UPDATE de nível é instrumentação local da fixture, não simula autoridade de XP no cliente.

PostgreSQL 17: cluster isolado `%TEMP%\hero-class-pg-task_718aa1f13c4c`, porta 55438, bancos novos `skills_class_apprentice_transition` e `skills_class_apprentice_gap` criados com `createdb -h 127.0.0.1 -p 55438 -U postgres <banco>` (exit 0 cada); `pg_ctl start` exit 0. Com `$psql='C:\Program Files\PostgreSQL\17\bin\psql.exe'`, todos os sufixos abaixo foram executados com `-X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55438 -U postgres`:

| Banco | Sufixo de `& $psql` | Exit | Evidência |
| --- | --- | ---: | --- |
| transição | `-d skills_class_apprentice_transition -f src/test/sql/hero_class_authority_fixture.sql` | 0 | fixture |
| transição | `-d skills_class_apprentice_transition -f src/test/sql/hero_class_apprentice_transition_setup.sql` | 0 | dois perfis históricos |
| transição | `-d skills_class_apprentice_transition -1 -f supabase/migrations/20261021145143_hero_class_authority.sql` | 0 | seed aceito |
| transição | `-d skills_class_apprentice_transition -f src/test/sql/hero_class_apprentice_transition_assert.sql` | 0 | `HERO_CLASS_APPRENTICE_TRANSITION_PASS` |
| transição | `-d skills_class_apprentice_transition -f src/test/sql/hero_class_authority_assert.sql` | 0 | `HERO_CLASS_AUTHORITY_PASS` |
| transição | `-d skills_class_apprentice_transition -f src/test/sql/hero_class_historical_gap_helper_assert.sql` | 0 | `HERO_CLASS_GAP_HELPER_PASS` |
| transição | `pwsh -NoProfile -File src/test/sql/hero_class_authority_concurrency.ps1 -Port 55438 -Database skills_class_apprentice_transition` | 0 | `HERO_CLASS_CONCURRENCY_PASS` |
| gap | `-d skills_class_apprentice_gap -f src/test/sql/hero_class_authority_fixture.sql` | 0 | fixture |
| gap | `-d skills_class_apprentice_gap -f src/test/sql/hero_class_historical_gap_setup.sql` | 0 | salto histórico 2→4 |
| gap | `-d skills_class_apprentice_gap -1 -f supabase/migrations/20261021145143_hero_class_authority.sql` | 3 esperado | `HERO_CLASS_HISTORICAL_REVIEW_REQUIRED` |
| gap | `-d skills_class_apprentice_gap -f src/test/sql/hero_class_historical_gap_rollback_assert.sql` | 0 | `HERO_CLASS_GAP_ROLLBACK_PASS` |

Probe adicional em `skills_class_apprentice_transition`: `psql -c` executou `BEGIN; UPDATE public.classes SET parent_class_id='<Bruxo UUID>' WHERE id='<Aprendiz UUID>'; DO $$ BEGIN IF app_private.class_path_matches('<Bruxo UUID>','mago',35) THEN RAISE EXCEPTION 'CLASS_CYCLE_ACCEPTED'; END IF; END $$; ROLLBACK; SELECT 'CLASS_CYCLE_DENIED_PASS';`, exit 0; nenhum ciclo foi persistido. Após fortalecer as comparações com `IS DISTINCT FROM`, a rodada final em banco novo `skills_class_apprentice_final` repetiu fixture/setup/migration/asserção de transição, todos exit 0 com `HERO_CLASS_APPRENTICE_TRANSITION_PASS`. `git diff --check`: exit 0. SHA256 local: migration `ADFA6DC2E9EF06CF28D48C364BC0AD31CF1FCCD93F525047253F45F19EB7AC85`; setup `51FF9140534341055CBBADCA0BBBB490E62CC34DF0DE88A73BE2FFB45397A25D`; asserção `9849F266604A08F4566B0880A8E1EB5288DD73B229916D354623D6DFE31D7D78`. Teardown: `pg_ctl -D %TEMP%\hero-class-pg-task_718aa1f13c4c stop -m fast -w`, exit 0; `status` exit 3 e `pg_isready -h 127.0.0.1 -p 55438` exit 2. Dados/logs locais preservados, cluster do root na porta 55621 intocado. Nenhum teste de browser, Primary ou promoção remota foi executado; root fará a prova composta.
