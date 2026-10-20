# BUG32 — `MISSION_NOT_ACTIVE` ao completar missão criada pelo formulário

## Fonte e causa

[Certo] A base isolada foi `9019effe7da99b3cfa1b4ab3edcae6311858e338`. O handoff da reprodução publicada registrou `missions.status text NULL sem DEFAULT`; `useCreateMission` omitia `status`, enquanto `complete_mission(uuid,date)` exige `pendente`, `em_progresso` ou `em_andamento` antes de creditar. A missão de QA tinha `status NULL`, `completed=false`, `is_failed=false`, e a chamada autenticada retornou `P0001 MISSION_NOT_ACTIVE`.

[Certo] O snapshot vivo entregue pela coordenação continha 29 missões: 22 `NULL/false/false`, 4 `NULL/false/true`, 1 `NULL/true`, 1 `arquivada/true` e 1 `pendente/false`. São contagens da captura anterior ao patch, não uma consulta atual feita por este worker. A migration histórica declarava `status NOT NULL DEFAULT 'pendente'`, mas isso não descrevia o banco publicado.

## Escolha

[Certo] A nova migration `20261020020920_normalize_mission_status_for_completion.sql`, posterior às 13 SQLs publicadas, configura o default, normaliza `NULL` de novas linhas ativas antes do trigger de cota e atualiza apenas legados `status IS NULL AND completed IS FALSE AND is_failed IS FALSE`. Os dados de linhas falhadas, concluídas ou arquivadas não são reativados na aplicação. O hook envia `status='pendente'` também, cobrindo a janela de publicação do cliente.

[Certo] O trigger privado mantém a transição de undo de missão única concluída com `status NULL` somente quando a atualização ocorre sob o owner da RPC `SECURITY DEFINER`; UPDATE autenticado direto não reabre a concluída. Uma missão legada falhada com `status NULL` não pode ser reativada por `UPDATE is_failed=false` implícito; recuperação ou dispensa exige `status='pendente'` expresso e não concede XP. Os dois callers do produto expressam esse status apenas para o legado `NULL`, preservam `arquivada` e `pausada` e verificam erro ou zero linhas no UPDATE antes de anunciar sucesso. Tentativa de converter missão arquivada em ativa por `status=NULL` é recusada. O nome `before_mission_status_normalize` ordena o trigger antes de `enforce_mission_priority`, conforme [a regra de execução do PostgreSQL](https://www.postgresql.org/docs/17/trigger-definition.html).

[Certo] O preflight exige tipos/flags esperados, guardas de conclusão e cota, trigger ativo, owner `postgres` para execução/tabela/schema e para `undo_mission` `SECURITY DEFINER`, além da ausência da nova função/trigger. `CREATE FUNCTION` e `CREATE TRIGGER` não sobrescrevem objetos existentes. Não há nova RPC, concessão de XP/ouro, mudança em ACL/RLS existentes ou alteração das 13 migrations.

[Provável] Alterar apenas o hook deixaria as missões legadas quebradas e chamadas SQL com `NULL` explícito; tratar todo `NULL` como ativo dentro da RPC exigiria também revisar os guards de cota e poderia reabrir estados históricos. Por isso a normalização restrita foi escolhida.

[Certo] O corte inicial `5db8af6` recebeu ajustes requeridos após a revisão `msg_07ba5d03d3e3`; ele não foi aprovado nem aplicado. Esta revisão permanece para avaliação independente antes de qualquer publicação.

## Prova local

[Certo] PostgreSQL 17 local, cluster `%TEMP%\rpg-bug32-pg17-ctx7aa7`, porta `55632`, banco UTF8 `integration_bug32_rev1`: três fixtures `20261019_integracao_*` aplicadas com `psql -X -q -v ON_ERROR_STOP=1` (exit 0 cada) e `node scripts/replay_reforma_sql_local.mjs integration_bug32_rev1 55632` (13 migrations, exit 0). A prova `psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55632 -U postgres -d integration_bug32_rev1 -f supabase/tests/20261020_mission_status_regression.sql` saiu **0**, com `ROLLBACK` final. Ela reproduz schema sem default/NOT NULL, aplica a migration na transação, compara snapshot de perfil/atributos/ouro/ledger/progresso semanal/históricos/daily_status, cobre legado ativo, formulário sem status, `NULL` explícito, conclusão/undo exatos, única legada, semanal 4x, limpeza de falha `NULL` implícita recusada, recuperação explícita sem XP seguida de conclusão única e undo exatos, arquivada/concluída recusadas, cotas agendadas 4 altas/8 médias, 5ª/9ª concessões recusadas, replay sem crédito duplo e estado inalterado após recusa.

[Certo] Após aplicar a migration no mesmo banco local (exit 0; backfill 0 na fixture), `20261019_agenda_conclusao.sql`, `priority_caps_corrective_rpc.sql` e `20261019_weekly_target_milestone.sql` saíram **0**. `npm run test -- src/test/dismissFailedMissions.test.ts src/test/missionFailNoPenalty.test.ts` saiu **0**, 18/18: os testes do hook cobrem status explícito para legado `NULL`, preservação de arquivada/pausada, ausência de XP e falha/zero linhas de UPDATE sem registro de sucesso. `git diff --check` saiu **0**.

[Certo] `npx --no-install tsc --noEmit -p tsconfig.app.json --pretty false` saiu **2** por dívidas globais, sem diagnóstico em `useFailedMissions.tsx` ou `dismissFailedMissions.test.ts`. `npx --no-install eslint` nesses dois arquivos saiu **1** por 34 erros `no-explicit-any` no módulo/teste; há ocorrências anteriores nos callers e no mock ampliado, enquanto o helper novo usa tipos explícitos. Esses resultados não são um gate verde da aplicação inteira.

[Certo] SHA-256 dos bytes UTF-8 com LF da nova migration: `7489378963141a5980c37cb542ec6299043b8998b0ee459acc04a4fbe6e67751`. Fontes críticas da base: `20261019210221_attribute_award_receipts.sql` = `93d694789ebae1a2007798b2243950010d32b1de8d083a93b4977512a2d9597d`; `20261019204951_mission_priority_paid_cap_lock_order.sql` = `3562859ef81048797c075e4d769d1752a6d6a0bf5114ff7f326e415210eea9a9`.

## Risco e reversão

[Provável] O backfill atualizará 22 linhas do snapshot publicado se nada mudou desde a captura; triggers de `updated_at` no schema vivo podem alterar timestamps dessas linhas. Rotinas legadas sem agenda válida continuarão recusadas pelo guard de agenda. A fixture local reduzida não prova API/PostgREST, RLS completo, UI autenticada nem estado atual de produção.

[Certo] Antes da aplicação remota, guardar preimage por `id` de `status`, `completed`, `is_failed`, `updated_at` e contagens de wallet/ledger. Se a transação de aplicação falhar, o rollback transacional restaura tudo. Para reversão posterior, remover somente o trigger/função novos, restaurar o default anterior capturado e devolver `status NULL` apenas aos IDs do preimage ainda sem mudança posterior; nunca fazer UPDATE amplo de todas as linhas `pendente`. Nenhuma escrita remota foi feita nesta tarefa.

## Complemento da integração e aplicação pela coordenação

[Certo] O corte final de SQL é o commit `5a18d092`, SHA-256 UTF8/LF `67fe32da76ecf2071d343af86d38e8bd0ee21ef4691ee66c61af3e86b922ea97`. Além do reparo acima, exige os dois gatilhos de cota e lock ativos em origem, tipos, funções alvo e owners esperados. A revisão independente deste corte e seus testes negativos estão em `../20261019-status-review/REPORT.md`.

[Certo] A coordenação aplicou esse SQL na Primary em 20/10/2026 às 02:37 UTC (19/10 às 23:37 BRT), depois de conferir as condições vivas e guardar preimage privada fora do Git. Foram normalizadas 31 linhas ativas, incluindo registros de QA criados após o snapshot inicial. Oito comparações de conteúdo por checksum preservaram progressão, carteiras, inventário, atributos, conclusões, progresso semanal, linhas históricas inativas e todos os demais campos de missões, exceto status e updated_at esperados. Histórico: 178 migrations; versão canônica `20261020020920`, SQL armazenado com o mesmo hash. Nenhuma preimage de conta foi incluída neste PR.

[Certo] Na integração, 268 testes em 38 arquivos passaram; o build final passou após integrar os rótulos de prioridade derivados das constantes compartilhadas. A instalação limpa npm ci e o typecheck global continuam com dívidas anteriores, separadas dos testes com as dependências disponíveis. O smoke da interface deste reparo será registrado pela coordenação após a publicação.
