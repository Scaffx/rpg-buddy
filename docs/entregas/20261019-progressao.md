# Progressão e reversão — entrega autoral de 19/10/2026

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
