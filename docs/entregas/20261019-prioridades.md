# Prioridades e agenda — autoria 19/10/2026

## Estado entregue

- Alta/vermelha reserva até 4 vagas por data agendada; média/amarela até 8; baixa/verde ilimitada. Semanal flexível ocupa os sete dias. Únicas são comparadas pela data exata, mesmo quando caem no mesmo dia da semana.
- Prévia e multiplicadores iniciais: base 25 → alta 50 (2,0), média 25 (1,0), baixa 5 (0,2). A curva de nível, streak e bônus existentes não foi alterada. O cartão identifica XP **base**; a notificação usa `xp_gained` confirmado. Meta semanal discrimina `execution_xp`, `milestone_xp` e total confirmado.
- Gatilho `BEFORE INSERT OR UPDATE OR DELETE` serializa mutações por usuário com advisory lock transacional. A contagem inclui missões ativas, conclusões ainda visíveis e ledger privado persistente após reclassificação, arquivamento e exclusão. Dados legados acima do limite permanecem; edição sem alteração de vaga é permitida, enquanto ampliação e reagendamento que violam o limite retornam `MISSION_PRIORITY_CAP`.
- Toda inserção e alteração fixa `xp_reward = 25`, inclusive por papel privilegiado. A migration normaliza apenas a base **futura** de missões legadas para 25; não altera perfis, ledgers nem XP já creditado. Assim, verde paga 5 XP base, abaixo dos 50 XP base da alta nova, mesmo se o registro antigo continha `xp_reward` arbitrário. `daily_status`/conclusão não libera vaga no dia. O gatilho rejeita agenda inválida e troca de proprietário.
- Chaves de `daily_status` com formato `YYYY-MM-DD`, mas data impossível, são ignoradas no backfill e no gatilho via `pg_input_is_valid`. Elas não geram crédito no ledger nem abortam a migration por cast.
- Formulário mostra vagas e limites, identifica a reserva dos sete dias da semanal flexível e mantém controles de prioridade/dias com `aria-pressed`. Cartões receberam nomes acessíveis para ações por ícone. As strings novas para cinco idiomas estão em `20261019-prioridades-locales.json` para integração nos arquivos globais.

## Contrato com Progressão e integrador

1. A ordem lexicográfica é `20261019193625_progressao_reversao_checklist.sql` → `20261019200215_mission_priority_daily_caps.sql`; o segundo nome foi gerado por `npx --yes supabase migration new mission_priority_daily_caps` (CLI 2.121.0). A migration de prioridade exige `_complete_mission_daily(uuid,date,integer)` e `_complete_mission_with_weekly(uuid,date)`, com os `CASE` conhecidos 1,5/0,7. Ela lê `pg_get_functiondef`, troca estruturalmente só esses dois pesos para 2,0/0,2 e falha com `MISSION_PRIORITY_RPC_DRIFT` se a definição divergir. Nenhuma implementação completa de RPC foi sobrescrita por arquivo histórico.
2. Manter o retorno `complete_mission` com `xp_gained`, `gold_gained`, `execution_xp`, `milestone_xp`, `completed_date`, `frequency_type` e campos semanais já usados por `useMissionsHooks.ts`. `xp_gained` continua o total final confirmado; o hook só atualiza `xp_today` imediatamente quando `completed_date` é hoje em São Paulo.
3. O cliente passa apenas `p_mission_id` e opcionalmente `p_date` para a RPC. Campos legados `xpReward`/`attributeId` permanecem opcionais no tipo para chamadores existentes e não são enviados nem usados para crédito otimista.
   O toggle do checklist continua no arquivo de ownership de Progressão; a frente A deve confirmar que marcar/desmarcar não credita XP ou ouro. Aqui a cópia do formulário explicita que eventual bônus é pago só ao concluir a missão.
4. Integrar as chaves do JSON entregue em `src/i18n/locales/{pt,en,es,ru,zh}.json` e substituir as novas strings literais de `Missions.tsx`. Esta worktree não alterou locales globais nem `types.ts` por ownership.
5. O erro SQL `MISSION_PRIORITY_CAP:<alta|media>:<YYYY-MM-DD>:<4|8>` é consumido pelo formulário. `MISSION_SCHEDULE_INVALID` informa agenda inválida. A prévia do cliente pode estar obsoleta por concorrência ou por missões apagadas; o banco é a autoridade.

## Validação autoral

| Comando / ambiente | Resultado |
|---|---|
| `npm test -- --run src/test/missionPriority.test.ts` | exit 0, 26 testes |
| `npm test -- --run` | exit 0, 216 testes / 27 arquivos; baseline anterior: 211 |
| `npm run build` | exit 0; avisos preexistentes de Browserslist, `PortalEventPage` e tamanho de chunk |
| `./node_modules/.bin/tsc --noEmit -p tsconfig.app.json` | exit 2, 55 diagnósticos como no baseline autoral, 0 nos arquivos da frente |
| `C:\Program Files\PostgreSQL\17\bin\initdb.exe -D %TEMP%\life-priority-pg-task_aa50b99633d5 -U postgres -A trust --no-instructions` e `pg_ctl.exe -D ... -o '-h 127.0.0.1 -p 55440' -l ... start` | exit 0; PostgreSQL 17.9 descartável |
| `createdb -h 127.0.0.1 -p 55440 -U postgres priority_caps_final` | exit 0 |
| `psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55440 -U postgres -d priority_caps_final -f supabase/tests/priority_caps_setup.sql` | exit 0 |
| `psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55440 -U postgres -d priority_caps_final -f supabase/migrations/20261019200215_mission_priority_daily_caps.sql` | exit 0; um dia válido entrou no ledger, datas impossíveis não entraram, duas bases legadas foram normalizadas |
| `psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55440 -U postgres -d priority_caps_final -f supabase/tests/priority_caps_assert.sql` | exit 0, `priority_caps_assert: PASS`; cobre chaves inválidas no backfill e update, base legada alta/verde e inserção privilegiada |
| `pwsh -NoProfile -File supabase/tests/priority_caps_concurrency.ps1 -Port 55440 -Database priority_caps_final` | exit 0, uma inserção confirmou e a outra recebeu `MISSION_PRIORITY_CAP` |
| `pg_ctl.exe -D %TEMP%\life-priority-pg-task_aa50b99633d5 stop -m fast` / `pg_isready.exe -h 127.0.0.1 -p 55440` | exit 0 / exit 2 (`no response`); cluster encerrado |

O fixture SQL cobre 5ª alta e 9ª média, outras datas/dias, edição da própria vaga e tentativa de mover para dia cheio, únicas em segundas distintas, semanal flexível, arquivamento/reativação, conclusão/reclassificação/exclusão/recriação, `NULL` e prioridade desconhecida como média, legado excedente, agenda inválida e payload `xp_reward` arbitrário. O teste concorrente usa duas sessões PostgreSQL simultâneas. O teste de API é SQL local com `auth.uid()` simulado; não equivale a teste PostgREST ou Supabase remoto.

## Limites e próximos gates

- Nenhuma escrita, deploy, push ou merge remoto. Snapshot vivo de 19/10 (`live-db-snapshot.json` fornecido pelo coordenador) confirmou colunas da tabela e assinatura antiga da RPC semanal; não se presume que D-1/undo local tenha sido aplicado remotamente. A migration exige a assinatura nova após Progressão.
- CLI 2.121.0 gerou o arquivo corretivo; a migration antiga `20261019120000_mission_priority_daily_caps.sql` foi removida desta entrega, sem segunda cópia aplicável. As fixtures não reproduzem RLS/grants/Edge/PostgREST de produção. Revisão independente e execução sobre a ordem Progressão → Prioridades integrada seguem pendentes; A2 deve conciliar as definições vivas dentro da migration `193625` antes de aplicar esta migration.
- Backfill do ledger reconstrói conclusões ainda presentes em `missions.daily_status` ou missão única concluída. Não há como reconstruir missões apagadas **antes** desta migration; o histórico perdido permanece um limite conhecido.
- O junction `node_modules` desta worktree aponta para dependências existentes em `C:/Users/Murillo/Desktop/RPG-Buddy/rpg-buddy/node_modules`; seu conteúdo não foi alterado. A rodada corretiva usou cluster PostgreSQL 17.9 temporário `life-priority-pg-task_aa50b99633d5`, porta 55440, encerrado após os testes.
