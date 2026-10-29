# Revisão independente de poções automáticas — 29/10/2026

## Escopo congelado

Checkout `rpg-auth-foco-20261026`, branch `Scaffx/rpg-hordas-continuas-20261028`, HEAD `addddcb7a1d0e7a1d919107dd632a75a01bbc22d`. O coordenador congelou a migração, o hook, o painel, a integração AutoAdventure, os tipos RPC e os campos de apresentação de MP. Esta revisão alterou somente este relatório e `review_*.sql` em `supabase/tests/auto_potions_20261029/`. A frente DungeonArena tem outro dono.

Hashes SHA-256 após normalizar CRLF para LF (migrações e produto congelados):

| Arquivo | SHA-256 LF |
| --- | --- |
| `supabase/migrations/20261028214109_adventure_horde_continuous.sql` | `858c6600d4ec72fb45a833b1cc6b9cc20013497baa5c48f4782219e75e72a39b` |
| `supabase/migrations/20261029035917_mage_area_hero_hits.sql` | `e3d91602bde60bcc47d1eaf646f25b9ae7f7bb4db0547a637c6de0e1a37b7e6e` |
| `supabase/migrations/20261029043726_adventure_auto_potions.sql` | `dcc1a66a08024a54641cb676982e3a2316a5b8fcd59ca1b1150236b06ad7786c` |
| `src/hooks/useAdventureAutoPotions.ts` | `82ab1c45faa7991128d1ff9fca119ff0ae175076f0ef7972ba8ffa4b9f664205` |
| `src/components/adventure/AdventureAutoPotionsPanel.tsx` | `ad5ec4a92cb17342c2fe99c3acc9130915a1cea3daad31299037b903af5a64ec` |
| `src/components/AutoAdventure.tsx` | `f1dc5e5d3e77f024cfa414fb28635f47f6649e519fd36901173f6ceb46ca56db` |
| `src/integrations/supabase/types.ts` | `9f4527c0bacec40a4f51ea9523aaf6d52f679b5d45fe7938d1ed0233af5b2028` |
| `src/lib/autoAdventurePayload.ts` | `01f8dd19466e92669cbd9b46738188fa7e9c4653bc098f8db22e3d2d8d7ed0eb` |
| `src/lib/adventureSceneProjector.ts` | `a0b8ce14f0c5119d3d03ac3c7dfd10eecdddf05a7a9cb3602d4458afbb15ef3c` |
| `src/components/adventure/AdventureScene.tsx` | `dab123df9bc8eec2343382a596c1ab94b7bc600c106d1512873e28b604c66e63` |

## Ambiente e resultados PostgreSQL 17

Copiei **somente após** `pg_ctl status` indicar fonte parada (exit 3) e `pg_isready -p 55933` responder sem servidor (exit 2). A origem foi `C:/Users/Murillo/AppData/Local/Temp/rpg-auto-potions-task25f487b1/data`; o clone próprio está em `C:/Users/Murillo/AppData/Local/Temp/rpg-auto-potions-review-97aa993d/data`, PostgreSQL 17.9, porta 55936, que estava livre (`pg_isready` exit 2). Nenhum comando escreveu na origem nem em Supabase remoto. Logs locais ficam no diretório pai do clone.

| Prova no clone | Saídas |
| --- | --- |
| Criar `review_auto_potions` de `mage_chain_final` (AoE) e aplicar `20261029043726` com `psql -X -v ON_ERROR_STOP=1 -f` | `CREATE DATABASE` 0; migração 0 |
| `review_live_consumer_install.sql` | 0; `REVIEW_LIVE_CONSUMER_SOURCE_PASS` |
| `review_historical_toggle.sql` | 0; 9 batalhas iniciadas antes da ativação, sem recibo retroativo |
| `review_legacy_setup.sql`; sessão A `review_legacy_manual_first_a.sql` versus B `review_legacy_manual_first_b.sql`; assert | 0; A/B/asserção 0/0/0, sem evento/recibo após consumo manual da única unidade |
| Sessão A `review_legacy_auto_first_a.sql` versus B `review_legacy_auto_first_b.sql`; assert | A/B/asserção 0/0/0; consumo legado rejeitado com `ITEM_NOT_OWNED`, um evento e um recibo automático, sem linha de estoque residual |
| `simulate.sql`, `wrapper.sql`, `wrapper_mp_offline.sql`, `no_stock_rollback.sql`, `acl.sql`, `reward_profile.sql`, `pruning.sql` | Sete exits 0; limiares/HP morto/MP zero/1 por tipo, wrapper/cross-identity/anon, rollback, retry, offline, prêmio único sem XP, 129 batalhas podadas com recibo preservado |
| Criar `review_chain` de `mage_pre`; `snapshot_before.sql` → AoE → poções → `snapshot_after.sql` | Criar 0; quatro scripts 0/0/0/0; snapshots de batalhas v3 e v4 já em voo mantidos |
| Overload pré-existente `drift_overload.sql` antes da migração | Setup 0; migração exit 3 esperado (`AUTO_POTIONS_OVERLOAD_OR_OBJECT_DRIFT`); `drift_assert.sql` 0, sem DDL parcial |
| ACL efetiva herdada `review_inherited_acl_setup.sql` (`anon` herda `authenticated`) antes da migração | Setup 0; migração exit 3 esperado (`AUTO_POTIONS_SOURCE_OR_ACL_DRIFT`); `drift_assert.sql` 0; `review_inherited_acl_teardown.sql` 0 |
| Defaults de ACL públicos capturados do alvo, reproduzidos em `review_live_defaults` | Criar/setup/migração/assert 0/0/0/0; `anon` sem EXECUTE, `authenticated` e `service_role` com EXECUTE nos novos RPCs |

O `consume_inventory_item(uuid)` usado nas disputas não foi um surrogate: `review_live_consumer_install.sql` carregou no clone a definição capturada por **SELECT read-only** do alvo em `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/mago-area-20261029/consume-inventory-live-readonly.sql`. O MD5 LF de `pg_get_functiondef` conferiu `758fca4a260de7aea24758c03b9ffafd` (SHA-256 LF do arquivo `5c9f1db8d14194facb636582a692bd1db4635ae3571d8e32b3739ac4e17cb705`), owner `postgres` e EXECUTE efetivo negado a `anon`. O fixture reduzido já tinha tabelas sintéticas de talentos vazias; a ramificação probabilística `alquimista_amador` não foi exercitada.

## Frontend congelado

`npm test -- src/test/AdventureAutoPotions.test.tsx src/test/AutoAdventure.test.tsx src/test/AutoAdventureHordeComponent.test.tsx src/test/AdventureFinalHit.test.tsx src/test/AutoAdventurePayload.test.ts` saiu 0: **5 arquivos, 50 testes**. Inclui chave por usuário/época, mutation tardia após troca de conta, RPC ausente sem polling, apresentação de `mp_restored` e último evento confirmado. `npm run build` saiu 0; ESLint focado nos oito arquivos de hook/painel/integração/parser/projector/cena/testes saiu 0; `git diff --check` saiu 0. `npx tsc --noEmit -p tsconfig.app.json --pretty false` saiu 2 com **44 diagnósticos globais anteriores** e **zero** nos arquivos focados. O build avisou apenas sobre Browserslist antigo e chunks grandes.

## Achados e decisões

| Severidade | Local e cenário | Estado |
| --- | --- | --- |
| **Média**, integração legada | `src/components/DungeonArena.tsx:742-758`: com a última unidade disputada pela aventura, a DungeonArena aplicava HP/MP e removia o item local antes de `consume_inventory_item` confirmar; o RPC pode devolver `ITEM_NOT_OWNED` após o débito automático, enquanto a cura local já ocorreu. | Informado ao coordenador; frente própria para correção, fora do freeze desta revisão. A prova de lock no banco não demonstra que esse estado local já está corrigido. |
| **Baixa**, diferença de ACL/de documentação | `supabase/migrations/20261029043726_adventure_auto_potions.sql:308-311`: o `REVOKE` dos novos RPCs não menciona `service_role`. O `pg_default_acl` capturado por SELECT no alvo concede EXECUTE por padrão a `anon`, `authenticated` e `service_role`; no clone com esse default, a migração retirou EXECUTE de `anon`, mas manteve o de `service_role`. | Sem exposição demonstrada a usuário comum: `service_role` é papel privilegiado e os corpos exigem `auth.uid()`. Documentar essa permissão efetiva e ajustar a migração apenas se a intenção for negar também ao service role. |

Achados iniciais do WIP foram corrigidos **antes** do freeze: recibos deixaram de ter FK destrutiva para batalhas podadas (`migration:71-80`, prova `pruning.sql`); a última unidade agora remove a linha de `user_inventory` (`migration:231-240`, provas de disputa); preflight passou a examinar overloads dos nomes novos e ACL efetiva (`migration:9-52`, provas negativas); oito erros TypeScript novos foram reduzidos a zero nos arquivos focados. Não identifiquei bloqueante remanescente no delta congelado de poções.

## Limites e teardown

O clone PG17 com `SET ROLE` e claims sintéticas verifica semântica SQL, atomicidade, ACL local e concorrência de duas sessões. Não prova GoTrue, PostgREST real, browser autenticado, esquema completo do Primary, produção ou rollout. A cadeia independente partiu de v4 congelado e aplicou AoE→poções; a subida v3→v4 é evidência do builder, não repetida aqui. O teste local de `consume_inventory_item` usa fonte viva exata em um fixture reduzido e cobre a ramificação sem talento de preservação. O alvo publicado ainda foi informado pelo coordenador como v3 sem os novos RPCs.

Teardown do cluster próprio: `pg_ctl -D .../rpg-auto-potions-review-97aa993d/data stop -m fast -w` exit **0**; `pg_isready -h 127.0.0.1 -p 55936` exit **2**; `Get-NetTCPConnection -LocalPort 55936 -State Listen` encontrou **0 listeners**; `pg_ctl status` exit **3**. Dados e logs foram preservados no diretório temporário da revisão. Nenhum commit, push, deploy ou escrita SQL remota nesta revisão.
