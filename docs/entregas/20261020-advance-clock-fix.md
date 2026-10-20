# Correção P1: avanço durante catch-up vencido — 20/10/2026

## Diagnóstico

[Certo] O motor em `bb03d72` mantinha `app_private.adventure_battles.status='fighting'` para a luta ainda não liquidada ao terminar um lote de 24 batalhas. Nesse estado, `catchup.pending=true` podia vir acompanhado de `battle.ends_at<=server_now`. `app_private.advance_auto_adventure(p_battle_id)` conferia identidade, modo `holding`, status e duplicidade, mas não conferia o relógio. Um pedido para o ID dessa luta vencida gravava `advance_requested=true` e chamava `sync_auto_adventure()`, aplicando a intenção recém-chegada a vitórias simuladas antes do pedido. O probe independente está em `docs/audits/20261020-continuo/probe_advance_pending_catchup.sql` no worktree do revisor.

## Mudança

[Certo] Depois dos locks de `adventure_state` e `adventure_battles`, o endpoint captura `clock_timestamp()` e só aceita a luta corrente se `started_at<=request_at<ends_at`. A luta vencida ou ainda futura retorna SQLSTATE `22023` antes de escrever `advance_requested` ou chamar o sync. A captura após os dois locks impede que uma espera no banco torne válida uma luta que expirou durante a espera. A UI pode sincronizar normalmente até `catchup.pending=false` e tentar de novo com o ID da luta viva. Nenhum estágio, dano ou resultado passa a ser aceito do cliente; o avanço durante uma luta viva ainda é aplicado somente quando essa luta vence.

## Verificação local

[Certo] Em PostgreSQL 17 isolado, porta `55439`, o banco `continuo_advance_clock_ctx28b` recebeu os oito arquivos SQL da suíte anterior e `src/test/sql/continuous_adventure_advance_clock_assert.sql`, todos com `psql -X -v ON_ERROR_STOP=1 -q -f <arquivo>` e exit 0. O teste cria usuário em `holding` na etapa 9, envelhece uma luta em duas horas, verifica `pending=true` e `status='fighting'` com `ends_at<=server_now`, e exige rejeição de `advance` com SQLSTATE e mensagem esperados. Compara o estado inteiro, número de batalhas, encontros, linhas de ouro, itens e recibos de boss antes/depois do erro. Depois drena o backlog somente com `sync_auto_adventure()`, conserva etapa 9 e caps, não cria clear da etapa 10, nem XP; um pedido de avanço na luta viva é aceito uma vez e a etapa 10 começa após o instante do pedido.

[Certo] A suíte anterior `continuous_adventure_assert.sql` continuou passando para auth/anon, skill e VFX, recuo, farm, boss, limite diário, retenção e idempotência. No banco separado `continuo_advance_concurrent_ctx28a`, duas chamadas simultâneas a `continuous_adventure_concurrent_call.sql` terminaram exit 0/0, deixando um recibo da etapa, saldo 104 partindo de 100 e uma luta ativa. O teste usa fixtures locais reduzidas, não o schema remoto completo. O Primary não recebeu consultas de escrita nem deploy nesta correção.

[Certo] O cluster e os logs de `%TEMP%\rpg_continuo_motor_ctx7e248` foram preservados; `pg_ctl stop -m fast -w` terminou exit 0. O junction `node_modules` para o checkout original também permanece; nenhum `npm install`/`npm ci` foi executado sobre ele. A correção não modifica UI, cadência econômica, tamanho de lote, Edge Functions ou migrations históricas.
