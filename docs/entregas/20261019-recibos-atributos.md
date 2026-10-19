# Recibos de XP de atributos — entrega autoral de 19/10/2026

## Escopo e decisão

[Certo] Base desta worktree: `a67a3c2b78fd5be0308142db20e5a6cf2e576103`.
Migration nova criada pela Supabase CLI 2.121.0:
`supabase/migrations/20261019210221_attribute_award_receipts.sql`. O arquivo
`20261019204951_mission_priority_paid_cap_lock_order.sql` usado nos testes veio
da worktree `../rpg-prioridades-20261019`; seu blob tem hash Git
`2c76c8f453435326baeb4571602b6943a54667c6`, igual ao commit estável
`a1f7ebc4fc40017f745a82bb17dcf9133ef3c9cc`. Não editei B4 ou migrations
anteriores. Não houve SQL remoto de escrita, push, deploy ou revisão independente
desta entrega autoral.

[Certo] O achado `cd44ef4` pagava 12 XP por elemento de
`secondary_attribute_ids`: dez cópias de Disciplina davam 120 XP de atributo
numa conclusão. A interface atual permite no máximo dois atributos secundários.
O wrapper agora recusa array que não seja JSON array de até dois UUIDs válidos,
IDs repetidos, primário entre os secundários e qualquer ID que não pertença ao
usuário. `NULL` SQL continua significando lista vazia para missão legada. A
validação acontece antes da chamada dos helpers que pagam XP; dados históricos
malformados permanecem intactos, mas a conclusão recebe erro claro e não paga.
As fórmulas 50/25/5 do perfil, checklist, streak e prioridade não foram
recalibradas.

[Certo] Cada conclusão nova grava em `private.mission_attribute_receipts` a
identidade da missão, dia, dono e número de linhas; em
`private.mission_attribute_awards`, o ID e o delta de XP efetivo de cada
atributo. O wrapper trava os atributos pretendidos antes do helper e confere
o delta real após ele. O bônus semanal tem recibo separado em
`private.mission_attribute_milestones`, pois pode continuar pago mesmo após
desfazer a execução que o alcançou quando outra execução mantém a meta. O undo
usa apenas esses deltas: ao revogar o marco, debita o atributo que recebeu
aquele marco, mesmo se a missão agora aponta para outro. As três tabelas têm
RLS habilitada e DML revogado de `PUBLIC`, `anon` e `authenticated`; o helper
privado de undo também não tem EXECUTE do cliente. Os wrappers mantêm
`pg_advisory_xact_lock(hashtext(auth.uid()::text), 20261019)` **antes** do lock
da missão e dos atributos.

[Certo] Uma conclusão anterior à migration não tem recibo de atributo
verificável. `undo_mission` recusa **somente essa reversão** com
`ATTRIBUTE_AWARD_RECEIPT_MISSING: conclusao antiga requer conciliacao antes do desfazer`,
sem reduzir perfil, ouro ou atributos. O estado histórico não foi adivinhado,
apagado nem recalculado. Um marco semanal histórico sem recibo também é
recusado se o undo precisaria revogá-lo. Edições posteriores de `attribute_id`,
`secondary_attribute_ids`, `priority`, título e agenda futura não redirecionam
o débito registrado. O preflight compara os corpos completos de
`complete_mission(uuid,date)` e `undo_mission(uuid,date)` instalados por A4;
drift faz a migration inteira falhar antes do primeiro DDL.

## Reprodução local

[Certo] PostgreSQL 17 local, `initdb -U postgres -A trust --encoding=UTF8`,
cluster preservado em
`%TEMP%\rpg-attr-receipts-task_d16f77c0-20261019`, listener
`127.0.0.1:55492`, `PGCLIENTENCODING=UTF8`, `psql -X -v ON_ERROR_STOP=1`.
Consulta local `server_encoding|server_version` retornou `UTF8|17.9` (exit 0).
O teste usou a fixture reduzida `supabase/tests/progressao_live_fixture.sql`
em banco novo, seguida por `psql -1 -f` em cada arquivo nesta ordem:

| Etapa | Arquivo | Exit |
| --- | --- | ---: |
| Fixture | `supabase/tests/progressao_live_fixture.sql` | 0 |
| A | `supabase/migrations/20261019193625_progressao_reversao_checklist.sql` | 0 |
| B | `../rpg-prioridades-20261019/supabase/migrations/20261019200215_mission_priority_daily_caps.sql` | 0 |
| A3 | `supabase/migrations/20261019204003_close_forged_xp_buff_and_npc_undo.sql` | 0 |
| B4 | `../rpg-prioridades-20261019/supabase/migrations/20261019204951_mission_priority_paid_cap_lock_order.sql` | 0 |
| A4 | `supabase/migrations/20261019205347_guard_mission_completion_schedule_and_undo_after_paid_cap.sql` | 0 |
| Esta entrega | `supabase/migrations/20261019210221_attribute_award_receipts.sql` | 0 |

Comando da migration e das suítes (trocar `$file` pelos caminhos da tabela e
abaixo, na ordem):

```powershell
$env:PGCLIENTENCODING='UTF8'
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -X -q -v ON_ERROR_STOP=1 `
  -U postgres -h 127.0.0.1 -p 55492 -d attr_preflight -1 -f $file
```

| Suíte SQL executada com `psql -f` no banco `attr_preflight` | Exit | Evidência |
| --- | ---: | --- |
| `supabase/tests/progressao_reversao.sql` | 0 | Sete modos de conclusão/undo anteriores continuam verdes. |
| `supabase/tests/progressao_security.sql` | 0 | ACL e saldo; expectativa de primário alheio atualizada para recusa integral. |
| `supabase/tests/20261019_agenda_conclusao.sql` | 0 | Agenda, arquivo, ledger e undo de A4. |
| `supabase/tests/20261019_attribute_award_receipts.sql` | 0 | Dez IDs iguais, mil IDs, repetição dupla, primário repetido, dono alheio, tipo/UUID inválido, três secundários, crédito válido de 25 + 12 + 12, edição após crédito, redo, D-1, única, semanal, falta de recibo e DML negado para anon/authenticated. |

[Certo] Duas sessões PostgreSQL foram executadas com `Start-Job` e `psql -c`:
a primeira concluiu e reteve a transação por dois segundos, enquanto a segunda
tentou concluir a mesma missão. Saídas: primeira 0, segunda 1
(`Missão já concluída hoje`), perfil `25|1`, um recibo e uma conclusão, atributos
somando `37`. Na corrida de undo, primeira 0, segunda 1
(`Esta missão não foi concluída nesse dia`); perfil, recibo, conclusão e XP de
atributos `0|0|0|0|0`. Uma repetição de conclusão e undo terminou de novo em
zero. As tentativas DML no recibo sob `authenticated` e `anon` foram recusadas
por privilégio; a suíte confere INSERT/UPDATE/DELETE em todas as três tabelas.

[Certo] Em banco `attr_drift`, após a mesma cadeia até A4, alterei apenas o
`search_path` do wrapper para simular drift (exit 0). A nova migration retornou
exit **3** com `ATTRIBUTE_RECEIPT_SOURCE_DRIFT`; a consulta posterior
`to_regclass('private.mission_attribute_receipts') IS NULL` retornou `t`, exit
0. Isto confirma rollback do preflight. A edição artificial ocorreu só nesse
banco local.

## Limites e próxima verificação

[Certo] Em 19/10/2026, segunda-feira, D-1 é domingo e cai em outra semana ISO.
A suíte real cobre ambos os dias e os dois marcos semanais. O caso de marco
mantido dentro da **mesma** semana foi exercitado com recibos sintéticos no
helper privado: o primeiro undo preservou 10 XP de marco e o segundo retirou
esse valor do atributo original. Não é prova de fluxo integrado de duas datas
da mesma semana; repetir essa variante em terça a domingo ou com relógio de
teste controlado antes de promoção.

[Certo] `live-authority-schema.json`, capturado em 19/10 às 17:52:50, informa
PostgreSQL 17.6 e `readOnly=true`; é um snapshot de ACL/schema anterior a esta
cadeia. A fixture local usa Auth/auxiliares reduzidos, não reproduz PostgREST,
todos os triggers, roles transitivas ou dados históricos do Primary. Confirmar
hashes de A4, grants/SET ROLE, RLS, constraints e aplicação da cadeia no
ambiente de integração antes de qualquer publicação. Este documento é relato
autoral e não aprovação independente.

[Certo] Teardown local: `pg_ctl -D <cluster> -m fast -t 30 -w stop` exit 0;
`pg_ctl status` exit 3 (`no server running`);
`Get-NetTCPConnection -LocalPort 55492 -State Listen` retornou 0 listeners.
`PG_VERSION` permaneceu no diretório do cluster. Nenhum diretório PostgreSQL
foi removido.
