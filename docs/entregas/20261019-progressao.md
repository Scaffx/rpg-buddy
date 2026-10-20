# Progressão e reversão — entrega autoral de 19/10/2026

## Rodada corretiva posterior a `b0f0dc1` — 19/10/2026

**Estado:** migration `20261019193625_progressao_reversao_checklist.sql` corrigida e
executada somente em PostgreSQL 17 local. O restante deste relatório descreve
a primeira entrega em `b0f0dc1` e deve ser lido como histórico, inclusive a
afirmação antiga de que só houve parse e o PostgreSQL não estava disponível.
Não houve SQL de escrita remoto, deploy, push nem merge. A revisão independente
e a aplicação integrada permanecem com o coordenador.

### Ordem e fonte de verdade

1. `20261019193625_progressao_reversao_checklist.sql` concilia internamente o
   estado publicado (D-1 ausente) ou WIP D-1, com ou sem
   `20260821140000_undo_missao_semanal.sql`. O preflight agora roda depois da
   conciliação; hashes UTF8/LF dos **quatro corpos completos** exigem uma das
   três combinações conhecidas. Se o remoto mudar, a transação falha antes da
   primeira alteração. Não aplicar `20260821120000` e `20260821140000` no
   remoto como prerequisitos desta migration.
2. `20261019200215_mission_priority_daily_caps.sql` (frente B2) vem **depois**
   da `193625`. As assinaturas `_complete_mission_daily(uuid,date,integer)` e
   `_complete_mission_with_weekly(uuid,date)` existem, com CASE `alta 1.5` e
   `baixa 0.7` para B2 trocar. Consulta local dos dois CASEs: `t|t`, exit 0.
   Esta rodada não antecipa os pesos de B2.
3. O wrapper público único é `complete_mission(uuid,date DEFAULT NULL)`. Os
   aliases de um argumento foram removidos; chamada com um argumento resolve
   para esse wrapper sem ambiguidade. Hoje/ontem são dias de São Paulo, futuro
   e D-2 são recusados. Helpers internos não têm EXECUTE para
   `PUBLIC`/`anon`/`authenticated`; `undo_mission(uuid,date)` valida identidade
   e a mesma janela. Owner e `service_role` continuam aptos a operar internamente.

Snapshot vivo `jfnospjxdkelxlhcwuia` foi relido em modo SELECT em 19/10:
`_complete_mission_daily` `7f11e3a3…`, `_complete_mission_with_weekly(uuid)`
`674f157f…`, `complete_mission(uuid)` `21cdfe0c…`, `undo_mission(uuid,date)`
`923ccdff…`. Os corpos publicados completos da conclusão estão em
`supabase/tests/progressao_live_functions.sql`; a migration os concilia sem
trocar fórmulas de XP, wallet, talentos, streak e guards por versões históricas.
O claim de conquista publicado, exercitado nos testes de segurança, está em
`supabase/tests/progressao_live_claim_achievement.sql`.
Os WIP locais são identificados por hashes próprios; D-1 sozinho e D-1 + undo
semanal tiveram caminhos de migração executados separadamente.

### Contratos e proteção corrigidos

- Conclusão semanal grava execução exata no ledger diário e marco exato na
  semana; diária sela total com checklist; única cria ledger próprio. Undo usa
  só total verificado, reverte a meta se a contagem cai abaixo dela e preserva
  a reversão de planos vinculados do remoto. Saldo insuficiente de ouro/XP
  recusa tudo sob lock; atributo primário é sempre filtrado por `user_id`.
- DML direto em `mission_daily_completions` é revogado. Em `checklist_items`,
  INSERT/UPDATE amplos são revogados e só `mission_id, description` na criação
  e `completed, description` na edição permanecem ao cliente. Bônus
  administrativos existentes não foram reescritos. INSERT direto de perfil ou
  atributo com XP/nível inicial forjado passa a ser barrado por trigger;
  o guard de UPDATE de `profiles` e a revogação de UPDATE de `attributes` do
  publicado permanecem.
- Conquistas não derivadas de rotina têm XP futuro zerado, mas ouro histórico e
  XP já creditado permanecem. Como `user_achievements` permite INSERT do dono,
  o claim de XP agora verifica `missions_total` e `level_reached` contra perfil
  protegido e `missions_streak` contra dias consecutivos no ledger. O claim
  legítimo dessas três categorias permanece; uma linha desbloqueada forjada
  não comprova XP. Dados históricos de ledger não foram auditados/corrigidos.
- A regra de saúde preserva o caminho publicado de cura diária e elimina os
  35 XP externos. `add_xp_to_user` e `pay_mission_penalty` deixam de ser RPCs
  executáveis por clientes.

### Reprodução SQL local e resultados

PostgreSQL 17 instalado em `C:\Program Files\PostgreSQL\17\bin`; `initdb.exe`
com `-A trust -U postgres`, cluster descartável em
`%TEMP%\rpg-progressao-55441-20261019`, `pg_ctl.exe` com
`-o '-h 127.0.0.1 -p 55441'`. Porta 55441 verificada livre antes do start.
Todos os `psql.exe` abaixo usaram `-h 127.0.0.1 -p 55441 -U postgres
-v ON_ERROR_STOP=1`; migration com `-1`, cliente `PGCLIENTENCODING=UTF8`.

| Estado inicial local | Comandos relativos ao checkout | Exit |
| --- | --- | ---: |
| Snapshot publicado reduzido | `-f supabase/tests/progressao_live_fixture.sql`, depois `-1 -f supabase/migrations/20261019193625_progressao_reversao_checklist.sql` | 0, 0 |
| Mesmo snapshot + só WIP D-1 | fixture, `-1 -f supabase/migrations/20260821120000_marcacao_retroativa_d1.sql`, depois `193625` | 0, 0, 0 |
| Mesmo snapshot + WIP D-1/undo semanal | fixture, `-1 -f 20260821120000_marcacao_retroativa_d1.sql`, `-1 -f 20260821140000_undo_missao_semanal.sql`, depois `193625` | 0, 0, 0, 0 |

Para repetir, criar três bancos descartáveis locais com `psql.exe -d postgres
-c 'CREATE DATABASE progressao_verify_live'` (e `_d1`, `_wip`), passar o
nome em `-d`, executar os arquivos na ordem da tabela e então:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -h 127.0.0.1 -p 55441 -U postgres -d progressao_verify_live -v ON_ERROR_STOP=1 -f supabase/tests/progressao_reversao.sql
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -h 127.0.0.1 -p 55441 -U postgres -d progressao_verify_live -v ON_ERROR_STOP=1 -f supabase/tests/progressao_security.sql
python supabase/tests/test_progressao_concurrency.py --database progressao_verify_live
```

As duas fixtures SQL tiveram exit **0 em cada um dos três estados**. A primeira
executou 7 modos: diária, semanal, única, marco semanal e D-1 das três
frequências; cobriu checklist `+7`, total de concessão/undo, replay,
reaplicação sem checklist e datas D-2/futura recusadas. A segunda cobriu
`SET ROLE authenticated/anon`, helper direto recusado, identidade cruzada,
INSERT/UPDATE de XP forjado, bônus forjado, claim de conquista, rollback com
ouro/XP insuficientes, plano vinculado e atributo alheio. Ambas terminam em
`ROLLBACK`. O runner de duas sessões teve exit **0** no snapshot publicado e
no WIP D-1/undo: por frequência, a primeira conclusão/undo teve exit 0, a
segunda foi recusada (exit 1); perfil/ledger terminaram em `20,1`/`1` após
concluir e `0,0`/`0` após desfazer. As sessões desse runner fazem COMMIT no
banco local de teste. Um quarto banco (`progressao_guard_fail`) recebeu a
fixture e um `search_path` divergente no wrapper: migration com `psql -1
-v ON_ERROR_STOP=1 -f supabase/migrations/20261019193625_progressao_reversao_checklist.sql`
retornou **3**, como esperado; a consulta posterior confirmou a assinatura
antiga presente, a nova ausente e a coluna de marco ausente (`t|t|t`), provando
rollback do preflight. Uma reprodução adicional desde a fixture atualizada com
o claim vivo (`progressao_repro_final`) deu exit **0** para fixture, migration e
ambas as suítes SQL.

Teardown em 19/10: `pg_ctl.exe -D
"$env:TEMP\rpg-progressao-55441-20261019" -m fast -t 30 stop` retornou **0**;
`pg_ctl status` retornou **3** (sem servidor) e `PG_VERSION` permaneceu no
diretório. A consulta de listener da porta 55441 não retornou processo. Os
arquivos do cluster foram preservados, conforme instrução posterior; para
repetir os comandos acima, iniciar novamente esse cluster com `pg_ctl.exe -D
"$env:TEMP\rpg-progressao-55441-20261019" -o '-h 127.0.0.1 -p 55441'
start` após confirmar que a porta está livre.

O esquema de teste é **reduzido**: colunas/assinaturas de progressão vieram do
snapshot vivo, mas Auth e helpers secundários são stubs neutros; isto não
prova a cadeia inteira, PostgREST, dados históricos reais ou deploy. Nenhum
teste escreveu no projeto remoto. Linhas diárias antigas sem selo e semanas
antigas sem parcela/marco exatos seguem recusadas pelo undo até conciliação
histórica específica; não há estimativa nem débito parcial.

### App e pendências de integração

| Comando | Exit | Resultado |
| --- | ---: | --- |
| `npm test -- --run src/test/checklistProgression.test.tsx src/test/undoMissionProgression.test.tsx src/test/completeMissionPayload.test.tsx src/test/todayXpNet.test.tsx` | 0 | 19 testes em 4 arquivos. |
| `npm run build` | 0 | Build Vite; avisos antigos de `PortalEventPage` e tamanho de chunks. |
| `node_modules/.bin/tsc.cmd --noEmit -p tsconfig.app.json` | 2 | 55 erros TS do app; mesmos 55 da base, sem alteração de `src/` nesta rodada. |

O retorno de `complete_mission(uuid,date)` mantém `xp_gained`/`gold_gained`
como **totais efetivos**, e `execution_*`/`milestone_*` são parcelas. B2 deve
preservar lock, selo, D-1, tipo `unique` e o helper `(uuid,date)` ao ajustar
prioridades. O frontend `useAchievements.ts` ainda seleciona `current_streak`
do perfil, coluna ausente no esquema vivo (a coluna é
`streak_current_days`); encaminhar correção ao integrador, sem edição fora do
ownership desta rodada. `NpcPage` não foi editada.


## Escopo e estado

- Base isolada: `1f49463efbf964ea94160353016af021f3e7c03e`, branch `Scaffx/rpg-progressao-20261019`, worktree limpa antes da edição.
- Ownership inicial: `useProfile.tsx`, `useUndoMission.ts`, testes e migration de progressão. Coordenador autorizou `NpcPage.tsx`, `ProfilePage.tsx`, `useOnboardingMissions.ts` e `OnboardingMissionsCard.tsx` por caminhos de XP fora da rotina.
- Migration criada por `npx --yes supabase migration new progressao_reversao_checklist` (CLI 2.121.0), arquivo `20261019193625_progressao_reversao_checklist.sql`. Não foi aplicada a qualquer banco. Não houve push, deploy ou merge.

## Alterações

- Toggle de checklist apenas atualiza `completed`; nenhuma escrita em `xp_history` ou chamada `add_xp_to_user` ocorre ao marcar ou desmarcar.
- Wrapper de conclusão trava a missão antes do dispatcher para serializar chamadas concorrentes. Sela o ledger diário com `xp_gained` e `gold_gained` realmente retornados; semanal usa a parcela de execução e mantém o marco na linha semanal; única ganha ledger próprio. Retorna data efetiva D-1 e tipo `daily`/`weekly`/`unique`.
- Undo lê apenas ledger verificado, elimina fallback histórico de 25 XP/2 ouro, suporta única e preserva a reversão semanal, marco, cota e reabertura de avaliação. Recalcula nível de perfil/atributo depois da subtração, lança histórico negativo e invalida consultas de XP, ouro e progresso. Sem rastro ou total confiável, recusa a operação antes de debitar.
- `useTodayXp` soma créditos e reversões em vez de filtrar apenas positivos; o início do dia usa America/Sao_Paulo.
- Desafio NPC novo registra `xp_earned=0` e deixa de chamar a RPC genérica; prêmio de ouro/item permanece. Desafio de saúde passa a restaurar HP uma vez ao dia, sem XP. UI deixa de prometer +35 XP.
- Catálogo de onboarding futuro passa a `xp_reward=0`; UI omite +0 XP e usa o retorno do servidor. Histórico já creditado é preservado.
- Conquistas cujo `condition_type` não deriva de rotina têm XP futuro zerado: `boss_kills`, `friends_total`, `journal_entries`, `loadout_full`, `water_streak`. `missions_total`, `missions_streak` e `level_reached` conservam XP derivado de rotina. Constraint impede novo XP de categorias externas. `pay_mission_penalty` e `add_xp_to_user` deixam de ser executáveis por `PUBLIC`/`anon`/`authenticated`; não há revogação de ouro ou itens da aventura.
- DML direto em `mission_daily_completions` é revogado para clientes; sem isso poderiam falsificar o novo marcador de ledger verificado.

## Contrato para a frente Prioridades

`complete_mission(p_mission_id, p_date DEFAULT NULL)` devolve JSON com `success`, `xp_gained` e `gold_gained` **totais efetivos**, `frequency_type` (`daily`, `weekly`, `unique`), `completed_date`, `is_backfill`, `weekend_bonus`. No semanal também devolve `execution_xp`, `execution_gold`, `milestone_xp`, `milestone_gold`, `weekly_count`, `weekly_target`, `weekly_max`, `is_overflow`, `milestone_reached`, `gained_keys`. Toast/otimista devem consumir `xp_gained` e `gold_gained` do servidor; parcelas são explicativas e não devem ser somadas de novo. O patch de prioridade, aplicado depois desta migration, precisa preservar o lock e o selo do ledger do wrapper, bem como o `frequency_type` único.

`undo_mission(p_mission_id, p_today)` devolve `success`, `xpEarned` e `goldEarned` **totais retirados**, `frequency_type`, `weekly_count`, `weekly_target`, `milestone_revoked`, `evaluation_reopened`, `week_start`. Para D-1, enviar exatamente o dia exibido; servidor valida hoje/ontem em São Paulo. Falha de ledger histórico ou resposta sem totais gera erro, nunca `0` fictício.

## Evidência e limites

| Comando/consulta | Exit | Alcance |
| --- | ---: | --- |
| `npm test -- --run` | 0 | 230 testes em 31 arquivos; suíte final local. |
| `npm test -- --run src/test/checklistProgression.test.tsx src/test/undoMissionProgression.test.tsx src/test/completeMissionPayload.test.tsx` | 0 | 18 testes; toggle state-only, erros/retry, três tipos de undo, payload D-1 e totais exibidos. |
| `npm test -- --run src/test/onboardingRewardDisplay.test.tsx` | 0 | 2 testes; nenhuma promessa de +0 XP. |
| `npm test -- --run src/test/todayXpNet.test.tsx` | 0 | XP hoje líquido e corte de dia de São Paulo; uma tentativa intermediária do teste falhou por espera dentro de `act`, corrigida e reexecutada. |
| `npm run build` | 0 | Build local; avisos preexistentes de PortalEventPage/chunks. |
| `node_modules/.bin/tsc.cmd --noEmit -p tsconfig.app.json` | 1 | Dívida preexistente de TS no app; após ajustes, filtro dos arquivos tocados mostra apenas `ProfilePage.tsx` com import duplicado de `Settings` já existente na base. |
| `node_modules/.bin/eslint.cmd` nos arquivos novos e `useUndoMission.ts`, `useOnboardingMissions.ts`, `OnboardingMissionsCard.tsx` | 0 | Arquivos sem erros; lint dos arquivos legados completos retorna 91 achados preexistentes. |
| `pglast.parse_sql` na migration e fixture | 0 | 21 e 5 statements parseados; sintaxe apenas, sem execução PostgreSQL. |
| Supabase `execute_sql` com `SELECT` de definições/colunas/grants/catálogos | leitura | Projeto `jfnospjxdkelxlhcwuia`, conta Primary; nenhuma escrita remota. |

`supabase/tests/progressao_reversao.sql` contém sete cenários locais (diária, semanal, única, marco semanal e D-1 dos três tipos), conferindo toggle, ledger, data inválida, conclusão única, retry, undo total, segundo undo e reaplicação sem checklist. **Não foi executada**: esta estação não tem `psql`, `pg_ctl` ou Docker disponíveis; `BEGIN/ROLLBACK` em produção seria escrita remota e foi proibido. O wrapper usa `FOR UPDATE` para duas chamadas concorrentes, mas esta propriedade ainda requer teste em duas sessões PostgreSQL locais antes da promoção.

## Drift e riscos de integração

- Consulta viva em 19/10: `complete_mission(uuid,date)` e `_complete_mission_with_weekly(uuid,date)` ausentes; `mission_daily_completions.weekly_week_start` e `mission_weekly_progress.milestone_xp` ausentes. O preflight da migration falha nesse remoto. Integrar D-1/undo semanal com as definições vivas sem replay cego da cadeia histórica, e só então revisar/aplicar esta migration em outra onda.
- Conclusões diárias anteriores ao novo selo podem ter base sem checklist no ledger. Não há vínculo inequívoco do histórico ao `mission_id` para corrigir todas automaticamente; undo passa a recusar esses registros para não deixar saldo residual nem debitar uma estimativa. Exigem conciliação histórica específica.
- Sem PostgreSQL local, cálculo/locks/ACL da nova SQL têm revisão estática e fixture proposta, não prova executada. Testes autorais e build não equivalem a auditoria independente ou deploy.
- A cópia de onboarding ainda usa algumas chaves antigas com linguagem de “recompensa/resgatar”; a UI já não mostra +0 XP. Chaves sugeridas ao integrador: `app.onboardingMissions.description`, `claim`, `claimed`, `claimedToast`, `claimError` com texto de etapa sem crédito; `app.profile.healthRestoredToast` e `healthAlreadyRestoredToast`. Não editar locales globais nesta frente.
- `NpcPage` ainda usa chamadas diretas para ouro/item, e a porta NPC está desabilitada (`NPC_LIBERADO=false`); consistência transacional de ouro/item não foi ampliada aqui. A frente Aventura deve verificar escritores legados de dungeon/coletivo e manter combate sem XP ou multiplicador de rotina.

## Escritores de XP auditados

| Caminho | Evidência | Ação/decisão |
| --- | --- | --- |
| `_complete_mission_daily`, `_complete_mission_with_weekly` | Definições locais e SQL vivo; seguem missões reais | Mantidos; wrapper sela total e serializa. |
| `add_xp_to_user` | RPC autenticada viva, recebe valor arbitrário | Revogação no cliente; chamada de checklist/NPC removida. |
| `claim_health_challenge` | RPC viva pagava 35 XP ao cumprir meta de saúde sem rotina | Reescrita para HP sem XP; UI ajustada. |
| `claim_onboarding_mission` | Catálogo vivo: cinco ações de setup somam 125 XP | Catálogo futuro zerado e travado; claims históricos preservados. |
| `claim_achievement` | Branch de XP vivo; categorias mistas | Catálogo zerado/travado só para condições sem rotina, mantendo categorias derivadas. |
| `pay_mission_penalty` | RPC viva converte ouro em XP; sem caller ativo no frontend | EXECUTE público/autenticado revogado. |
| `undo_npc_challenge` | Remove XP antigo registrado | Mantido para reversão histórica; novos desafios gravam 0 XP. |
| `claim_daily_bonus` | Definição viva não escreve `total_xp` | Mantido; não inferir de migration histórica. |
