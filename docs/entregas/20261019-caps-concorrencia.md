# B4 — concessões diárias e ordem de locks (19/10/2026)

## Escopo e decisão

[Certo] Base de código B `e0f39cbf1327bc933a09f5b0eb21600d773583a4`; no momento da execução, HEAD `cd44ef400a20238718ee10c4bf35ba5d33130252` acrescentava somente o relatório independente, não uma mudança da migration B congelada. A migration nova foi gerada por `npx --yes supabase migration new mission_priority_paid_cap_lock_order` (CLI 2.121.0, exit 0): `20261019204951_mission_priority_paid_cap_lock_order.sql`, posterior a B `200215`. Não houve SQL remoto, push ou deploy.

[Certo] O `BEFORE STATEMENT` de `missions` adquire `pg_advisory_xact_lock(hashtext(auth.uid()::text), 20261019)` em `INSERT`, `UPDATE` e `DELETE` antes de row locks. O trigger de linha deixou de pedir a trava depois do row lock. A4 usa exatamente a mesma chave antes de `SELECT ... FOR UPDATE` em `complete_mission` e `undo_mission`. Isso remove o ciclo observado pelo auditor (sessão 1 com advisory e esperando linha B; sessão 2 com linha B e esperando advisory) para escrita cliente autenticada.

[Certo] Cada nova marcação `daily_status[day]='completed'` de alta ou média consulta as concessões distintas duráveis do usuário/prioridade/dia antes de gravar. A quinta alta ou nona média gera `MISSION_PRIORITY_PAID_CAP` e a transação inteira reverte. Undo remove o recibo corrente e devolve XP pelo ledger A4, mas conserva a reserva histórica; a mesma missão pode ser concluída de novo após undo sem ocupar uma quinta vaga. Arquivar, excluir, mudar prioridade e editar não inventam uma nova concessão. Missões únicas só reservam `due_date` na transição `completed=false -> true` não arquivada; o arquivo comum `completed=true,status='arquivada'` não reserva nada. Altas legadas acima do teto permanecem no banco e editáveis em campos que não criam vaga.

[Certo] O trigger responde `MISSION_DAILY_STATUS_INVALID` para objeto de status substituído por JSON de outro tipo, `MISSION_COMPLETION_DATE_INVALID` para nova chave `completed` sem data válida, `MISSION_NOT_SCHEDULED:<date>` para nova marcação fora da agenda e `MISSION_NOT_ACTIVE` para nova marcação em linha arquivada/concluída. Chaves históricas inválidas já existentes e não alteradas continuam toleradas. A4 valida estado, janela hoje/D-1 e agenda na RPC antes do pagamento; B4 é a barreira adicional para a cota de concessões. A recompensa base permaneceu 50/25/5 antes dos demais multiplicadores.

## Evidência local

[Certo] PostgreSQL `17.9` local em `127.0.0.1:55463`. `initdb` e `pg_ctl start` exit 0. Cluster preservado em `%TEMP%\rpg-b4-task_5754ae66-20261019`; `pg_ctl stop -m fast -w` exit 0 e `pg_isready` exit 2 (`no response`). Não foi apagado nem movido.

| Execução com `psql -X -v ON_ERROR_STOP=1 -1`, exceto scripts PowerShell indicados | Exit | Resultado |
| --- | ---: | --- |
| `priority_caps_setup.sql` → B200215 → B4 → `priority_caps_corrective_assert.sql` em `b4_min5` | 0 | 4 altas/8 médias, legado intacto, undo simulado com reserva persistente, dias recorrentes e datas únicas distintos, archive/reclassify/delete e payload malformado; `PASS`. |
| `progressao_live_fixture.sql` → A193625 → B200215 → A204003 → B4 → A4 `20261019205347_guard_mission_completion_schedule_and_undo_after_paid_cap.sql` → `priority_caps_corrective_rpc.sql` em `b4_integrated3` | 0 | RPC real local pagou quatro altas de 50 XP, oito médias de 25 XP e doze verdes de 5 XP; a próxima alta/média falhou sem mudar perfil ou estado; undo/redo preservaram saldo e recibos; `PASS`. |
| `priority_caps_corrective_concurrency.ps1 -Port 55463 -Database b4_concurrent3` após setup → B → B4 | 0 | Duas edições de linhas distintas cometeram; quarta concessão concorrente com quinta deu um commit e uma recusa, sem escrita parcial; archive/delete/create/reactivate concorrentes cometeram; sem `40P01`; `PASS`. |
| `priority_caps_corrective_rpc_concurrency.ps1 -Port 55463 -Database b4_integrated3` | 0 | Complete/undo de A concorreu com complete de B; saldo final 50 XP, um recibo corrente, duas reservas históricas; sem `40P01`; `PASS`. |
| `SET ROLE authenticated; UPDATE missions SET title=...` na fixture integrada com grant local de UPDATE | 0 | Trigger de statement executou também como papel `authenticated`. |

[Certo] SHA-256 de B4: `3562859EF81048797C075E4D769D1752A6D6A0BF5114FF7F326E415210EEA9A9`. SHA-256 de A4 testada na outra worktree: `A53EBB707B83150ACB27EF2DC990BDCBC5E5C9FCD2B69E970BE3279E7F818EB3`. SHA-256 da fixture A: `645EDB0DD0553195D278B8B3ADB8D339F7C8F14D881A11D182159F69946CB699`.

## Limites

[Certo] A fixture PG17 modela o schema, helpers neutros e identidade por GUC; não demonstra RLS/ACL/Data API de produção nem prova que a migration foi aplicada remotamente. O smoke de `authenticated` recebeu grant local apenas para exercitar o trigger. Os testes concorrentes usam `READ COMMITTED`, `psql` em processos separados e linhas controladas; não são prova de ausência universal de deadlocks em transações com outros recursos.

[Certo] Escritas privilegiadas com `auth.uid() IS NULL` não entram na trava por usuário, de propósito e de forma explícita no SQL. Operações de manutenção concorrentes devem fornecer contexto autenticado confiável ou rodar isoladas. A tabela histórica B pode conter reservas provenientes de estados legados ambíguos anteriores a B4; sem recibo verificável, removê-las automaticamente poderia reabrir concessões já pagas. B4 conserva essas linhas e não inventa XP retroativo.
