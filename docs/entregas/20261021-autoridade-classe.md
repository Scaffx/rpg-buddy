# Autoridade de classe e árvore — CENA

## Estado e contrato

- Base deste trabalho: `df024b19f3b9c8e3344f7406013a2bb62ce47779`; migration criada por `npx --no-install supabase migration new hero_class_authority`: `20261021145143_hero_class_authority.sql`.
- MOTOR confirmou `app_private.hero_class_key(uuid) -> text` e `app_private.has_hero_class(uuid) -> boolean`, sem EXECUTE cliente. Sua migration `20261021142812_continuous_adventure_skill_stats_engine.sql` ordena antes desta e usa fallback estrito até os helpers existirem.
- O ledger `app_private.hero_class_identity` nasce de `profiles` existentes válidos, sem alterar XP, nós, equipamentos, rotinas, itens ou loadout. O perfil continua espelho legível; um trigger compara classe inicial, classe atual e item inicial ao ledger, inclusive para writers SECURITY DEFINER. Não há GUC de bypass.
- `choose_starter_class(text)` permite uma escolha inicial por `auth.uid()`, deriva item no servidor e mantém `current_class_id=NULL` no onboarding. `advance_hero_class(uuid)` exige catálogo, nível mínimo e próximo nó da própria ancestralidade. `allocate_skill_node(text)` exige a árvore da identidade, sob lock do perfil, além dos gates de pontos, pré-requisito, exclusividade e rank legados. ClassesPage, Perfil e o hub leem a classe do perfil persistido, sem fallback de autoridade em localStorage.
- `perform_class_respec(text)` preserva primeiro respec gratuito, depois 120 ouro, itens vigentes e `activity_log`/`gold_history`; troca ledger e perfil na mesma transação e zera a classe evoluída anterior. Alocações históricas e loadout permanecem. O cliente só consome o resultado confirmado. Respec de habilidades permanece separado e sem troca de classe.
- `app_private.hero_class_key` retorna `mago` para mago de onboarding Lv1 com `current_class_id=NULL`; `clerico` projeta árvore `novato`. Retorna NULL quando não há identidade ou o ramo/nível atual é inválido; Aprendiz explícito Lv1–4 retorna `aprendiz`.

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
