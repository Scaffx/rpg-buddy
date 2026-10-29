# Poções automáticas autoritativas da aventura — 29/10/2026

## Estado e escopo

Checkout `rpg-auth-foco-20261026`, branch `Scaffx/rpg-hordas-continuas-20261028`, HEAD inicial `addddcb7a1d0e7a1d919107dd632a75a01bbc22d`. Havia WIP de AoE, Scene e pet de outras frentes; seus arquivos foram preservados. Nenhum commit, push, deploy ou SQL remoto foi feito.

Migration nova gerada com `npx --no-install supabase@2.121.0 migration new adventure_auto_potions`: `supabase/migrations/20261029043726_adventure_auto_potions.sql`. UI: `src/hooks/useAdventureAutoPotions.ts`, `src/components/adventure/AdventureAutoPotionsPanel.tsx`, integração em `src/components/AutoAdventure.tsx` e tipos dos dois RPCs em `src/integrations/supabase/types.ts`. Teste próprio `src/test/AdventureAutoPotions.test.tsx`; dois testes existentes de `AutoAdventure` ganharam somente mock do novo hook. SQLs e fixtures em `supabase/tests/auto_potions_20261029/` e `docs/qa/auto-potions/`.

## Contrato e segurança

`public.get_adventure_auto_potions_state()` retorna configuração, estoque compatível, batalha, recibos e `server_now`; `public.set_adventure_auto_potions_enabled(boolean)` grava a preferência. Ausência de seleção significa **desligado**. Ambos exigem `auth.uid()` no corpo e expõem somente dados do próprio usuário; `EXECUTE` foi revogado de `PUBLIC` e `anon` e concedido a `authenticated`. As tabelas privadas têm RLS habilitado e nenhum grant direto ao cliente. Funções `SECURITY DEFINER` usam `search_path=''` e nomes de esquema qualificados, conforme [orientação Supabase para funções](https://supabase.com/docs/guides/database/functions) e [API](https://supabase.com/docs/guides/api/securing-your-api).

O botão ativa HP e MP juntos, com limiares fixos: HP apenas se `0<HP<25%` do máximo; MP apenas se `MP<20%` e `maxMP>0`. Cada tipo tem uma única oportunidade por luta. `app_private.adventure_simulate_horde_potions` é uma função nova; a função AoE original e batalhas v3/v4 já existentes não são reescritas. Ela acrescenta eventos sem duração ao horário exato do evento que cruzou o limiar, com `damage=0`, slots vazios e recursos pós-uso. Há limite total de 1.200 eventos e 15 minutos; a adição não adia relógios nem cria turno do pet.

O sync segura o lock existente de `profiles` e trava as linhas escolhidas de `user_inventory` antes da simulação. Só debita quando a timeline congelada contém um evento `consumable.hp` ou `.mp`: reduz `quantity` se restam unidades e remove a linha se era a última; no mesmo commit cria recibo com chave `(battle_id,potion_type)`. Se faltar estoque, a luta segue sem evento e sem erro; erro após simulação reverte batalha, estoque e recibo. Recibos mantêm `battle_id` UUID sem FK destrutiva, pois o motor poda timelines antigas. O painel mostra unidades já debitadas como **reservadas** antes de `event_at` e **usadas** depois; o estoque exibido não as inclui. Não há escrita em vida/mana global, XP, nível, atributos ou ouro pelo consumo.

Seleção de item é exclusivamente por pares `(id,effect)` protegidos do catálogo de `game_items`, `category='consumable'`, `is_consumable`, `stackable`, `level_required<=hero_level` e posse real em `user_inventory`. Usa primeiro a menor recuperação elegível. Efeitos mistos, itens sem par protegido e `restore_mp_20` ficam de fora; a UI diz “poção compatível” e mostra recuperação efetiva da luta. Histórico da opção por `effective_at` impede que uma ativação feita agora altere lutas com início anterior durante catch-up. Cada luta nova usa o estoque disponível quando o servidor a simula.

O hook usa chave de React Query por usuário e época de Auth, `AbortSignal`, confirmação do RPC antes de alterar o estado e erro de mutation visível. Resposta tardia de outra identidade não é aplicada à conta atual. `PGRST202`/`42883` (RPC ausente no servidor antigo) desabilitam o controle e suspendem polling/focus/reconnect até retry explícito ou remount; a aventura continua. O painel é exportado e pode ser renderizado em root demo sem `onToggle`, sem gravação.

## Fonte congelada e PG17 local

Hashes SHA-256 com LF canônico:

| Arquivo | SHA-256 |
| --- | --- |
| `20261028214109_adventure_horde_continuous.sql` | `858c6600d4ec72fb45a833b1cc6b9cc20013497baa5c48f4782219e75e72a39b` |
| `20261029035917_mage_area_hero_hits.sql` | `e3d91602bde60bcc47d1eaf646f25b9ae7f7bb4db0547a637c6de0e1a37b7e6e` |
| `20261029043726_adventure_auto_potions.sql` | `dcc1a66a08024a54641cb676982e3a2316a5b8fcd59ca1b1150236b06ad7786c` |

Preflight da nova migration compara `pg_get_functiondef` LF MD5 de `sync` pós-AoE `08464d437f42c43172ad033ae17506ee` e simulador AoE `5d99024d389fb4fcf6bf574221fb3879`, além de wrapper público, owner `postgres`, ACL bruto e efetivo `anon`/`authenticated`/`service_role`, `SECURITY DEFINER`, volatilidade, `search_path`, RLS/ACL de inventário/catálogo e overloads dos nomes antigos/novos. Drift de corpo, owner, ACL ou overload aborta antes do DDL.

Clone físico isolado da origem parada `C:/Users/Murillo/AppData/Local/Temp/rpg-mage-area-task55911743/data` em `C:/Users/Murillo/AppData/Local/Temp/rpg-auto-potions-task25f487b1/data`, PostgreSQL **17.9** na porta **55933**. Fonte original intocada. Bancos de prova dentro do clone foram copiados de `mage_pre` (v4) ou `mage_chain_final` (AoE). Com `psql -X -v ON_ERROR_STOP=1 -f`, a cadeia v4 → AoE → poções terminou exit **0** após a correção da última unidade. SQLs `simulate`, `wrapper`, `wrapper_mp_offline`, `no_stock_rollback`, `acl`, `reward_profile`, `snapshot_before/after`, `review_historical_toggle`, `concurrency_setup/assert` e `pruning` terminaram exit **0**. Duas sessões `concurrency_a/b` terminaram **0/0**, uma batalha, um recibo, um débito. Quatro clones de drift (ACL, owner, body e overload) fizeram a migration falhar como esperado com exit **3** e `drift_assert` sair **0**, sem aplicação parcial.

Teardown do clone próprio: `pg_ctl stop -m fast -w` exit **0**; `pg_isready` na porta 55933 exit **2** e nenhum listener. Diretório de dados e logs preservado.

As asserções cobrem limiares estritos inclusive igualdade, herói morto, MP máximo zero, 1 por tipo, slots sem ataque, limite 1.200, uso no timestamp, wrapper autenticado e cross-identity, `anon` sem execução, estoque incompatível/misto, rollback, retry, catch-up offline com fonte prévia congelada, recompensa única sem XP, snapshots v3/v4 imutáveis, 129 timelines podadas com recibo preservado, e concorrência de duas sessões. O probe de gasto do mesmo item em duas sessões passou nos dois ordenamentos: gasto primeiro e reserva automática primeiro, ambos **0/0** com asserções **0**. O clone congelado não contém `public.consume_inventory_item(uuid)`; esse probe usa uma função `SECURITY DEFINER` somente no banco de teste que deleta a mesma linha de inventário e mede o bloqueio. Portanto não comprova o RPC legado da dungeon/oficina. `docs/qa/auto-potions/hp.json` e `mp.json` são respostas completas do wrapper autenticado; `public-fixture.json` captura eventos e RPC de estado antes/depois do uso.

Frontend: `npx --no-install tsc -p tsconfig.app.json --noEmit --pretty false` exit **2**, com **44 erros** de baseline em arquivos fora desta entrega e nenhum diagnóstico nos arquivos tocados aqui; ESLint dos arquivos tocados exit **0**; `vitest run` selecionado, **26/26** testes exit **0**; `npm run build` exit **0**. `git diff --check` exit **0**. O build ainda avisa sobre chunk grande e Browserslist antigo.

## Limites e próximo gate

O clone PG17 confirma SQL e wrappers via `SET ROLE`/claim sintética. Ele não prova GoTrue, PostgREST, navegador autenticado, schema do Primary, rollout, nem produção. O alvo vivo ainda está em v3, sem horda/AoE; esta migration depende da aplicação imutável de v4 e AoE e de preflight aprovado no alvo antes de qualquer deploy. O coordenador fará browser/candidato e decidirá o gate de produção. A recuperação offline usa o estoque que o servidor encontra quando simula cada luta; não reconstrói um inventário histórico de antes do login.
