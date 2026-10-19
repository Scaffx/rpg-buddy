# Integração local da reforma LifeOnRPG — 19/10/2026

## Escopo e estado

[Certo] Worktree isolada `rpg-automatico-integracao-20261019`, base `58e0f347`. Commits autorais selecionados, na ordem local: `9e509c0` (B4), `e9687fc` (A4), `c512dc2` (A5), `c9d3deb` (UI), `07e3b61` (C4), `0d5d011` (C5), `a6b25a1` (A6), integração `fc1206c`, release Edge `3b82b7e`. São cherry-picks locais dos SHAs aceitos `a1f7ebc4`, `a67a3c2b`, `987b2312`, `c208dd16`, `291a4e12`, `a38d0eeb`, `57b72f81a8d0a2d6afdc92cf95bd8caae8572d0a`, `305c3d0e89ae06343eb0bd2a86557b5fe006b640`. Os onze SQLs abaixo pertencem à base e aos commits de domínio. Nenhum push, deploy, SQL remoto ou merge no checkout principal foi feito.

[Certo] A composição de frontend acrescenta tipos do RPC/catálogo, parse estrito do retorno da aventura, traduções pt/en/es/ru/zh, undo no dia focado, labels de Aventura e assinatura tipada do pet. `AppLayout` sincroniza a aventura quando o usuário autenticado abre qualquer painel; a Arena observa a mesma query por usuário. A query refaz no próximo tick calculado pelo relógio do servidor, no foco e na reconexão. O cliente não calcula recompensa. O resultado da RPC de conclusão continua sendo o total de XP confirmado; undo usa o recibo creditado.

[Certo] A calibração local é alta/média/baixa `2,0/1,0/0,2` sobre 25 XP base: `50/25/5`, com 4 altas e 8 médias por dia agendado, baixas sem teto. Ouro de missões permanece. Aventura concilia a cada 30 minutos, até 24 horas ou 48 confrontos por sincronização, no máximo 120 ouro e 2 itens por dia São Paulo; vitória normal/chefe paga até 4/12 ouro, sem XP, nível ou atributo permanente. Chefes são etapas 10, 20, 30 etc. Os números de aventura são calibração inicial local, não exigência numérica do usuário. Pets não pagam XP, ouro ou multiplicador por si mesmos.

## Pacote SQL ordenado

[Certo] O pacote para a composição começa nas definições remotas conhecidas de 19/10, guardadas pelo preflight de `20261019193625`. O primeiro SQL reconhece três vetores de hashes de `pg_get_functiondef` normalizado em UTF-8/LF: publicado, D-1, ou D-1 com undo semanal. Não requer reaplicar toda a cadeia de migrations históricas. Os SQLs seguintes devem seguir esta ordem; cada arquivo é uma transação separada. Hashes SHA-256 abaixo são dos bytes UTF-8 com quebras LF usados no replay local e permitem conferir a identidade do pacote independentemente do checkout Windows.

| Ordem | Migration `supabase/migrations/` | SHA-256 UTF-8/LF |
| ---: | --- | --- |
| 1 | `20261019193625_progressao_reversao_checklist.sql` | `2c6af5af0cfa9569c87a3748d03b3430fe90a56c4ea962ce0e1917ff93e50445` |
| 2 | `20261019194052_auto_adventure.sql` | `d02a7ba2f0eb39108c20aee23e775fc174a5b637e0c07d4d1f9941c84491d6a3` |
| 3 | `20261019200215_mission_priority_daily_caps.sql` | `d436d6b5822e41ce554bf82ee2918b3fefe992058d69ba523e547f74208ea` |
| 4 | `20261019204003_close_forged_xp_buff_and_npc_undo.sql` | `ea949b299e9b872bcd26d1949a2de2c7ee5a28b3d46d772ea3c8786e4189c8d3` |
| 5 | `20261019204951_mission_priority_paid_cap_lock_order.sql` | `3562859ef81048797c075e4d769d1752a6d6a0bf5114ff7f326e415210eea9a9` |
| 6 | `20261019205224_boss_auto_entitlements.sql` | `1064fd0ff8a949839f23f2400c0ebcb7c2554f4e0811ed774af27f6f08d3eaf0` |
| 7 | `20261019205347_guard_mission_completion_schedule_and_undo_after_paid_cap.sql` | `cd0858c23bd12f75820430e6b5c78c16a39de97b3846cb1e93cbb54c26b08207` |
| 8 | `20261019210026_inventory_authorship.sql` | `3df342d304bbf4d70f2dc5d1a11c47cbd46a20334f2896546d18448d5c47840b` |
| 9 | `20261019210221_attribute_award_receipts.sql` | `93d694789ebae1a2007798b2243950010d32b1de8d083a93b4977512a2d9597d` |
| 10 | `20261019211310_auto_adventure_reachable_catalog.sql` | `be47c71f1d7df305ef493be2fc6b115ec50071881caeca8c9f699e1b9873bfdb` |
| 11 | `20261019212523_restore_unpaid_weekly_milestone_after_target_edit.sql` | `1bcceaedeceb7e194f4b84e73660ba0bef85cb518908fc3ea9a6753ffffe0f44` |

[Certo] `node scripts/replay_reforma_sql_local.mjs integration_package_ctx_c3e640 55531` aplicou os onze em PostgreSQL 17 local, exit **0 em cada arquivo** já com o A6 ajustado. O runner restringe destino a `127.0.0.1`, usuário `postgres` e banco cujo nome começa por `integration_`; exige banco descartável previamente criado. Normaliza CRLF do checkout para LF antes de `psql -1 -f -` e imprime cada hash. A fixture é `supabase/tests/20261019_integracao_fixture.sql`, aplicada uma vez antes do runner com `psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55531 -U postgres -d integration_package_ctx_c3e640 -f ...` (exit 0).

[Certo] O A6 autoral original (`57b72f81`, SHA-256 LF `dcb04f0663593d575bf96ab79c09390dd33c3cdb8f7c609c93f723d4dee5d3d7`) falhou **exit 3** quando os dez SQLs anteriores entraram via arquivos CRLF: `WEEKLY_MILESTONE_RPC_DRIFT`, sem aplicar A6. O helper pré-A6 tinha 503 `\r`, hash bruto `319bee29a550d6707f46f9387032572c`, mas hash com pares CRLF convertidos a LF `79de81c374d61104c0625b4c4eb8c03d`, exatamente o esperado. O guard tinha 15 `\r`, hash normalizado `4f75688bda580c0d8e69dc354701ba18`, também esperado. O coordenador autorizou um patch **somente de transporte** no A6: fingerprint do corpo completo normaliza apenas pares CRLF, conta uma ocorrência do alvo em LF ou CRLF, e troca no estilo original sem alterar outros bytes. CR solto, espaço e comentário permanecem divergência. Este patch é conteúdo novo de integração; o SHA autoral não o cobre.

[Certo] Ensaios do patch A6: no clone pré-A6 CRLF, `psql -1 -f` exit **0**; helper final hash bruto `f65087fd42233bb5cefad6fc85d1e172`, normalizado `e54f3a202d324d8a532af8ae64f77b7b`, preservando 503 CR. No clone pré-A6 LF, A6 com bytes LF exit **0** e helper/guard finais `e54f3a202d324d8a532af8ae64f77b7b`/`07c1ca667066602d4813536a1c705bec`, zero CR. Com `supabase/tests/20261019_a6_drift_probe.sql` seguido do A6 na mesma sessão `psql -1`, comentário real e CR solto geraram `WEEKLY_MILESTONE_RPC_DRIFT` exit **1** cada; a transação reverteu a mutação, hash pré-A6 permaneceu `79de81c374d61104c0625b4c4eb8c03d`, sem o operador `>=`. A aplicação posterior de A6 LF no mesmo clone passou. O guard estrito continua rejeitando corpos desconhecidos.

## Reprodução e resultados

[Certo] Ambiente: PostgreSQL 17 local em `127.0.0.1:55531`, cluster descartável `%TEMP%\rpg_integracao_ctx_c3e640_20261019`; `integration_package_ctx_c3e640` recebeu fixture reduzida + pacote LF. `PG17/bin/createdb -h 127.0.0.1 -p 55531 -U postgres -T template0 -E UTF8 integration_package_ctx_c3e640` exit 0. Testes `psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55531 -U postgres -d integration_package_ctx_c3e640 -f <arquivo>`:

| Teste SQL | Exit | Evidência |
| --- | ---: | --- |
| `progressao_reversao.sql` | 0 | diário, semanal, único, D-1 e marco; undo e reaplicação |
| `progressao_security.sql` | 0 | ACL e papel autenticado da progressão |
| `20261019_agenda_conclusao.sql` | 0 | agenda, archive, autoria, ledger e undo |
| `20261019_attribute_award_receipts.sql` | 0 | recibos de atributo, edição, redo, legado negado |
| `20261019_weekly_target_milestone.sql` | 0 | target 1/2, overflow, recibo único e undo completo após A6 |
| `20261019_attribute_insert_guard.sql` | 0 | falsificação de XP/level rejeitada no modelo local |
| `20261019_integracao_assert.sql` | 0 | pet legado, compra, wallet, etapas 1/10/11/20, RLS, zero XP de combate, RPC repetida sem novo prêmio |
| `20261019_integracao_clock.sql` | 0 | relógio injetado localmente: segunda 19/10, terça 20/10, marco, dois undos; terminou em ROLLBACK |
| `priority_caps_corrective_rpc.sql` | 0 | caps 4/8/12 e XP 50/25/5 no clone local |
| `20261019_agenda_concurrent.ps1 -Port 55531 -Database integration_package_ctx_c3e640` | 0 | duas sessões, edição direta e RPC/edição serializadas |

[Certo] `npm run test -- --run`: exit **0**, 36 arquivos/252 testes, incluindo 7 do release Edge. `npm run build`: exit **0**, avisos de Browserslist e chunk grande; sem erro de build. `tsc --noEmit -p tsconfig.node.json --pretty false`: exit **0**. `tsc --noEmit -p tsconfig.app.json --pretty false`: exit **1** neste shell Windows, 53 diagnósticos; comparador normalizado contra `baseline-typecheck.log`: base 55, atual 53, **nenhum diagnóstico novo**, dois TS2551 removidos em `BossPage.tsx`. ESLint nos 38 TS/TSX tocados em `src/`: exit **1**; comparador contra `baseline-lint.json`: 272 mensagens relevantes da base, 216 atuais, nenhuma nova, 56 removidas. Os arquivos Edge de release são snapshot publicado e patch somente por remoção; ficam fora desse lint de app, mas o teste de contrato verifica seu diff/hash e transpila ambos. Baseline inicial da suíte: 27 arquivos/211 testes, build exit 0, app 55 erros. `npm ci --no-audit --no-fund` não foi provado reproduzível; a dependência local é junction e não demonstra instalação limpa.

## Compatibilidade, rollout e limites

[Certo] O saldo `user_balance` é comum às missões, compras e aventura. A compra usa preço do item no servidor, idempotência por request e autoria do inventário. Históricos de ouro, missões e itens não são apagados nem recalculados. Os pets pré-existentes passam por entitlement de transição de identidade/tipo/origem: preserva acesso, sem certificar compra ou vitória histórica. O pacote D-1/undo semanal local é aceito pelo preflight, mas a produção pode estar na assinatura publicada anterior; primeiro comparar as definições vivas e hashes. SQL/cliente devem entrar juntos após revisão independente; preflight divergente bloqueia aplicação. Não aplicar remoto nesta integração.

[Certo] A fixture é reduzida e modela apenas as tabelas/ACL necessários; os grants/RLS simulados de testes não são prova do esquema inteiro nem da API de produção. O cluster usa `trust` apenas no listener local descartável. Testes de relógio não alteram o relógio do sistema; o teste substitui a função de data dentro de uma transação revertida. O teste de prioridade e o de concorrência escrevem apenas no banco local descartável. Dados e logs locais permanecem até teardown explícito.

[Certo] O commit local `3b82b7e` incorporou o release mínimo de `processar_turno` a partir da captura publicada v33 (`ACTIVE`, `verify_jwt=true`) em `supabase/releases/20261019/processar_turno/`, sem editar o canônico `supabase/functions/processar_turno/index.ts`. SHA-256 exatos: snapshot `published-v33.ts` `c010dd703c9ebf3676252141d8893333856b38971b7b2debd6e5844851220c01`; patch `index.ts` `6943cd24afe689cf8fb6f4b39f9a29eeb546cedfd773c38f0f2755c3cc44feba`; canônico local intacto `8ab683ecc8b6f146c4c8beac87908e5f05377f6e7820c60aa16b47938cc1c21e`. O diff do patch remove exatamente 145 linhas e não adiciona linhas: prêmios da primeira vitória e semanais, incluindo XP/nível, ouro, materiais, item, `boss_battles` e recibos falsos. Mantém resposta HTTP, auth/CORS, combate/saúde e log de turno zero XP. Os 7 testes do handler simulam vitória com/sem registro prévio, weekly loot, turno comum, falta de auth e OPTIONS; passam no pacote (Vitest transpila TypeScript, sem Deno instalado). O README do release traz guarda de drift da versão/hash vivos e instruções de eventual publicação/rollback para revisão posterior, não executadas aqui.

[Provável] A Edge **ainda publicada** v33 permanece um risco até deploy futuro: ela tenta XP/nível/ouro e log positivo em vitória legada, ignorando erros. C4 bloqueia entitlement por uma vitória sem encontro automático, mas o handler publicado continua as tentativas posteriores. `useTodayXp` soma `activity_log.xp_gained`; se esse insert for permitido no serviço vivo, a UI pode mostrar XP sem perfil creditado. Sem teste autenticado da API e triggers/grants vivos, crédito efetivo de XP/ouro não está demonstrado. A UI solo nova não monta `CombatArena`; a Edge segue alcançável por HTTP autenticado. O release local não substitui a versão publicada até uma decisão e um deploy separados.

[Certo] Teardown local concluído: `pg_ctl.exe -D %TEMP%\rpg_integracao_ctx_c3e640_20261019 -m fast -t 30 -w stop` exit **0**; `pg_ctl status` exit **1** com `no server running`; `Get-NetTCPConnection -LocalPort 55531 -State Listen` encontrou **0** listeners. `PG_VERSION` e `postgres.log` seguem no diretório; bancos e logs locais não foram apagados. Revisão independente, live preflight, plano de liberação e smoke autenticado ainda são gates do coordenador; esta entrega não afirma aprovação, produção ou release.
