# Auditoria somente leitura — missões Hoje/Ontem (D-1)

[Certo] A janela D-1 da RPC não basta para garantir a experiência prometida: o fechamento semanal **publicado** ainda pode julgar o domingo na segunda-feira, e a conclusão não verifica se a missão existia no dia informado. Nenhum SQL de escrita, teste com conta, edição de produto, commit ou deploy foi feito nesta auditoria.

## Recorte e prova

[Certo] Checkout `C:/Users/Murillo/orca/workspaces/rpg-buddy/rpg-auth-foco-20261026`, branch `Scaffx/rpg-hordas-continuas-20261028`, HEAD `710b2c9552016607b3e368b194785310853c72d7`; árvore limpa antes deste relatório. Projeto Supabase **Primary / LIifeinRPG** `jfnospjxdkelxlhcwuia`, PostgreSQL 17.6.1.084. Foram consultados apenas `pg_proc`, `pg_get_functiondef` em trechos limitados, ACL/RLS/triggers/índices e histórico de migrations; nenhum dado de usuário foi lido.

[Certo] Os hashes abaixo são SHA-256 dos bytes UTF-8 de `pg_get_functiondef`, após normalizar CRLF para LF. Identificam **as definições vivas no momento da consulta**, não o arquivo de migration nem a publicação futura.

| Função viva | SHA-256 LF | EXECUTE efetivo `authenticated` / `anon` |
|---|---|---|
| `public.complete_mission(uuid,date)` | `34317f24abdf4215c1837db9bbf3887f0aa6f6babc0e8d2a58ff5033f93e177f` | sim / não |
| `public.undo_mission(uuid,date)` | `454bc6767bebe518af3e65159bd198b526b9c46bdd5c34c6fdd704fd0efb887a` | sim / não |
| `public._evaluate_weekly_missions(uuid,date)` | `893a3ffa2e1fbc0f78998f1a1e645009adebffc48bc822516fa057c6b628c023` | não / não |
| `public.check_weekly_mission_failures()` | `8b1ffab6c4360870d84da2fb33a3eeb3e9cc5e4ea98c855dfaeeaab4fba3818a` | sim / não |
| `private.mission_priority_occurs_on(missions,date)` | `1a5a395ac6cfb52b22ca4b920713fc0d00bbdebe324d3d4d944292e1bc5ed06b` | não / não |
| `private.enforce_mission_priority()` | `3a6ea96cb52fde90734c88e31c337a67f6a05acd74e804c9ed37c6dd29790874` | não / não |

[Certo] As seis funções têm owner `postgres`; as RPCs e o avaliador são `SECURITY DEFINER`. Não apareceu overload de `complete_mission` ou `undo_mission` na consulta de funções homônimas. As migrations `20261019193625`, `20261019200215`, `20261019204951`, `20261019205347`, `20261019210221` e `20261019220257` constam no histórico remoto; `20260821160000` não consta nessa consulta. A ausência no histórico não é, sozinha, prova do corpo instalado; os trechos vivos abaixo são a prova relevante.

## Contrato que já funciona

[Certo] `complete_mission` usa `auth.uid()`, data do servidor em `America/Sao_Paulo`, permite apenas hoje/ontem (`DATE_OUT_OF_WINDOW`), toma `pg_advisory_xact_lock` por usuário e `FOR UPDATE` na missão própria, recusa estado inativo e chama `private.mission_priority_occurs_on` antes de delegar. Fonte local correspondente: [wrapper, linhas 137–185](../../supabase/migrations/20261019210221_attribute_award_receipts.sql); o corpo vivo confirma esses pontos nas linhas 8–10 e 25–49. `p_date = NULL` significa hoje. Os delegates `_complete_mission_daily` e `_complete_mission_with_weekly` não têm `EXECUTE` efetivo para `authenticated`/`anon`; o segundo usa a semana ISO do **dia marcado**, logo domingo informado na segunda pertence à semana anterior. Fonte: [D-1, linhas 347–380](../../supabase/migrations/20260821120000_marcacao_retroativa_d1.sql); corpo vivo do delegate, linhas 70–92.

[Certo] O caminho publicado de conclusão seriada recusa o mesmo dia pela chave `daily_status` (diária) ou por `last_completed_date`/`daily_status` (semanal), e o wrapper exige exatamente um registro de ledger após a concessão. Fonte: [D-1, linhas 98–104 e 414–420](../../supabase/migrations/20260821120000_marcacao_retroativa_d1.sql), [wrapper, linhas 223–260](../../supabase/migrations/20261019210221_attribute_award_receipts.sql); corpo vivo semanal, linhas 126–131. A tabela `mission_daily_completions` tem apenas PK em `id`, sem UNIQUE estrutural `(mission_id,completion_date)`; a afirmação de idempotência se restringe ao caminho transacional das RPCs e à trava da missão.

[Certo] `undo_mission` também limita hoje/ontem em São Paulo, exige missão própria sob as mesmas travas, ledger `credited_total_verified`, saldo suficiente e recibos para reverter XP/ouro/atributos; recusa ledger negativo, antigo sem comprovação e semanal antigo sem recibo. Fonte: [undo, linhas 313–425 e 484–512](../../supabase/migrations/20261019210221_attribute_award_receipts.sql); corpo vivo, linhas 8–9, 35–43, 58–91 e 188–201. O undo semanal usa o `weekly_week_start` gravado para devolver a vaga à semana do dia desfeito, inclusive domingo desfeito na segunda.

[Certo] A trigger viva `private.enforce_mission_priority` usa `4` para `alta` e `8` para `media`, por dia agendado e por dia já concedido; a reserva `private.mission_priority_paid_days` fica em schema privado com RLS e sem ACL de cliente. Fonte: [cap/lock, linhas 49–50, 86–135 e 140–211](../../supabase/migrations/20261019204951_mission_priority_paid_cap_lock_order.sql). Semanal flexível ocorrer em qualquer dia é a regra atual do helper, não um defeito de agenda por si só: [helper, linhas 62–74](../../supabase/migrations/20261019200215_mission_priority_daily_caps.sql).

[Certo] O cliente atual só adjudica falhas diárias e avulsas a partir de **anteontem**, preservando ontem para marcação: [useFailedMissions, linhas 147–153 e 278–293](../../src/hooks/useFailedMissions.tsx). O caminho de falha não desconta XP/ouro/HP/MP; seu fluxo de graça/protetor é cliente e não foi validado como autoridade de servidor. A recuperação legada `Fiz` de missão já falhada é distinta de D-1: escreve `daily_status` diretamente, pode referir data mais antiga e declara XP zero ([linhas 426–468 e 549–592](../../src/hooks/useFailedMissions.tsx)). Não usar esse fluxo como prova de conclusão D-1 remunerada.

## Achados que impedem declarar o backend suficiente

### Alta — fechamento semanal prematuro na segunda

[Certo] O corpo vivo de `_evaluate_weekly_missions`, linha 11, ainda usa `v_last_closed_week date := v_current_week - 7`. `check_weekly_mission_failures()` usa a data atual de São Paulo e o chama (corpo vivo, linhas 8–15); o hook chama essa RPC ao verificar falhas ([linhas 95–100](../../src/hooks/useFailedMissions.tsx)). Na segunda, essa fórmula inclui a semana encerrada no domingo; o avaliador grava `evaluated_at` e decide `grace`, `protected` ou `failed` conforme a falta (corpo vivo, linhas 114–175). O delegate de conclusão semanal não reabre `evaluation_status`/`evaluated_at`. **Cenário:** meta semanal incompleta no domingo; abrir o app na segunda antes de marcar ontem pode consumir graça/protetor ou marcar a missão falhada. Se for `failed`, o wrapper recusa D-1 por `MISSION_NOT_ACTIVE`; se for graça/proteção, a conclusão posterior pode pagar, mas deixa veredito e consumo incorretos. A [migration local de adiamento, linhas 19–40](../../supabase/migrations/20260821160000_fechamento_semanal_fora_da_janela.sql) já descreve a lógica desejada, mas o corpo vivo não a contém.

[Provável] Correção exata: em nova migration com preflight de corpo/owner/ACL efetiva/overloads, substituir o cálculo por `CASE WHEN EXTRACT(isodow FROM p_today)::integer = 1 THEN v_current_week - 14 ELSE v_current_week - 7 END`, preservando o restante do avaliador. Assim a semana encerrada no domingo só entra no fechamento na terça, depois de toda a segunda D-1. Revalidar em PG17 com segunda antes da marcação, domingo marcado na segunda, terça após expirar D-1, e a transição de graça/protetor/falha. Não recarimbar automaticamente vereditos históricos sem conciliação específica.

### Média — conclusão remunerada antes da criação/início

[Certo] `complete_mission` verifica agenda, mas não compara `v_target` com `created_at` ou `weekly_started_at` (corpo vivo, linhas 37–49; [wrapper, linhas 173–185](../../supabase/migrations/20261019210221_attribute_award_receipts.sql)). `mission_priority_occurs_on` retorna `true` para toda data semanal ou para qualquer data cujo dia da semana conste em `days_of_week`, sem limite de existência ([helper, linhas 62–74](../../supabase/migrations/20261019200215_mission_priority_daily_caps.sql); corpo vivo, linhas 7–15). O delegate semanal calcula `v_weekly_started_on`, mas só o usa na ponte de streak, não para recusar `v_today` anterior (corpo vivo, linhas 104–107 e 149–150). **Cenário:** criar missão diária recorrente hoje com o dia da semana de ontem, ou semanal hoje, e chamar `complete_mission(id, ontem)` concede XP/ouro de execução para um dia em que ela não existia. Para avulsa, a data ainda precisa igualar `due_date`; uma `due_date` passada também é aceita se configurada.

[Provável] Correção exata: após travar a missão e antes de chamar o delegate, recusar `v_target < (v_m.created_at AT TIME ZONE 'America/Sao_Paulo')::date`; para semanal, também recusar `v_target < (COALESCE(v_m.weekly_started_at,v_m.created_at) AT TIME ZONE 'America/Sao_Paulo')::date`, com erro estável como `MISSION_BEFORE_START`. Para o marco ser confiável, tratar `created_at`/`weekly_started_at` como campos controlados pelo banco: hoje `authenticated` tem `INSERT`/`UPDATE` efetivos em `created_at` e RLS só confere `user_id`. Auditar compatibilidade de edição/conversão antes de restringir esses campos.

### Média — escrita direta de conclusão fora da janela, sem recompensa

[Certo] `authenticated` tem `UPDATE` em `missions.daily_status` e policy `UPDATE USING (auth.uid() = user_id)`; o trigger vivo, linhas 130–166, valida formato, atividade, agenda e cota de `alta`/`media`, mas **não** a janela hoje/ontem nem a data de criação. Uma chamada direta à Data API pode gravar `daily_status[um dia antigo ou futuro]='completed'` numa missão própria recorrente agendada, embora a RPC não permita e não conceda XP/ouro. Isso pode exibir conclusão e influenciar streaks derivados de `daily_status`; não foi demonstrado crédito de XP por essa via. A recuperação legada `Fiz` usa deliberadamente escrita direta para data antiga e XP zero, portanto não deve ser confundida com a marcação remunerada.

[Provável] Correção requer separar operação de conclusão remunerada e recuperação legada: mover a recuperação para RPC específica de XP zero e impedir que o cliente grave novas chaves `completed` diretamente, preservando atualizações de falha/agenda necessárias ao produto. Aplicar qualquer bloqueio só após mapear todos os escritores atuais de `daily_status` e os registros históricos; um `REVOKE UPDATE` amplo agora quebraria o hook de falhas.

## Limites e decisão

[Certo] Esta é prova estática do código vivo e dos metadados em 29/10/2026, sem invocar RPC de mutação, sem ler linhas de conta e sem simular concorrência na produção. O hook e as migrations locais não provam o estado vivo quando divergem; os trechos `pg_get_functiondef` e hashes acima delimitam esta conclusão. A ausência de UNIQUE natural no ledger e as escritas diretas da recuperação permanecem riscos de desenho separados da concessão D-1 via wrapper.

[Certo] **Decisão:** o caminho diário normal de ontem e o undo têm guardas importantes, mas o backend **não está suficiente** para a promessa geral Hoje/Ontem. Corrigir ao menos fechamento semanal de segunda e data anterior à criação/início antes de chamar o fluxo seguro; tratar escrita direta de `daily_status` em etapa compatível com a recuperação legada.
