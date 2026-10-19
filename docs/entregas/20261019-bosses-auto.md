# C4 — Bosses identificados na aventura automática

## Resultado e escopo

[Certo] Base congelada `2f85bb82367dad21b4a600b609f83f6b6e836fd1`. A corretiva foi criada com `npx --no-install supabase migration new boss_auto_entitlements` (CLI 2.121.0): `supabase/migrations/20261019205224_boss_auto_entitlements.sql`. A migração original `20261019194052_auto_adventure.sql` não foi editada. Os arquivos alterados nesta entrega são essa nova migração, `src/components/AutoAdventure.tsx`, `src/hooks/useAutoAdventure.ts`, `src/test/AutoAdventure.test.tsx` e os três SQLs `src/test/sql/boss_auto_{fixture,assert,concurrent_call}.sql`.

[Certo] `app_private.legacy_boss_unlocks` captura uma vez cada par `(user_id,boss_id)` com `boss_battles.won=true` existente no momento da migração, com `source='TRANSICAO'`. Um lock de tabela protege a janela de captura e fechamento de permissões na mesma transação. A tabela fica privada; trigger recusa novas inserções, alterações e exclusões diretas, mas permite a exclusão em cascata quando a conta ou o boss deixa de existir. Isso preserva o direito associado a uma linha antiga; **não certifica que o combate antigo foi legítimo**, pois havia escrita direta e resultado declarado pelo cliente.

[Certo] Novos direitos da loja vêm apenas de `adventure_encounters` com `won=true`, `kind='boss'` e o `boss_id` exato do pet. A aventura resolve o boss no servidor a cada etapa múltipla de 10, usando os regulares (`is_world_event=false`) ordenados por `(level,id)` e índice cíclico `((stage/10-1) % count)`. `boss_id` é gravado no encontro protegido e um check `NOT VALID` exige identidade nas novas linhas, mantendo encontros anteriores sem ID. A vitória também adiciona uma linha ao contador histórico `boss_battles` se ainda não houver vitória desse par. Trigger nesse ledger rejeita qualquer nova vitória sem encontro automático vencedor correspondente, inclusive inserção por `service_role`; derrotas não contam.

[Certo] `get_pet_catalog()` e `buy_pet(text)` chamam o mesmo predicado privado para o mesmo usuário e boss. O catálogo exibe `unlocked` e `owned`; a compra lê esse mesmo direito antes de travar saldo, conferir posse, deduzir ouro e criar o pet numa transação. A constraint antiga `UNIQUE(user_id,origin)` impedia uma segunda compra `origin='shop'`; agora índices parciais preservam uma escolha por origem fora da loja e permitem um exemplar por `companion_type` na loja. A compra continua `SECURITY DEFINER`, permitindo que o trigger de elegibilidade para forrageio da frente I reconheça o novo pet da loja.

[Certo] `authenticated` e `anon` perdem DML de `boss_battles`, `bosses` e `pet_catalog`; a política antiga de INSERT em `boss_battles` sai. `authenticated` perde EXECUTE em `resolve_boss_battle(uuid,boolean,integer)`, que aceitava `p_won` do cliente. A RPC `sync_auto_adventure()` continua sem argumentos de identidade, etapa, resultado ou recompensa. O cliente apenas consulta o snapshot. Não houve escrita remota, deploy, push ou merge.

## Mapeamento e calibração

[Certo] Leitura **somente SELECT** no Supabase Primary `jfnospjxdkelxlhcwuia` em 19/10/2026 encontrou 57 bosses regulares, sete pets com `unlock_boss_id`, `authenticated` com grants de INSERT/UPDATE em `boss_battles`, `bosses` e `pet_catalog`, apenas políticas SELECT nos dois catálogos, `resolve_boss_battle` executável por `authenticated`, e `companions_user_id_origin_key`. Não havia trigger de usuário em `boss_battles` nessa leitura. As definições vivas de `buy_pet`/`get_pet_catalog` ainda consultavam `boss_battles.won`; esta migração não foi aplicada ao Primary.

[Certo] Na mesma leitura, `authenticated` não podia fazer `SET ROLE` para outro papel, inclusive `postgres` ou `service_role`; ambos os últimos têm `BYPASSRLS`, mas ficaram fora do fecho de autoridade do cliente. Isso não substitui a verificação após deploy.

| Etapa no catálogo vivo | Boss | Pet | Poder inimigo novo |
|---:|---|---|---:|
| 10 / 20 / 30 | Goblin Feroz / Lobo Cinzento / Orc Selvagem | — | 45 / 60 / 75 |
| 200 | Leviatã Primitivo | `mini_leviata` | 330 |
| 230 | Wyvern Relâmpago | `mini_relampago` | 375 |
| 240 | Necromante Eterno | `mini_necromante` | 390 |
| 270 | Dragão Sombrio | `mini_dragao_sombrio` | 435 |
| 290 | Kraken Abissal | `mini_kraken` | 465 |
| 320 | Wyrm de Gelo Eterno | `mini_wyrm_gelo` | 510 |
| 330 | Demônio da Fome | `mini_demonio_fome` | 525 |
| 570 / 580 | Chronos, Deus do Tempo / Goblin Feroz (ciclo) | — | 885 / 900 |

[Certo] Normal passa a `min(880,20+floor(1.5*stage))`, boss a `min(900,30+floor(1.5*stage))`. O cálculo de poder do herói, inclusive classe atual, atributos e equipamento, foi copiado sem alteração da migração original. Cadência 30 minutos, recuperação de 24 horas/48 ticks, teto de 120 ouro e dois itens por dia permanecem. Nenhuma nova escrita em `profiles.total_xp`, `profiles.level` ou `attributes` foi introduzida. O contador de boss é uma conquista de jogo, sem XP de rotina.

[Certo] No catálogo vivo, Foice do Ceifador (nível 50, ATK 65, sintonia) e Amuleto da Eternidade (nível 48, ATK 15, DEF 15, sintonia), combinados com nível 50 e Força treinada no nível 23, projetam poder 544 pela fórmula da aventura. O fixture reproduz esses bônus e vence os sete bosses de pet até o poder inimigo 525, sem payload de atributos do cliente. [Provável] A obtenção efetiva desses itens e desse treino por um usuário específico depende dos caminhos de progressão e inventário em produção; o teste prova a aritmética e a autorização local, não a disponibilidade de itens numa conta real. Para o fim do catálogo, o fixture usa equipamento **futuro hipotético** até os tetos já previstos no SQL e prova poder 990 contra Chronos 885 e ciclo 900. Não afirmo que o equipamento atual de produção alcance Chronos.

## Snapshot e UI

[Certo] O snapshot inclui `boss:{stage,id,name,icon}` para o próximo múltiplo de 10 e `boss_wins_credited` para invalidar o cache da loja após uma vitória nova, mesmo quando o boss sai da lista dos oito encontros recentes. Cada encontro novo e `last_result` incluem `boss_id`, `boss_name`, `boss_icon`; campos podem ser nulos em encontro normal ou histórico sem identidade. A UI mostra nome/ícone do boss real e o personagem do usuário pelo avatar existente ou `CharacterSprite`, com nome e classe atual. A animação adicional usa `motion-safe` e o sprite interno recebe `motion-reduce`.

[Certo] Chaves novas de i18n para o integrador, que possui os locales: `app.autoAdventure.heroFallback` = `Aventureiro`; `app.autoAdventure.normalEnemy` = `Inimigo da etapa {{stage}}`; `app.autoAdventure.unknownBoss` = `Chefe da etapa {{stage}}` (fallback antes da migração); `app.autoAdventure.nextBoss` = `Próximo chefe: {{name}} (etapa {{stage}})`. Nomes/ícones de bosses são dados do catálogo e não exigem tradução de nome. O arquivo `src/integrations/supabase/types.ts` também pertence ao integrador. `useShopPets` ainda usa cache `['pet_catalog']` sem usuário e `useBuyPet` não invalida essa chave após compra; o integrador foi avisado para ajustar esses dois pontos antes de composição.

## Verificação e limites

[Certo] PostgreSQL 17 local isolado em `127.0.0.1:55437`, cluster `%TEMP%\rpg_boss_auto_c4_ctx12ee9f`, banco final `boss_auto_c4l`. Sequência abaixo retornou exit 0 em cada arquivo, seguida de `boss auto assertions passed`:

[Certo] SHA-256 da migração original intacta: `D02A7BA2F0EB39108C20AEE23E775FC174A5B637E0C07D4D1F9941C84491D6A3`; da corretiva testada: `2B6C71DD4F005540B562E7D7E20F9348838E8B9F415F77541FAF861628476F82`; do SQL de assertions: `A100F5842DDEB1EA674438EE17C57CEA6622809643092FE2F116E56A1A26AE20`. As duas últimas diferem dos arquivos executados apenas pela remoção de uma linha vazia final.

```powershell
$pg='C:\Program Files\PostgreSQL\17\bin'
$p=@('-X','-q','-t','-A','-v','ON_ERROR_STOP=1','-U','postgres','-h','127.0.0.1','-p','55437','-d','boss_auto_c4l')
& "$pg\psql.exe" @p -f src/test/sql/auto_adventure_fixture.sql
& "$pg\psql.exe" @p -f supabase/migrations/20261019194052_auto_adventure.sql
& "$pg\psql.exe" @p -f src/test/sql/boss_auto_fixture.sql
& "$pg\psql.exe" @p -f supabase/migrations/20261019205224_boss_auto_entitlements.sql
& "$pg\psql.exe" @p -f src/test/sql/boss_auto_assert.sql
```

[Certo] Assertions: captura histórica e pet possuído intactos; exclusão de conta em cascata; anon/auth sem DML/EXECUTE antigo; tentativa de vitória falsa mesmo privilegiada rejeitada pelo trigger; IDs 10/20/30; desbloqueio específico e bloqueio de outro pet; compra, segunda compra recusada, dois pets de tipos distintos, saldo e trigger de forrageio modelo I; sete pets nos estágios 200–330; derrota/retry sem duplicação; último boss/ciclo; caps 900/880 e 120 ouro; XP, nível e atributo sem alteração pela aventura. Para concorrência, duas sessões `psql` autenticadas simultâneas sobre a etapa 300 deram exit `0/0`, retornaram `301/301` e deixaram `1` encontro e `1` linha de boss. `src/test/sql/boss_auto_concurrent_call.sql` contém a chamada usada.

```powershell
# Após as assertions, antes do teardown, no mesmo banco local:
& "$pg\psql.exe" @p -c "UPDATE public.adventure_state SET stage=300,attempt=0,last_tick_at=now()-interval '30 minutes' WHERE user_id='22222222-2222-2222-2222-222222222222'"
$call=(Resolve-Path 'src/test/sql/boss_auto_concurrent_call.sql').Path
$args="-X -q -t -A -v ON_ERROR_STOP=1 -U postgres -h 127.0.0.1 -p 55437 -d boss_auto_c4l -f `"$call`""
$a=Start-Process -FilePath "$pg\psql.exe" -ArgumentList $args -WindowStyle Hidden -PassThru
$b=Start-Process -FilePath "$pg\psql.exe" -ArgumentList $args -WindowStyle Hidden -PassThru
$a.WaitForExit(); $b.WaitForExit()
"exits=$($a.ExitCode),$($b.ExitCode)"
& "$pg\psql.exe" @p -c "SELECT (SELECT count(*) FROM public.adventure_encounters WHERE user_id='22222222-2222-2222-2222-222222222222' AND stage=300),(SELECT count(*) FROM public.boss_battles WHERE user_id='22222222-2222-2222-2222-222222222222' AND boss_id='00000000-0000-0000-0000-000000000030' AND won)"
```

[Certo] `node_modules/.bin/vitest.cmd run src/test/AutoAdventure.test.tsx`: 3/3 testes, exit 0, incluindo seis nomes de encontros e identidade do personagem. `npm run build`: exit 0; avisos preexistentes de `??` em `PortalEventPage` e chunk grande. `tsc --noEmit -p tsconfig.app.json --pretty false`: exit 2, 53 erros preexistentes, zero ocorrências em `AutoAdventure`/`useAutoAdventure`. `git diff --check`: exit 0. O fixture é reduzido e reproduz o trigger de forrageio relevante da frente I, não executa a migração I inteira nem reproduz todos os grants, RLS, triggers ou dados do Primary. Não houve teste de UI com sessão real autenticada nem SQL remoto de escrita.

[Certo] Teardown: `pg_ctl.exe -D %TEMP%\rpg_boss_auto_c4_ctx12ee9f -m fast -w stop` exit 0; `pg_isready.exe -h 127.0.0.1 -p 55437` exit 2 (`no response`). Cluster e bancos locais foram preservados em `%TEMP%`, com servidor parado; nenhum diretório foi removido.

[Provável] Integração deve aplicar a migração I de inventário (`20261019190000`), depois a aventura original (`20261019194052`), depois esta corretiva (`20261019205224`) em um ambiente de ensaio com schema real, comparar as definições e ACL vivas, e executar compra e forrageio ponta a ponta antes de publicar. O balanceamento de 30 minutos/24 horas, 120 ouro/2 itens e os tetos de poder são ponto inicial de produto, não decisão humana definitiva.

[Certo] A Edge legada `processar_turno` ainda tenta inserir vitórias em `boss_battles` para combate manual. O novo trigger recusa esse write sem encontro automático correspondente; o solo manual já saiu da UI, mas qualquer outro modo que reuse essa Edge merece smoke na integração. Nenhum código da Edge foi alterado nesta task. Uma vitória declarada ali não libera pet novo, mesmo se algum serviço ignorar o erro da inserção.
