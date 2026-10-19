# Alcance do catálogo C4 pela aventura atual — 19/10/2026

## Resultado

[Certo] Base desta correção: `291a4e129168adef91d20ebded06c234fb46b807` em `Scaffx/rpg-aventura-20261019`. A migration nova foi criada com `npx --no-install supabase migration new auto_adventure_reachable_catalog` (CLI `2.121.0`): `supabase/migrations/20261019211310_auto_adventure_reachable_catalog.sql`. Ela substitui somente a atribuição de `v_enemy` em `app_private.sync_auto_adventure()` após conferir a definição C4 esperada. Se a definição divergir, falha com `22023` em vez de alterar uma função desconhecida. As migrations Aventura `20261019194052` e C4 `20261019205224` não foram editadas.

[Certo] O novo poder inimigo é normal `min(380,20+floor(1.5*stage))`, chefe `min(400,30+floor(1.5*stage))`. O chefe continua em cada décima etapa, com `boss_id` do catálogo regular ordenado por `(level,id)` e ciclo após o 57º. Poder do herói, direitos históricos, compra, cadência de 30 minutos, catch-up 24 horas/48 ticks, tetos diários de 120 ouro/2 itens, fórmulas de XP/atributos por rotina e recompensas não mudam. Os limites 380/400 são decisão de calibração para este aceite, não valores exigidos pelo usuário final. Não há expansão de raridade ou drops.

## Construção de um perfil alcançável

[Certo] A curva `get_level_from_xp_v2` em `20260531002000_complete_mission_rpc.sql` e `src/lib/progression.ts` mapeia `1.176.000` XP acumulado para nível 50 e `252.000` XP para nível 28. Escritores de conclusão de rotina creditam XP ao perfil e XP ao atributo primário da missão, além de XP secundário quando configurado; veja `20260821120000_marcacao_retroativa_d1.sql`. Por isso, `total_xp=1.176.000`, nível 50, e Força com `xp=252.000`, nível 28, são valores coerentes com a progressão atual: o XP de Força é parte do XP total, sem XP concedido pelo combate da aventura.

[Certo] Para Guerreiro, Força 28 fornece `6*(28-1)=162` no ramo físico e `floor(8*(28-1)/10)=21` na parcela compartilhada, total 183, limitado a 180 pela fórmula C4. Sem item equipado: `70 + 3*50 + 180 = 400`. A fixture do novo aceite cria um usuário limpo com esse XP/atributo e inventário vazio. Os até dois itens comuns ganhos pela própria aventura entram como `equipped=false`; o teste confirma que nenhum equipamento participa do poder 400. A fixture antiga C4 com Foice/Amuleto e equipamento futuro de poder 990 permanece apenas como histórico da prova anterior; não é evidência de obtenção real para este aceite.

[Provável] Um usuário pode chegar a essa distribuição ao completar rotinas suficientes com Força como atributo primário ou secundário. O teste constrói o estado final consistente com a curva e o escritor de rotina, mas não simula anos de uso, frequência humana, uma conta de produção nem a disponibilidade real dos itens da prova antiga. A duração da progressão não foi medida.

## Cobertura SQL local

[Certo] PostgreSQL 17 isolado em `127.0.0.1:55439`, cluster `%TEMP%\rpg_catalog_reach_task6e55_20261019`, banco final `catalog_reach_final_task6e55`. A fixture reduzida C4 modela auth por GUC, 57 chefes ordenados e sete pets; não é cópia integral do Primary. A sequência abaixo teve exit `0` em cada passo. As assertions C4 antigas rodaram **antes** da nova migration, para manter sua prova hipotética como histórico distinto. Depois rodou o aceite novo com usuário sem equipamento adicional.

```powershell
$pg='C:\Program Files\PostgreSQL\17\bin'
$data=Join-Path $env:TEMP 'rpg_catalog_reach_task6e55_20261019'
& "$pg\initdb.exe" -D $data -U postgres -A trust --encoding=UTF8 --no-instructions
& "$pg\pg_ctl.exe" -D $data -o '-h 127.0.0.1 -p 55439' -l (Join-Path $data 'postgres.log') -w start
& "$pg\createdb.exe" -U postgres -h 127.0.0.1 -p 55439 -E UTF8 -T template0 catalog_reach_final_task6e55
$p=@('-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-h','127.0.0.1','-p','55439','-d','catalog_reach_final_task6e55')
& "$pg\psql.exe" @p -f src/test/sql/auto_adventure_fixture.sql
& "$pg\psql.exe" @p -f supabase/migrations/20261019194052_auto_adventure.sql
& "$pg\psql.exe" @p -f src/test/sql/boss_auto_fixture.sql
& "$pg\psql.exe" @p -f supabase/migrations/20261019205224_boss_auto_entitlements.sql
& "$pg\psql.exe" @p -f src/test/sql/boss_auto_assert.sql
& "$pg\psql.exe" @p -f supabase/migrations/20261019211310_auto_adventure_reachable_catalog.sql
& "$pg\psql.exe" @p -f src/test/sql/boss_auto_reachable_assert.sql
```

[Certo] O novo SQL testou as 57 etapas de chefe `10..570` sob a RPC autenticada, verificando vitória, `boss_id` exato, 57 registros do contador e os sete desbloqueios de pet. As etapas 10/20/30 preservaram IDs 1/2/3 e poderes 45/60/75. Chronos, ID 57 em 570, exigiu 400 e foi vencido com 400. O ciclo 580 retornou ao ID 1 com um encontro e sem duplicar contador. O herói fraco de nível 1, poder 73, perdeu a etapa 30 contra 75; replay imediato não criou outro encontro nem crédito. As etapas 1000/1001 ficaram em 400/380, ainda vencíveis sem equipamento. O estado acumulou no máximo 120 ouro e dois itens no dia; XP, nível e atributo permaneceram invariáveis nas vitórias, derrota, ciclo e etapas limitadas.

[Certo] Concorrência: após preparar a etapa 590 para o mesmo herói sem equipamento, duas sessões `psql` simultâneas executaram `src/test/sql/boss_auto_reachable_concurrent_call.sql` com exit `0/0`; ambas receberam etapa 591. `src/test/sql/boss_auto_reachable_concurrent_assert.sql` teve exit `0`: exatamente um encontro em 590, 57 entradas no contador (o boss do ciclo já tinha sido creditado), XP e nível de Força inalterados. A preparação e a assertion também tiveram exit `0`.

```powershell
& "$pg\psql.exe" @p -c "UPDATE public.adventure_state SET stage=590,attempt=0,last_tick_at=now()-interval '30 minutes' WHERE user_id='44444444-4444-4444-4444-444444444444'"
$call=(Resolve-Path 'src/test/sql/boss_auto_reachable_concurrent_call.sql').Path
$args="-X -q -t -A -v ON_ERROR_STOP=1 -U postgres -h 127.0.0.1 -p 55439 -d catalog_reach_final_task6e55 -f `"$call`""
$a=Start-Process -FilePath "$pg\psql.exe" -ArgumentList $args -WindowStyle Hidden -PassThru
$b=Start-Process -FilePath "$pg\psql.exe" -ArgumentList $args -WindowStyle Hidden -PassThru
$a.WaitForExit(); $b.WaitForExit()
& "$pg\psql.exe" @p -f src/test/sql/boss_auto_reachable_concurrent_assert.sql
```

[Certo] A migration original tem SHA-256 `D02A7BA2F0EB39108C20AEE23E775FC174A5B637E0C07D4D1F9941C84491D6A3`, a C4 tem `2B6C71DD4F005540B562E7D7E20F9348838E8B9F415F77541FAF861628476F82`, e a nova migration testada tem `BE47C71F1D7DF305EF493BE2FC6B115EC50071881CAECA8C9F699E1B9873BFDB`. O `git diff --cached --check` teve exit `0`. Nenhum arquivo TypeScript/frontend foi alterado; build não foi repetido. Logs da rodada final e das duas sessões concorrentes ficaram em `%TEMP%\rpg_catalog_reach_task6e55_20261019\final_*`.

## Limites e integração

[Certo] Nenhum SQL foi aplicado remotamente; não houve push, deploy ou merge. O teste é local e reduzido, sem todos os grants, triggers, dados ou as migrations completas da frente I. A migration I foi renomeada pelo integrador para `20261019210026_inventory_authorship.sql`; a nova migration de calibração tem timestamp posterior (`20261019211310`). A composição cronológica final com I e o teste num schema completo pertencem ao integrador. O corpo Edge local e o publicado não foram comparados nesta correção; a possível divergência fica explícita e fora do escopo.

[Certo] Teardown: `pg_ctl.exe -D $data -m fast -w stop` teve exit `0`; `pg_isready.exe -h 127.0.0.1 -p 55439` teve exit `2` (`no response`). O cluster, bancos e logs foram preservados no diretório temporário, sem serviço ativo nem remoção recursiva.
