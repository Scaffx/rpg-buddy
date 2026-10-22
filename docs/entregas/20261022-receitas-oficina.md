# Receitas de boss e oficina — 2026-10-22

## Identidade e escopo

- Base congelada: `37d9f9f6b6d9b310382b9a650a820cdb06b42344` (`origin/main`, PR70).
- Commit desta frente: `a1b0ab322d3bdbde687e0650a4340468a6a4980e`.
- Worktree: `Scaffx/rpg-receitas-oficina-20261022`.
- Migration: `20261022022416_boss_recipes_crafting_salvage.sql`, criada com `npx --yes supabase migration new boss_recipes_crafting_salvage`. Deve entrar antes da migration de Baús `20261022022726` e antes da Economia `20261022022614` pela ordem lexical real; o coordenador confirma os nomes finais dessas duas frentes.
- Arquivos: `src/hooks/useCrafting.ts`, `src/components/CraftingPanel.tsx`, a migration e os quatro testes/harness em `supabase/tests/20261022_crafting_*`.
- Sem push, merge, deploy, aplicação remota ou alteração de `sync_auto_adventure`, `ShopPage`, `BossPage`, hooks compartilhados ou tipos gerados.

## Contrato e autoridade

- `app_private.credit_adventure_material(uuid,text,integer,text,uuid) -> jsonb`: materiais `scrap`, `normal`, `desert`, `water`, `ice`, `fire`; quantidade positiva até 1000; recibo global `(source,source_id,material)` com conflito se usuário ou valor mudar; `ok`, `replayed`, `quantity`. Sem `EXECUTE` para `anon`/`authenticated`. Baús pode chamar como função privada depois desta migration.
- Trigger privado `AFTER UPDATE OF status` em `app_private.adventure_battles`, somente `fighting -> won` de boss. O battle protegido fornece usuário, etapa, classe e `ends_at`. Receitas são únicas por `(user_id,stage)`; um primeiro replay após rollout também pode desbloquear. Um evento sem desbloqueio nem material não grava recibo vazio.
- Material de boss: 2 `scrap` e 1 essência do reino, no máximo uma concessão por usuário por janela UTC de 30 minutos derivada de `ends_at`; `boss_material_windows` e recibos privados sobrevivem à limpeza de battles. Primeiro desbloqueio independe da janela. A ordem de locks é perfil antes de saldo, materiais e inventário.
- `public.get_crafting_state()` só usa `auth.uid()`, retorna saldos, últimas 30 receitas desbloqueadas, total, duplicados elegíveis e recibos recentes. `public.craft_boss_recipe(recipe_id,request_id)` consome ouro, sucata e essência e entrega item numa transação; `public.salvage_inventory_duplicate(inventory_id,quantity,request_id)` conserva uma cópia não equipada e retorna apenas uma sucata por unidade. Os dois usam request UUID para replay sem cobrança repetida. Falhas fazem rollback sem débito parcial.
- A classe da vitória é o snapshot do battle. `aprendiz` e `clerico` mapeiam para receita `novato`; `get_crafting_state` expõe classe real e `craft_class` para o painel. Craft exige nível de rotina da faixa, calculado como `min(400,max(5,stage/2))`; a rotina de equipar existente mantém a checagem de `game_items.level_required`, cuja definição exata é preflight.
- Preço provisório por receita: `min(72000,24000+1000*(stage/10-1))` ouro, 6–100 sucatas e 1–5 essências. O catálogo é privado e ajustável após simulação integrada. Desmontagem nunca retorna ouro ou essência; custa mais sucata para fabricar do que qualquer devolução por unidade.
- Item fabricado é raro/épico e tem `shop_price=NULL`, `boss_drop_level=-1`. O sentinel o exclui da compra e forrageio existentes (`IS NULL`), do saque comum da aventura (raridade `comum`) e do resolver legado de boss (match com nível positivo). A migration revoga DML cliente em `game_items`, mas preserva SELECT e todo inventário adquirido.

## Transição histórica

- A migration conserva integralmente `public.user_crafting_materials`, mas revoga escrita cliente e não usa seu saldo no novo craft: era client-writable, portanto não fornece prova de aquisição. Direitos de boss legados em `legacy_boss_unlocks` continuam intactos para seus usos existentes; não são convertidos em etapa/classe imaginada.
- Battles privados `won/boss` retidos são backfill de receita, sem prêmio retroativo de material. Leitura remota somente em 2026-10-22 indicou **zero** battles privados de boss vencidos retidos; assim, no projeto atual o backfill não concederia receitas. A primeira vitória protegida observada após rollout, inclusive replay de boss antigo, concede a receita da etapa.

## Evidência PG17 local

- Cluster isolado `C:\Users\Murillo\AppData\Local\Temp\rpg-crafting-pg17-20261022\data`, `127.0.0.1:55432`, banco UTF8 `crafting_final_pass`; log `server.log` no mesmo diretório. Fixture reduzida `supabase/tests/20261022_crafting_fixture.sql` com roles, RLS, grants, 4 identidades, perfil, saldo, catálogo, inventário, battle privado e vitória histórica.
- `20261022_crafting_prepare_live_source.ps1` instalou do snapshot vivo as definições exatas de `sync_auto_adventure`, `hero_class_key` e `set_inventory_equipped`, além de `class_path_matches` da migration anterior. Hashes conferidos: `ef8da5af1aa65460a92f160df438462b`, `da6e71eb8c5a2087a1cd4296a5418652`, `883c77c3a430855102403124f67c790d`, `ba16fefce62bc1a6d06c30ef32c40813`.
- Saídas finais, todas exit 0: fixture, migration `20261022022416`, `CRAFTING_ASSERTIONS_PASSED`, `CRAFTING_CONCURRENCY_ASSERTIONS_PASSED`. Cobertura: histórico sem material fabricado, primeiro boss/replay, janela de material, aprendiz/clérigo, nível insuficiente, insuficiência sem débito parcial, replay de craft/salvage, cross-owner, equipado não desmontável, quantidade, saldos, inventário, ledger e XP invariável.
- ACL local: chamadas de `anon` a leitura/craft e chamadas autenticadas a helper privado, tabela privada, escrita no material legado e escrita no catálogo foram rejeitadas com exit 1. O próprio RPC autenticado só retornou dados da identidade ativa (`user2: recipe_count=0`). Dois crafts paralelos com o mesmo request debitaram uma vez; dois requests diferentes debitaram duas vezes sem alterar XP.
- Drift negativo: fonte `sync` no-op e grant de `UPDATE` cliente em `adventure_battles` fizeram a migration falhar com `CRAFT_SOURCE_OR_ACL_DRIFT`, exit 3, e zero objetos parciais. Guard também verifica corpo/owner de classe, ancestralidade e equipar e ausência de trigger prévio no battle.
- Benchmark sintético na mesma instância, apenas `UPDATE` e trigger em fixture reduzida: 3.300 vitórias inéditas em 88 ms com trigger desativado e 533 ms com trigger ativo; 3.300 repetições na mesma janela em 132 ms e zero recibos adicionais. O catálogo apresentou 3.300 direitos e a leitura limitou a 30 receitas em 109 ms. Esses números não substituem benchmark de 24h do `sync` integrado.
- Teardown: `pg_ctl stop -m fast -w` exit 0; `pg_isready -h 127.0.0.1 -p 55432` exit 2, sem resposta. Diretório, bancos e logs foram preservados.

## Frontend e limites

- `npx vite build` exit 0. `npx eslint src/hooks/useCrafting.ts src/components/CraftingPanel.tsx` exit 0. `npx tsc --noEmit -p tsconfig.app.json` ainda tem os 44 diagnósticos conhecidos do baseline, zero em arquivos desta frente. `git diff --cached --check` exit 0.
- O painel fornece erro persistente para string, `Error` e objeto PostgREST, estado vazio, custo/materiais, origem e frequência de recursos, nível e classe requeridos, recibos recentes e idempotência com request UUID estável até sucesso. O coordenador monta o componente na página; o build isolado não prova esse fluxo montado.
- Não houve teste com gateway/PostgREST autenticado, ambiente publicado, dados de produção migrados ou composição com migrations Economia/Baús. O catálogo usa preços provisórios e precisa do benchmark integrado de renda/catch-up, da verificação da ordem lexical e do teste de montagem da oficina antes de aprovação de produção. A fixture não reproduz todo o schema nem a execução completa da aventura; ela executa os contratos críticos sobre PG17 com fontes de função hash-pinned.
