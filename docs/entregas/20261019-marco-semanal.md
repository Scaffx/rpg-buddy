# Correções A5: marco semanal e guard de INSERT (19/10/2026)

## Contrato e escopo

[Certo] Base da worktree `987b23126569b065ddb06b14fd27aa568256c34e`. A revisão independente A5 reproduziu dois P2. Em uma semana `target_count=1,max_count=2`, duas conclusões pagavam um marco; após elevar a meta a 2, desfazer a conclusão original revogava o marco; restaurar a meta a 1 e refazer a conclusão deixava `current_count=2,milestone_paid=false` sem recibo, pois o helper exigia igualdade exata. O segundo P2 era `_guard_progression_initial_values()` acessar `NEW.total_xp` no trigger de `attributes`, cujo registro não tem essa coluna. Os scripts originais e saídas foram consultados somente para leitura em `../rpg-prioridades-20261019/docs/audits/atributos-provas/a5-weekly-target-drift.sql/.out.txt` e `a5-attribute-insert-model.sql/.out.txt`.

[Certo] A Supabase CLI 2.121.0 gerou `supabase/migrations/20261019212523_restore_unpaid_weekly_milestone_after_target_edit.sql` por `npx --no-install supabase migration new restore_unpaid_weekly_milestone_after_target_edit` (exit 0). A migration exige o corpo conhecido do helper semanal (`md5(prosrc)=79de81c374d61104c0625b4c4eb8c03d`) e do guard de INSERT (`4f75688bda580c0d8e69dc354701ba18`) antes de qualquer substituição. O helper passa de `v_next_weekly_count = v_m.target_count` para `>=` **somente** na condição que também exige `NOT v_progress.milestone_paid`. Assim, uma nova conclusão elegível pode pagar um marco ainda devido e o wrapper A5 gera o recibo; UPDATE de meta sozinho não paga. O guard usa ramos `IF TG_TABLE_NAME = 'profiles' THEN ... ELSIF ... 'attributes' THEN ...`, mantendo a verificação de base zero/nível um de cada tabela. Não há novo GRANT, campo, recálculo histórico ou alteração de migrations anteriores. Dono, SECURITY DEFINER/INVOKER, `search_path` e EXECUTE das funções foram conferidos após a aplicação.

[Certo] A semântica editável da meta e o undo existente permanecem: a revogação ocorre somente se a contagem cair abaixo da meta atual, e `private.undo_mission_attribute_awards` debita o atributo e delta registrados em `private.mission_attribute_milestones`. A migration não modifica perfil 50/25/5, `max_count`, calendário, janela D-1, locks ou saldos históricos. A criação de atributo com XP zero é possível apenas se o cliente tiver ACL/RLS adequadas; esta migration não concede esse acesso.

## Ambiente e comandos

[Certo] Cluster isolado PostgreSQL **17.9 UTF8**, `127.0.0.1:55498`, diretório preservado `%TEMP%\rpg_weekly_p2_ctx6c432e_55498`. `initdb.exe -D <data> -U postgres -A trust --encoding=UTF8 --no-instructions`, `pg_ctl.exe -D <data> -o '-h 127.0.0.1 -p 55498' -l <data>\postgres.log -w start` e `createdb.exe -U postgres -h 127.0.0.1 -p 55498 -E UTF8 -T template0 weekly_p2_final` tiveram exit 0. O trust foi usado só no listener local descartável. Todos os comandos `psql` seguintes usaram `-X -v ON_ERROR_STOP=1 -U postgres -h 127.0.0.1 -p 55498 -d weekly_p2_final`, `PGCLIENTENCODING=UTF8`; migrations usaram também `-1 -f`.

| Ordem | Arquivo aplicado após `supabase/tests/progressao_live_fixture.sql` | Exit |
| --- | --- | ---: |
| A | `supabase/migrations/20261019193625_progressao_reversao_checklist.sql` | 0 |
| B | `../rpg-prioridades-20261019/supabase/migrations/20261019200215_mission_priority_daily_caps.sql` | 0 |
| A3 | `supabase/migrations/20261019204003_close_forged_xp_buff_and_npc_undo.sql` | 0 |
| B4 | `../rpg-prioridades-20261019/supabase/migrations/20261019204951_mission_priority_paid_cap_lock_order.sql` | 0 |
| A4 | `supabase/migrations/20261019205347_guard_mission_completion_schedule_and_undo_after_paid_cap.sql` | 0 |
| A5 | `supabase/migrations/20261019210221_attribute_award_receipts.sql` | 0 |
| Correção | `supabase/migrations/20261019212523_restore_unpaid_weekly_milestone_after_target_edit.sql` | 0 |

[Certo] A fixture teve exit 0. Os blobs Git de B e B4 lidos da worktree Prioridades foram `e65ba68bc25bbcd480bbe62347f5c3a405cb19ec` e `2c76c8f453435326baeb4571602b6943a54667c6`. O SQL final tem `md5(prosrc)` `e54f3a202d324d8a532af8ae64f77b7b` no helper semanal e `07c1ca667066602d4813536a1c705bec` no guard.

## Aceite local

[Certo] `psql -f supabase/tests/20261019_weekly_target_milestone.sql` saiu 0 e terminou em ROLLBACK. Seu único instrumento de tempo substitui `now() AT TIME ZONE 'America/Sao_Paulo'` por `TIMESTAMP '2026-10-20 12:00:00'` nas definições locais de `complete_mission`, `undo_mission` e `_complete_mission_with_weekly`, dentro da transação. O relógio do PC e as outras funções não mudaram. Chamadas **públicas reais** reproduziram a ordem A5: concluir 19/20 com meta 1/max 2, subir meta 2, desfazer 19 e revogar, restaurar meta 1, refazer 19 no count 2. O marco foi pago uma vez, `milestone_paid=true`, havia exatamente um recibo com atributo/delta coerentes; repetição do mesmo dia foi negada. Edição da meta sozinha não alterou XP/ouro ou criou recibo. Desfazer 20 preservou o marco enquanto count 1; desfazer 19 o revogou, no atributo registrado, restaurando XP de perfil, ouro e todos os atributos ao baseline. O roteiro também reduziu meta 2→1 após count 1, verificou que UPDATE não paga, que conclusão em count 2 paga uma vez apesar do overflow, e que os dois undos restauram o baseline.

[Certo] `psql -f supabase/tests/20261019_attribute_insert_guard.sql` saiu 0 e terminou em ROLLBACK. Seed server-side de Auth criou perfil/atributo em base zero/nível um. No modelo local com `SET ROLE authenticated`, GRANT e RLS controlados dentro da transação, `profiles.total_xp=777`, `attributes.xp=777` e `attributes.level=2` foram rejeitados pela mensagem própria do guard; INSERT de perfil/atributo com base zero/nível um passou. Esse modelo de GRANT/RLS não afirma que o ACL final deve permitir INSERT direto; a migration não altera grants.

| Regressão em `weekly_p2_final`, `psql -f` | Exit |
| --- | ---: |
| `supabase/tests/progressao_reversao.sql` | 0 |
| `supabase/tests/progressao_security.sql` | 0 |
| `supabase/tests/20261019_agenda_conclusao.sql` | 0 |
| `supabase/tests/20261019_attribute_award_receipts.sql` | 0 |

[Certo] Concorrência com duas sessões PostgreSQL e missão semanal válida `target=1,max=2`: a primeira transação concluiu e segurou o lock por 2 s (exit 0); a segunda recebeu `ALREADY_COMPLETED_TODAY` (exit 1). Estado após commit: `current_count=1,milestone_paid=true`, um recibo. `undo_mission` público posterior saiu 0 e deixou `profile.total_xp=0`, `gold=100`, soma de XP dos atributos 0, nenhum recibo. O runner legado `test_progressao_concurrency.py` foi tentado, mas seu seed com `days_of_week=["scheduled"]` falhou em B com `MISSION_SCHEDULE_INVALID` antes de criar concorrência; isso não é um resultado verde daquele runner. O teste alternativo usou configuração semanal válida.

[Certo] Preflight negativo em banco separado `weekly_p2_drift`: fixture + A+B+A3+B4+A4+A5 saíram 0; foi inserido um comentário deliberado no corpo do guard. A migration corretiva com `psql -1 -f` saiu **3**, `INITIAL_PROGRESSION_GUARD_DRIFT`. Após a falha, o helper semanal ainda tinha hash anterior `79de81c374d61104c0625b4c4eb8c03d` e nenhuma comparação `>=`, provando que a transação não aplicou meia correção. Nenhuma escrita remota, push ou deploy.

## Limites e limpeza

[Certo] O fixture local reduz Auth e auxiliares; não valida PostgREST, grants/RLS transitivos ou dados históricos de produção. A cadeia foi testada com B/B4 da worktree Prioridades por hash, sem copiá-las nem editá-las. A migração deliberadamente falha em fonte divergente e precisa ser reconciliada contra a fonte instalada antes de publicação. Revisão independente da nova correção ainda é necessária.

[Certo] Teardown: `pg_ctl.exe -D %TEMP%\rpg_weekly_p2_ctx6c432e_55498 -m fast -t 30 -w stop` exit **0**; `pg_ctl status` exit **3** (`no server running`); `Get-NetTCPConnection -LocalPort 55498 -State Listen` encontrou **0** listeners. `PG_VERSION` e `postgres.log` permanecem no diretório; nenhum cluster ou log foi removido.
