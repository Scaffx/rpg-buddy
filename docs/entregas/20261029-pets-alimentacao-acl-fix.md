# Pets: correção de ACL herdada — ensaio local PG17

**[Certo] A migração corrigida rejeita o cenário que apagava o catálogo privado no clone anterior.** O SQL continua inédito e não está liberado para Primary. Bug Tracker conhecido: `408812ac-94d8-8156-98c9-c64db469109d`; nenhuma atualização remota foi feita neste despacho.

## Fonte congelada e escopo

- [Certo] Checkout `rpg-auth-foco-20261026`, branch `Scaffx/rpg-hordas-continuas-20261028`, HEAD `c13d5ab3da2af18987ca2f08cd5793d4f8a10c00`. A fonte original tinha LF SHA256 `BEBAB5937A459EB1D24589C8E14D5AF5AAD207ED52FE82619D62C91B52876927`; o coordenador preservou sua cópia congelada em `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/auth-incidente-20261029/pet-care-before-review.sql`, com o mesmo hash recalculado neste despacho.
- [Certo] Fonte corrigida: `supabase/migrations/20261029120000_pet_food_and_care.sql`, LF SHA256 **`DBCF6D117E0A33931641C48561D99035DAC6F85E4B501CCDA2726024A432AE7A`**. O runner exige esse hash e os quatro hashes de predecessores; `source-manifest.txt` os registra. Foram alterados somente essa migração, `supabase/tests/pet_care_20261029/` e este relatório.
- [Certo] O preflight exige execução como `postgres` e rejeita privilégios padrão de tabelas privadas e funções novas concedidos a `PUBLIC`, `anon`, `authenticated` ou qualquer papel alcançável por membership direto/aninhado. Mantém a guarda anterior de escrita padrão em `public`. Após `REVOKE`/`GRANT`, o postflight consulta privilégios efetivos para `anon`, `authenticated` e `service_role` nas cinco tabelas privadas (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, `MAINTAIN`) e nas quatro funções privadas (`EXECUTE`), além de `PUBLIC` e das cinco funções públicas. Qualquer exposição aborta a transação. RLS, Auth, recibos, história, economia e cálculo de participação não foram alterados.

## Prova do defeito e da rejeição

| Caso | Evidência executada |
|---|---|
| Fonte antiga | `C:/Users/Murillo/AppData/Local/Temp/petcare-independent-acl-full-20261029.log`: default `TRUNCATE` para papel herdado de `authenticated`, `USAGE` no esquema, migração com `COMMIT`; `has_table_privilege` verdadeiro; `SET ROLE authenticated; TRUNCATE app_private.pet_food_catalog` reduziu 13 SKUs a zero. |
| Fonte antiga, função privada | No clone `pet_old_function` do cluster local, `old_inherited_function_setup.sql` concedeu `EXECUTE` padrão em `app_private` a um papel pai de `authenticated`. A cópia antiga da migração fez `COMMIT` (exit 0); `old_inherited_function_assert.sql` confirmou `has_function_privilege` verdadeiro sem grant direto e `SET ROLE authenticated; SELECT app_private.pet_care_snapshot(NULL,clock_timestamp())` retornou `t`. Logs `pet_old_function-{setup,migration,assert}.log`, três exits 0. O cluster foi parado novamente (`pg_ctl` 0, `pg_isready` 2). |
| Fonte corrigida, mesma classe de ataque | `pet_drift_default_table_nested-reject-default_table_nested.log`: exit 3, `PET_CARE_TABLE_OR_DEFAULT_ACL_DRIFT` na linha 96 antes de DDL. `pet_drift_default_table_nested-atomic-default_table_nested.log`: `t` para ausência das cinco tabelas, funções e SKUs novos. O fingerprint de funções/owner/ACL/default ACL/dados antes e depois é idêntico. |
| Outras rotas de ACL | Default direto `TRUNCATE`, `PUBLIC TRUNCATE`, `SELECT` herdado aninhado, `EXECUTE` de função privada direto e herdado aninhado: cinco outros exits 3 pelo mesmo guard, ausência de objetos e fingerprint inalterado. O teste positivo confirma `PET_CARE_TRUNCATE_DENIED_PASS` sob `SET ROLE authenticated` mesmo com `USAGE` no esquema, e catálogo com 13 linhas. |

## Regressão e atomicidade

**[Certo]** O run final completo usou PostgreSQL 17.9 isolado na porta `55946`, diretório `C:/Users/Murillo/AppData/Local/Temp/rpg-pet-care-aclfix-final-20261029/`; logs em `logs/`, dados preservados em `data/`. Comando: `& supabase/tests/pet_care_20261029/verify-local.ps1 -Port 55946 -RunDirectory 'C:/Users/Murillo/AppData/Local/Temp/rpg-pet-care-aclfix-final-20261029'`. Exit do runner 0; `pg_ctl stop -m fast -w` exit 0; `pg_isready` após parada exit 2, sem listener na porta.

**[Certo]** Uma primeira invocação com redirecionamento externo de todo o PowerShell ficou retida logo após `pg_ctl start`, antes de aplicar SQL. O processo e somente o cluster criado nesse ensaio foram parados (`pg_ctl stop` 0; `pg_isready` 2); o diretório `rpg-pet-care-aclfix-20261029` foi preservado. O run íntegro acima usou diretório novo sem esse redirecionamento.

- [Certo] Migração positiva, baseline, compra/recibo, falta de estoque, preço/saldo, batalha e snapshot: exits 0; notices `PET_CARE_EXISTING_BASELINE_PASS`, `PET_CARE_FUNCTIONAL_PASS`, `PET_CARE_BATTLE_PASS`.
- [Certo] ACL e identidade: exit 0; `PET_CARE_AUTH_OWNERSHIP_PASS`, `PET_CARE_TRUNCATE_DENIED_PASS`. O teste cobre ACL efetiva, `PUBLIC`, RLS e posse.
- [Certo] Concorrência de compra, cuidado e liquidação: seis processos exit 0; `PET_CARE_CONCURRENCY_PASS`.
- [Certo] Wrappers retidos de poções HP/MP/offline e pet/horda: exits 0; `AUTO_POTIONS_*_PASS`, `PET_WRAPPER_PASS`, `PET_SNAPSHOT_IMMUTABLE_PASS`. Benchmark retido de 30 contas sem pets: exit 0, p95 `8.914 ms`.
- [Certo] Drifts de corpo, ACL direta, overload, default ACL em `public`, owner, default ACL de tabela/função direto e herdado, `PUBLIC` e `SELECT` herdado: onze rejeições exit 3. Membership `anon → authenticated`: mais uma rejeição exit 3 e membership restaurado. Em todos, nenhuma tabela/função/SKU novo persistiu; os onze casos com fingerprint antes/depois o mantiveram idêntico.

## Pendências para outro dono e portões

**[Certo]** O limite de 4096 recibos continua um P2 real: o probe independente `C:/Users/Murillo/AppData/Local/Temp/petcare-independent-cap-20261029.sql` reproduziu 4097 vencimentos e 4097 unidades, `SQLSTATE 54000` em leitura/compra/cuidado, estoque 4097 e zero recibos após rollback. Não há recuperação comum nesse cenário extremo (~11,2 anos); resolver exige contrato explícito de liquidação em lotes com progresso durável e prova de participação histórica. Este patch de ACL não deve pular consumo/débito nem atribuir recompensa retroativa.

**[Certo]** O clone reduzido omite `20261029054922_mission_d1_server_start_and_weekly_close.sql` por ausência de `public.complete_mission(uuid,date)` no fixture e repõe somente a propriedade RLS conhecida de `gold_history`. O teste local não prova cadeia lexical completa, Primary, Auth/GoTrue/PostgREST ou custo com pets vencidos em 256 lutas/1200 eventos. São necessários cold review independente do hash novo, preflight autorizado do esquema/owner/ACL/membership/default ACL efetivos de Primary, cadeia completa em clone compatível e gates de integração/release antes de publicação. Não houve leitura ou escrita remota, DDL remoto, instalação, commit, push ou deploy neste despacho.
