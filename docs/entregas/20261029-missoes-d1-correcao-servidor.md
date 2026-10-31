# Missões Hoje/Ontem — correção local do servidor (2026-10-29)

[Certo] **Ainda não está em produção.** Esta entrega contém a migração local `20261029054922_mission_d1_server_start_and_weekly_close.sql`, fixtures/testes PG17 e a tradução de `MISSION_BEFORE_START` na UI. Nenhum SQL de escrita foi enviado ao Supabase Primary; não houve deploy, commit, push ou merge.

## Contrato corrigido

[Certo] `complete_mission(uuid,date)` continua a única entrada remunerada. Ela aceita apenas hoje/ontem em `America/Sao_Paulo`, trava a missão e rejeita `MISSION_BEFORE_START` quando a data escolhida antecede `created_at` ou, para semanal, `COALESCE(weekly_started_at,created_at)`. O teste de recusa observa XP, ouro e recibos inalterados. D-2 e futuro continuam `DATE_OUT_OF_WINDOW`; proprietário, agenda, cotas, recibos e undo preservam o fluxo existente.

[Certo] A trigger `guard_mission_created_at` corrige `created_at` para `statement_timestamp()` em INSERT com `auth.uid()` e recusa alteração autenticada por UPDATE com `MISSION_CREATED_AT_IMMUTABLE`. Isso abrange inclusive um papel que herda `authenticated`. A trigger semanal existente foi ajustada para derivar a data de conversão de `OLD.weekly_started_at` ou `OLD.created_at`, nunca do valor novo fornecido pelo cliente; criação, edição comum e conversão daily→weekly foram exercitadas. Importações privilegiadas sem identidade JWT não são reescritas retroativamente.

[Certo] `_evaluate_weekly_missions(uuid,date)` deixa a semana que terminou no domingo aberta durante a segunda: `last_closed_week = current_week - 14` na segunda, `current_week - 7` nos demais dias. Domingo pode ser completado/estornado na segunda; terça fecha o veredito sem zerar vereditos históricos. O avaliador agora obtém `pg_advisory_xact_lock(hashtext(p_uid::text), 20261019)` após validar UID e **antes** do primeiro `profiles FOR UPDATE`, compatível com complete/undo e a trigger de escrita; isso evita o ciclo de locks perfil→advisory versus advisory→perfil.

[Certo] `src/lib/weeklyMissions.ts` traduz `MISSION_BEFORE_START` para “Esta missão ainda não estava disponível no dia escolhido. Confira a missão em Hoje.” O teste focal do tradutor passou (14/14). SHA-256 dos arquivos finais: `weeklyMissions.ts` `08d4e29992a857af21d50fbbb7a451cf425507092820ab5e508f4ff49157f47a`; `weeklyMissions.test.ts` `4dcb78d203ccf44424d7b52eed7f30ae4f13d7b060c8a381bf8a4c05d3d67d92`.

## Preflight e proveniência

[Certo] O baseline foi relido por SELECT no projeto Primary `jfnospjxdkelxlhcwuia` em 2026-10-29. `public.missions` pertence a `postgres`, tem RLS ligado e FORCE RLS desligado, quatro policies permissivas PUBLIC com `auth.uid() = user_id` para SELECT/INSERT/UPDATE/DELETE e exatamente cinco BEFORE triggers habilitadas: `before_mission_status_normalize`, `enforce_mission_priority`, `lock_mission_priority_statement`, `set_mission_weekly_started_at`, `sync_weekly_mission_target_cap`. Seus nomes, definições, função alvo, SHA-256 LF da fonte, owner, SECURITY DEFINER, `proconfig` e ACL são pré-condições. Trigger adicional que pudesse reescrever `created_at` após a guarda interrompe o DDL.

[Certo] A migração valida também ausência de overload e guarda já instalada, tipos/ACL efetiva dos marcos temporais e metadados/fonte das três funções alteradas. Os SHA-256 LF predecessores exatos, iguais no Primary e na fixture reduzida, são: `complete_mission` `34317f24abdf4215c1837db9bbf3887f0aa6f6babc0e8d2a58ff5033f93e177f`; avaliador `893a3ffa2e1fbc0f78998f1a1e645009adebffc48bc822516fa057c6b628c023`; setter semanal `b006cbb29ee54fdc2e498b0557232f38c029193e4ebdcffc1bb67fbda52371fc`. MD5 LF, owner `postgres`, raw ACL, ACL efetiva e `proconfig` também são comparados no SQL. Fonte ou tabela desconhecida falha antes da primeira alteração.

[Certo] O arquivo da migração está em UTF-8/LF puro, SHA-256 **`ab018e8c3d97a256cd5d5714beac9505effcb80c57caab106a5f3765703ab02b`**. Após instalar na fixture PG17, os SHA-256 LF de catálogo ficaram: `complete_mission` `84dbc0ca37588566b4369730c1c6fba76cb2a82dd23d81c8517f5b1beda8fa1c`; avaliador `be1ee6a464f929bb915d73fb1b92d76524de855effc780d7f892ef6d3e62cfd1`; setter `56479973a7ea9a82508a4d85b6e1b64354c239fd841a65a596e79f88cf728564`. Owner, SECURITY DEFINER, search path, TimeZone, ACL e acesso efetivo continuam como no predecessor.

## Evidência local

[Certo] Cluster isolado PostgreSQL **17.9** na porta 55952. A fixture `supabase/tests/20261019_effect_undo_fixture.sql` e o replay `scripts/replay_reforma_sql_local.mjs ... --stop-before-p13` passaram (12 migrations A1–A12, exit 0). `prepare_predecessors.mjs` complementou somente o que a fixture reduzida omitia: avaliador/setter semanal exatos, colunas de proteção, RLS/policies e duas triggers de status/cap, com fontes dos arquivos históricos. A fixture **replica** esses objetos para compatibilidade do preflight; não é espelho da produção nem prova de clientes autenticados via PostgREST. A tentativa de replay P13 completo falhou por `sync_talent_points_on_level_change()` ausente nessa fixture, defeito fora desta migração; o escopo testado parou explicitamente antes de P13.

| Verificação | Resultado |
| --- | --- |
| Instalar migração final com `psql -X -v ON_ERROR_STOP=1 -1 -f ...` | exit 0; `DO`, `DO`, `CREATE FUNCTION`, `REVOKE`, `CREATE TRIGGER` |
| `assertions.sql`, em BEGIN/ROLLBACK | exit 0: hoje/ontem, D-2/futuro, início daily/weekly, timestamps forjados INSERT/UPDATE, edição/conversão, duplicata, undo/redo, identidade cruzada, anon, papel herdado; seis marcadores PASS |
| `weekly_close.sql`, em BEGIN/ROLLBACK com relógios instrumentados | exit 0: segunda aberta, domingo D-1 concluído/estornado/refeito, terça met/grace, terça D-2 recusado sem mutação; cinco marcadores PASS |
| `negative_preflight.mjs` em predecessor intacto | seis perturbações (body, ACL, overload, policy, owner, trigger desconhecida) retornaram exit 3 esperado; SHA da função e ausência da guarda permaneceram idênticos após rollback |
| `concurrency.mjs`, duas sessões autenticadas | exit 0: a segunda aguardou ~2 s e recebeu recusa; um recibo e um crédito de XP |
| `weekly_lock_concurrency.mjs`, duas sessões autenticadas | exit 0 nos modos `complete` e `undo`: fechamento terça versus outra missão do mesmo usuário, espera ~2 s, sem 40P01; veredito `failed`, respectivamente `1` ou `0` recibo diário, XP `5` ou `0`, ouro `102` ou `100` |
| `npm test -- --run src/test/weeklyMissions.test.ts` | exit 0, 14/14 |

[Certo] Os testes de concorrência usam bancos locais descartáveis e sessão PostgreSQL real. O teste de fechamento injeta **apenas localmente** um NOTICE e `pg_sleep(2)` após o lock de perfil para forçar o interleaving que antes gerava ciclo. Os testes funcionais de domingo/terça instrumentam datas dentro da transação de teste e fazem ROLLBACK. Stubs dessa fixture não equivalem à cadeia integral de produção; não há prova de rollout, PostgREST ou UX autenticada real.

[Certo] A aplicação futura deve executar o arquivo inteiro numa única transação, por runner Supabase apropriado ou `psql -X --set ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20261029054922_mission_d1_server_start_and_weekly_close.sql` em conexão autorizada. O arquivo não contém BEGIN/COMMIT próprios. Se o preflight falhar, a transação precisa ser abandonada; não há orientação para publicar segredo de conexão no relatório.

[Certo] O cluster isolado foi encerrado com `pg_ctl -m fast -w stop` (exit 0); `pg_isready -h 127.0.0.1 -p 55952` retornou exit 2, sem listener. Os logs locais ficaram em `%TEMP%/rpg-d1-server-taskff734ac58faf/`, sem credenciais nem dados de usuários reais.

## Limites e pendências

[Certo] A recuperação legada `Fiz` ainda pode escrever `daily_status` diretamente, sem prêmio, fora da janela remunerada; o relatório de auditoria separa esse residual. Esta entrega não reescreve essa recuperação nem receipts históricos.

[Certo] Falta revisão/integração da migração e aplicação remota sob autorização da coordenação, com preflight repetido no catálogo alvo imediatamente antes do deploy. Se fonte, ACL, RLS, policy, trigger ou owner tiver mudado, a migração interrompe e exige nova revisão; não se deve contornar o erro com um hash inventado.
