# Revisão independente: aventura contínua e portais cooperativos

**Cortes:** base `c60476a45302b12df44b972536726471ae3ce6f3`; primeiro integrado `089d3b37c66ad4e04b81aa5e1787e1cd397bb3fc` (backend `fac7bf7c29243f802f7f2e4133c7fb71e6c40936`); corrigido e retestado `503cc578ee1e7b9e1148444ceef8c21f28557e68`; texto final `cd660cdc22710b3259a7c4c8f3978df9cba88ba2`.
**Ambiente:** PostgreSQL 17.9 local em `127.0.0.1:55620`, bancos descartáveis `integration_review_*`. Fixtures sintéticas e reduzidas. A Primary `jfnospjxdkelxlhcwuia` recebeu somente consultas de catálogo/metadados, sem dados pessoais. Não houve escrita remota nem publicação.
**Conclusão:** `089d3b37` **REPROVADO** por dois P1 reproduzidos. Em `503cc578`, ambos os P1 falharam nos probes negativos como esperado, e os fluxos positivos mantiveram **PASS parcial local**. `cd660cd` alterou somente texto e rótulos acessíveis, revisados por diff; não executei novamente a suíte nele. **Promoção ainda não aprovada por esta auditoria**: faltam schema integral, gateway/API autenticada e verificação pós-migration no ambiente alvo.

## Achados P1 no primeiro corte e reteste do corte corrigido

**P1 — avanço solicitado no presente libera etapas passadas durante catch-up.** O endpoint `app_private.advance_auto_adventure()` (`20261020040128_continuous_adventure_battle_engine.sql:582-604`) valida apenas ID atual, `status='fighting'`, `mode='holding'` e pedido ainda não feito. Ao final de um lote de 24, `catchup.pending=true` pode deixar uma batalha `fighting` cujo `ends_at` já passou. O endpoint aceita o ID e chama `sync_auto_adventure()`; o flag `advance_requested` é aplicado à vitória histórica, e o processamento das batalhas antigas seguintes já ocorre em modo `progressing`.

`probe_advance_pending_catchup.sql` reproduziu com estado sintético em `holding` na etapa 9 e batalha deslocada 2h: antes do pedido, `pending=true`, `stage=9`, `battle_ended=true`; a chamada `advance_auto_adventure(battle.id)` retornou normalmente e deixou `stage=33`, `mode=progressing`, com **23 primeiras vitórias de etapas >=10 cujo `fought_at` precede o pedido**. **Exit 0**, transação revertida, SHA-256 LF do probe `e0fdb256a976abfe0b2c9716352d0975a81dc7fa86252b4a4ddcbbfb48754f45`. O usuário decidiu avançar agora, mas a decisão mudou o histórico anterior ao clique. Rejeitar intenção enquanto a batalha corrente já terminou ou o catch-up está pendente, ou liquidar o atraso antes de vincular a intenção somente à batalha ao vivo. Retestar sem perda de recompensa nem aceitação de ID anterior.

**Reteste `503cc578`:** após os locks de estado e batalha, `advance_auto_adventure` compara `started_at <= clock_timestamp() < ends_at`. `probe_advance_clock_fixed.sql` montou o mesmo backlog: pedido expirado foi rejeitado com SQLSTATE `22023`, sem alterar estado, batalhas, encontros ou linhas de ouro; o sync drenou o atraso mantendo `holding` na etapa 9 e sem primeiras vitórias da 10; uma batalha viva aceitou avanço com `advance_pending=true`. **Probe próprio exit 0**, `BEGIN/ROLLBACK`; o novo teste SQL autoral de relógio também passou **exit 0**. A UI corrigida oculta o CTA com `catchup.pending` ou `ends_at` vencido. Nenhum desses testes usa gateway autenticado.

**P1 — preflight de portal aceita guard de XP/nível semanticamente vazio.** Em `20261020040235_portal_coop_authoritative.sql:30-35`, o gate só exige `tgname` e `tgenabled='O'` para os dois triggers de `profiles`; não vincula `tgfoid`, corpo, owner nem permissões da função. O nível lido em `portal_coop_member_snapshot` (`:143-157`) determina os gates de 1/20/30/40/50 (`:195`, `:218`).

Reprodução independente na fixture local, antes da migration: `probe_portal_guard_drift.sql` substituiu **somente** `public._guard_profiles_economy()` por `RETURN NEW`, preservando o trigger ativo. A migration passou com **exit 0**. Depois, `SET ROLE authenticated` fez `UPDATE public.profiles SET level=50` no usuário sintético originalmente nível 1 (**UPDATE 1**) e `portal_coop_create('fragments','ultra',...)` criou uma sala (**exit 0**). A consulta imprimiu `trigger_enabled=O`, `forged_level=50` e `ultra_created=<uuid>`. `guard-drift.log` contém a sequência limpa e os códigos, todos **exit 0**. A primeira tentativa no banco anterior falhou com **exit 3** por conversão de `"char"` no próprio probe, corrigida com `::text`; esse erro não é falha do produto.

Isso prova que o gate inicial aceitava uma **variante local com deriva** capaz de liberar níveis e salas indevidos; não é evidência de deriva na Primary. **Reteste `503cc578`:** em dois bancos novos, a fixture com corpo no-op e outra com trigger de mesmo nome ligado a função dummy fizeram a migration falhar **exit 3/3**, com mensagens de definição/ACL e binding respectivamente. `to_regclass('public.portal_coop_config') IS NULL` foi verdadeiro nos dois casos, comprovando recusa antes do primeiro DDL. A fixture sem deriva aplicou a migration e a suíte de portal com **exit 0/0**. `guard-negative-fixed503.log` contém a prova independente. O novo preflight também atesta owner, corpo, ACL, `tgtype`, `tgattr`, `tgqual`, owner de `profiles` e caminhos `SET ROLE`; esses casos adicionais constam da suíte autoral e não foram todos repetidos por mim.

## Evidência local positiva

| Área | Observação e limite |
| --- | --- |
| Aventura: autoridade, timeline e HP | Leitura de `app_private.sync_auto_adventure()` e `adventure_battle_payload()` mostra eventos/HP calculados no servidor; cliente envia somente `p_battle_id` para avanço. Probe de estado legado sem batalha iniciou v2 no presente, não criou lutas retroativas com build atual, e não revelou HP de eventos futuros. **Exit 0**, transação revertida. |
| Aventura: derrota/holding/replay | Suíte SQL autoral, reaplicada no SHA corrigido, passou recuo automático, permanência/farming após derrota, etapa mínima 1, `advance` por ID atual e rejeição de ID antigo, alheio ou duplicado. Probe próprio adicional rejeitou o ID atual **quando histórico/expirado** e aceitou o ID de luta viva. A instrução antiga de parar no primeiro revés ou oferecer `retry/previous` foi substituída pelo contrato humano de recuo automático e `holding`. **PASS parcial de fixture**. |
| Aventura: offline, caps e zero XP | Probe independente de 2h reconciliou **466 batalhas em 20 chamadas**, com 1 derrota e modo `holding` na etapa 129; mediu **0,27–0,29 s** no PostgreSQL local. `gold_today=12–16 <=120` entre execuções, `loot_today=0 <=2`, nível 50 e `total_xp=0` preservados, 127 timelines retidas e 129 recibos de primeira vitória. **Exit 0**, transação revertida. É uma amostra de 2h, não prova o limite de 24h nem a latência da API. |
| Boss 10, skills e biomas | A suíte SQL reaplicada verifica boss nas etapas 10/20, skill alocada versus metadados forjados, rotação, efeitos e biomas. Leitura independente confirma `stage % 10`, catálogo regular do servidor, `battle.biome` e 3 variantes por bioma na cena. Os **28 testes UI/parse/cache** reaplicados no SHA corrigido passaram; cena não foi exercitada por mim em navegador autenticado. |
| Portal: grupo, nível, replay | Probe independente passou bloqueio solo, nível 1 entrando em ultra, quinto integrante, leitura por outsider e roster de 4 com nível mínimo 50 (**exit 0**, transação revertida). Outro probe criou portal diário para 2 jogadores, confirmou `portal_runs.xp_earned=gold_earned=0`, perfil sem mudança de XP/nível, mesma resposta ao repetir `action_id` e apenas um registro em `portal_coop_actions` (**exit 0**, transação revertida). Suíte SQL autoral reaplicada ainda cobre níveis 1/20/30/40/50, ownership de companheiro e replay de criação. **PASS parcial local** dependente do guard correto na fixture base. |
| Portal: bosses simultâneos | Probe independente criou sala difícil sintética, alcançou onda 2, manteve dois bosses vivos e verificou **dois contra-ataques no mesmo turno**, sem decompor o encontro em duas lutas. **Exit 0**, transação revertida. |

## Interface e risco residual

**P2 de texto corrigido em `503cc578`.** `useAutoAdventure.ts:11-41` soma também as batalhas recebidas por polling enquanto a pessoa está na cena; o rótulo anterior “Enquanto você esteve fora” era incorreto para a sessão ativa. `AutoAdventure.tsx:174` agora usa “Resumo da aventura”, adequado aos dois contextos. A suíte UI relacionada passou **28/28, exit 0**. Ainda é possível que o aviso exiba por até 1,4 s a derrota anterior enquanto uma nova luta viva já permite o CTA; o pedido usa a batalha atual validada, então registro isto como risco menor de clareza. Não houve meu teste em navegador autenticado.

**Revisão do delta `503cc578..cd660cdc`:** apenas `src/pages/PortalEventPage.tsx` mudou (3 inserções, 3 remoções). O cabeçalho agora informa que ouro e itens vêm da aventura automática, e os controles de convite e companheiro ganharam `aria-label`. Revisei o diff; o coordenador informou `eslint` exit 0. Nenhum probe meu foi executado nesse SHA textual.

## Primary: metadados somente leitura

Consultas `SELECT` a `pg_class`, `pg_attribute`, `pg_constraint`, `pg_indexes`, `pg_trigger`, `pg_proc` e `pg_policy` no projeto `jfnospjxdkelxlhcwuia` verificaram dependências estruturais atuais, sem ler linhas de usuários. Em 20/10/2026, `adventure_state` e `portal_runs` **não têm** as colunas novas `current_battle_id` e `coop_session_id`, respectivamente: as migrations revisadas ainda não foram aplicadas ali.

| Dependência atual | Evidência do catálogo |
| --- | --- |
| `adventure_encounters` | PK `(user_id,stage,attempt)` e índice único de primeira vitória `(user_id,stage) WHERE won`. |
| `user_balance`, `user_inventory` | Únicos por `user_id` e `(user_id,item_id)`, respectivamente, compatíveis com os `ON CONFLICT` do motor; `gold_history` tem `type`, `amount`, `reason` e defaults para os demais campos. |
| `bosses`, `game_items`, `companions` | Colunas referidas pelo código, inclusive `is_world_event`, `is_final_boss`, `ataque_base`, `defesa_base`, `weapon_skill`, `current_hp` e `companion_role`, presentes. |
| `portal_runs`, `player_portal_fragments` | `portal_runs_unique_win` é parcial por `(user_id,event_id,portal_color) WHERE completed`; `player_portal_fragments` tem PK `user_id` e trigger `trg_reset_dungeon_reveal` ativo. Nenhum trigger de `portal_runs` foi observado. |
| Guards de `profiles` | `_guard_profiles_economy()` MD5 LF `cb1f62ea7e13d6fcdbadb83a62c1c669`, binding ativo `O`, `tgtype=19`; `_guard_progression_initial_values()` MD5 LF `c04283b05e56ac30f0699ee13bb24b8c`, binding ativo `O`, `tgtype=7`. Owner `postgres`, modo invoker, ACL/proconfig compatíveis com o novo preflight. Owner de `profiles` `postgres`, sem `SET ROLE` alternativo ou permissão cliente para `session_replication_role` na consulta atual. |

Essas leituras confirmam colunas, chaves e guardas examinados **neste instante**; não simulam DDL completo, triggers de todos os writers, comportamento da API ou estado após deploy. Uma primeira consulta de catálogo falhou por cast de `tgenabled` no SQL da própria auditoria (`42725`), corrigida com `::text` antes das leituras acima.

O coordenador informou que os dois blocos `DO` do preflight da migration de portal passaram no Primary dentro de `BEGIN TRANSACTION READ ONLY`, sem DDL. Esse resultado foi comunicado a esta revisão, não executado pelos meus probes; ele complementa o inventário de catálogo, mas não substitui a aplicação da migration nem o teste de API pós-deploy.

## Comandos, códigos e rastreabilidade

```text
node docs/audits/20261020-continuo/run-local.mjs                     exit 0 (089d3b37)
  - aventura 8/8 arquivos, portal 3/3 arquivos                         exit 0 em cada
node docs/audits/20261020-continuo/run-probes.mjs                    exit 0 (089d3b37)
  - seis probes próprios, incluindo reprodução retroativa              exit 0 em cada
node docs/audits/20261020-continuo/probe_guard_drift.mjs            exit 0 (089d3b37)
  - fixture, guard no-op, migration, level forjado                      exit 0 em cada
node docs/audits/20261020-continuo/run-local.mjs fixed503            exit 0 (503cc578)
  - aventura 9/9 arquivos, portal 3/3 arquivos                         exit 0 em cada
node docs/audits/20261020-continuo/run-probes.mjs fixed503           exit 0 (503cc578)
  - seis probes próprios, incluindo avanço expirado/vivo               exit 0 em cada
node docs/audits/20261020-continuo/verify-guard-negative.mjs fixed503 exit 0
  - migrations no-op/binding com recusa esperada                        psql exit 3/3
  - portal_coop_config ausente nos dois bancos                          psql exit 0/0
npm exec -- vitest run src/test/AutoAdventure.test.tsx
  src/test/AutoAdventurePayload.test.ts src/test/AutoAdventureSync.test.tsx
  src/test/adventureScene.test.tsx src/test/adventureHoldNotice.test.tsx
  src/test/AutoAdventureAdvanceCache.test.tsx                           exit 0, 28/28 (503cc578)
git diff --check                                                        exit 0
```

Primeira tentativa Vitest sem `node_modules` no worktree: **exit 1**, `ERR_MODULE_NOT_FOUND` em `vitest/config`; após o coordenador fornecer uma junction à árvore de dependências existente, a mesma suíte passou. Nenhum `npm install` ou `npm ci` foi executado nesta revisão. SHA-256 LF das migrations em `503cc578`: aventura `74915d3ac7d22055c3a0f2d3c66c9b652aafc3fd0ae559f0cb06a9887a67e2d9`; portal `eaca556c4f31dbcf1967e8f9d96bb186a0299bb875a34e202f8f952f97998a20`. Os hashes originais estão em `local-suite.log`; os do corte corrigido em `local-suite-fixed503.log`. Probes e negativos estão em `independent-probes*.log` e `guard-negative-fixed503.log`.

## Limites e teardown

Esta revisão usou fixtures reduzidas, não replay do histórico completo de migrations, gateway Data API, duas sessões reais, browser autenticado ou migração implantada. Uma janela de 24h no mesmo ritmo da amostra exigiria aproximadamente 240 chamadas; `nextAdventureRefetchDelay` devolve intervalo mínimo de 1s com `pending`, sugerindo cerca de 4 minutos de ida e volta só de polling (inferência, sem medição de API). Resultados autorais reaplicados e probes independentes estão identificados separadamente; um teste verde não aprova o corte para produção. Os bancos `integration_review_*` e o cluster local **permanecem disponíveis**, conforme instrução do coordenador; não apaguei dados, cluster, logs ou junction. O coordenador fará o teardown. Arquivos alterados nesta revisão: somente `docs/audits/20261020-continuo/`.
