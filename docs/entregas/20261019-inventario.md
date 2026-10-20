# Autoria de inventário e loja — 2026-10-19

## Escopo e evidência

Base desta worktree: `e1e5ede` (acessibilidade já entregue, sem alterações nesta frente). Consulta somente leitura no Primary `jfnospjxdkelxlhcwuia` mostrou `authenticated` com `INSERT`, `UPDATE` e `DELETE` em `public.user_inventory` e policy `Users can insert own inventory` limitada a `auth.uid() = user_id`. Essa igualdade confirma o dono informado, mas não confirma compra, loot, quantidade, bônus ou origem. `user_balance` aceitava `INSERT` do próprio usuário, `add_gold_to_user(uuid,integer)` era executável por `authenticated`, e `charge_for_item(uuid)` tratava preço nulo como zero. Bug Tracker consultado antes da correção; não havia registro equivalente e foi aberto [registro de autoria de inventário](https://app.notion.com/p/3fe812ac94d8814587d6e5132d8b2143), mantido em progresso até integração/deploy.

## Contrato da migration

`supabase/migrations/20261019210026_inventory_authorship.sql` revoga DML direto de inventário, balanço e histórico de ouro de `anon`/`authenticated`, inclusive grants por coluna, e remove as policies antigas de escrita. Revoga a execução pelo cliente de `charge_for_item`, `grant_starter_items` e `add_gold_to_user`; não altera seus corpos ou os privilégios internos de `postgres`/`service_role`. Mantém leitura permitida e as linhas históricas. Funções novas são `SECURITY DEFINER` com `search_path` fixo e `auth.uid()` como identidade:

| RPC | Regra do servidor |
| --- | --- |
| `purchase_game_item(item_id, request_id)` | Consulta catálogo, exige `shop_price > 0`, categoria vendável, item não starter nem drop de chefe; grava recibo único por usuário/request, trava saldo e debita exatamente o preço do catálogo na mesma transação do item e histórico. Replay do mesmo request não debita de novo. |
| `ensure_user_balance()` | Cria somente saldo inicial fixo de 100 se ausente. |
| `claim_inventory_kit(kind)` | Seleciona kit do catálogo pela classe do perfil e concede uma vez; recibos são inicializados de flags históricas. |
| `claim_class_gold_reward()` | Crédito fixo de 50 após validar classe/nível, uma vez por usuário; recibos são inicializados de histórico identificado. |
| `set_inventory_equipped`, `set_inventory_attunement`, `consume_inventory_item` | Exigem posse, quantidade positiva e regras de categoria, nível, slot e sintonia; consumo remove apenas uma carga e decide chance de preservação no servidor. |
| `choose_level3_companion`, `forage_inventory` | Escolha de pet após nível 3, elegibilidade registrada por aquisição de servidor, um forrageio por dia de São Paulo, raridade e item escolhidos no servidor. |

O catálogo vivo possui seis itens não starter com `shop_price = 0`; a RPC e vitrine filtram preço não positivo. Não há regra confiável de preço para distingui-los de brindes, portanto nenhuma compra desses itens foi presumida. `use_scroll(uuid)` e `buy_pet(text)` foram conferidas no Primary como funções `SECURITY DEFINER` de `postgres`; seus writes internos permanecem possíveis após a revogação ao cliente. A função de aventura também precisa ser `SECURITY DEFINER` de papel autorizado ou usar `service_role`; não deve depender de INSERT de `authenticated` em `user_inventory`. A fixture local testa um ledger server-owned e reconciliação idempotente; não reproduz o código real da aventura, que pertence à outra frente.

## Callers e limites de integração

`useInventory`, `useGold`, `useCompanion`, `useForrageio`, `ClassesPage`, `CombatEquipSwap`, `DungeonArena` e o handler desativado de `NpcPage` foram adaptados aos contratos. A vitrine consulta somente itens vendáveis; a compra conserva `request_id` ao repetir uma chamada incerta. A dungeon ainda produz resultado apenas no cliente, portanto não credita materiais e avisa explicitamente. `NPC_LIBERADO=false`; o toggle antigo foi fechado até existir resultado de desafio e reversão validados no servidor. As alterações de XP do commit de Progressão `b0f0dc1` em `NpcPage` foram preservadas. `BossPage` segue sob autoria da Aventura e ainda contém DML direto no checkout base; integrar a adaptação dessa frente antes de aplicar a ACL em produção.

Pets já existentes são mantidos. A migration captura uma vez IDs, donos, tipos e origens de gatos `lvl3_choice` e minis `shop` atuais em ledger privado, como exceção explícita de transição autorizada pelo coordenador. Esse snapshot preserva o direito de forrageio atual, mas não atesta compra; `origin`/tipo histórico era editável por INSERT de `authenticated`. Depois do corte, nenhum novo pet entra no ledger por recalcular esses campos: novos pets elegíveis vindos de `buy_pet` ou `choose_level3_companion` entram somente pelo trigger executado pelo dono privilegiado da função. O limite de um forrageio por usuário/dia permanece no servidor. Nenhum pet, item, ouro ou registro histórico foi apagado ou recalculado.
Afinidade histórica também era editável antes do corte e é preservada como dado legado, portanto pode influenciar a raridade inicial desses pets; o trigger bloqueia novas alterações diretas pelo cliente. Esse risco de transição deve ser revisto com dados de produção na integração.

## Validação e teardown

- PostgreSQL 17.9: `initdb -D .tmp/inventory_pg17_data2 -A trust -U postgres --encoding=UTF8` → exit 0; `pg_ctl -D .tmp/inventory_pg17_data2 -l .tmp/inventory_pg17_2.log -o '-p 55420 -h 127.0.0.1' start` → exit 0. Diretório novo, isolado de `.tmp/inventory_pg17_data`; nenhum `Remove-Item` nem mudança de proteção.
- `psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55420 -U postgres -d inventory_assert7 -f supabase/tests/inventory_authorship.sql` → exit 0, `INVENTORY_AUTHORSHIP_ASSERTIONS_PASSED`. Fixture reduzida com roles `anon`, `authenticated`, `service_role`, `auth.uid()` por claim de sessão e tabelas mínimas. Cobriu INSERT/UPDATE/DELETE forjados, preço/bônus de catálogo, crédito arbitrário, saldo insuficiente, dono alheio, compra/replay, slot e categoria de equipamento, kit, captura de pet antes do corte, novo pet forjado recusado, forrageio e loot de função de servidor. Não é replay integral do schema vivo.
- `powershell -NoProfile -ExecutionPolicy Bypass -File supabase/tests/inventory_authorship_concurrency.ps1 -Port 55420 -Database inventory_assert7` → exit 0, `INVENTORY_CONCURRENCY_ASSERTIONS_PASSED`: duas sessões no mesmo request debitaram uma vez; requests distintos debitaram duas vezes sob lock de saldo. Trigger de atraso de um segundo na fixture força sobreposição.
- `npm run build` → exit 0 (avisos preexistentes em `PortalEventPage` e tamanho de bundle). `npx tsc -p tsconfig.app.json --noEmit` → exit 1 por erros fora dos arquivos desta frente; nenhum diagnóstico nos arquivos alterados. Dependências são junction existente; não houve instalação.
- `pg_ctl -D .tmp/inventory_pg17_data2 stop -m fast` → exit 0. Os dados e logs de teste foram retidos para auditoria; o cluster anterior `.tmp/inventory_pg17_data` foi preservado sem intervenção.

Sem SQL remoto de escrita, deploy, push ou merge. Integração exige comparar a migration da Aventura, os RPCs de códigos/missões e o schema vivo antes do deploy; o teste local só prova o contrato mínimo e a ACL simulada, não o comportamento da API remota nem seus dados de produção.
