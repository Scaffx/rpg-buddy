# Motor servidor AoE do mago — 29/10/2026

## Escopo e fonte congelada

[Certo] Worktree `C:/Users/Murillo/orca/workspaces/rpg-buddy/rpg-auth-foco-20261026`, branch `Scaffx/rpg-hordas-continuas-20261028`, HEAD `addddcb7a1d0e7a1d919107dd632a75a01bbc22d`. O checkout estava limpo no início. Ownership deste trabalho: somente a migration corretiva, `supabase/tests/mage_area_20261029`, `docs/qa/mage-area/*.json` e este relatório. Outros workers editaram TS/CSS em paralelo; não toquei nesses arquivos. Não houve commit, push, merge, deploy, instalação ou SQL remoto.

[Certo] A migration entregue `20261028214109_adventure_horde_continuous.sql` permaneceu byte a byte igual ao `HEAD`; SHA-256 com LF canônico `858c6600d4ec72fb45a833b1cc6b9cc20013497baa5c48f4782219e75e72a39b`. A nova `20261029035917_mage_area_hero_hits.sql` foi gerada por `npx --no-install supabase@2.121.0 migration new mage_area_hero_hits` (exit 0; a invocação sem versão tentou baixar 2.122.0 e falhou por `--no-install`, portanto usei a versão 2.121.0 já em cache). SHA-256 LF final da corretiva: `e3d91602bde60bcc47d1eaf646f25b9ae7f7bb4db0547a637c6de0e1a37b7e6e`.

[Certo] A corretiva exige os corpos v4 LF congelados, owner `postgres`, ACL, volatilidade, `search_path`, ausência de overloads e o CHECK v3/v4 antes de qualquer `CREATE OR REPLACE` ([preflight](../../supabase/migrations/20261029035917_mage_area_hero_hits.sql#L7)). MD5 LF v4 esperado: `sync=b2f065b8720f8a91f0d0d42262c87e06`, `simulate_horde=844a379887ad5f449406400b7116db85`, `payload=e2ae788e646008bd792f7ca7bae12900`. O preflight original da v4 também rodou na base v3 fiel; os hashes v3 `sync=1641aa39afd52bcddae1998819c4b330` e `payload=19652de586465e476978672744f83fd5` constam da captura sanitizada de 28/10. O coordenador informou uma reconsulta somente SELECT em 29/10 que ainda viu esses dois hashes no alvo vivo e nenhuma função horde; isso não aprova aplicar migrations no alvo.

## Contrato implementado

[Certo] Os quatro relógios continuam independentes. Cada novo golpe do herói v4 publica `target_slots:number[]` e `hits:[{target_slot,damage,raw_damage,damage_multiplier}]` no mesmo evento e horário. `target_slot` singular aponta o primeiro hit; `damage` é a soma dos hits; `enemies_hp[]` já reflete os danos individuais no próprio evento ([simulador](../../supabase/migrations/20261029035917_mage_area_hero_hits.sql#L167)). A resistência, a vulnerabilidade e o poder do inimigo entram no cálculo de cada alvo; cada slot vivo é percorrido uma vez. Um slot morto não recebe novo hit. Boss continua um alvo. Mana, cooldown, rotação e sustain são consumidos uma vez por cast.

[Certo] `heal` e `buff` do herói têm `target_slot=null`, `target_slots=[]`, `hits=[]` e `damage=0`. Eventos dos inimigos omitem `target_slots` e `hits`. `debuff`/`cc` hostil sem strike tem um hit no alvo escolhido com `damage=0`, `raw_damage=0` e `damage_multiplier=1`, sem mudar HP ([controle](../../supabase/migrations/20261029035917_mage_area_hero_hits.sql#L198)). Eventos v4 já gravados antes da corretiva não são reescritos; v3 permanece na função anterior. O motor não cria ação de pet.

[Certo] O loadout existente equipa IDs das bases. A seleção autoritativa consulta a skill base alocada e, somente para classe Mago confirmada e variante correspondente também alocada ao mesmo usuário, transforma a entrada em `m_fogo_var`, `m_gelo_var`, `m_raio_var` ou `m_arc_var` ([extração](../../supabase/migrations/20261029035917_mage_area_hero_hits.sql#L299)). O nome e bônus vêm de `skill_tree_nodes`, com whitelist explícita e efeito da variante verificado. Apenas as três primeiras variantes recebem `target_mode='all_enemies'`; bases e Singularidade ficam `single`. Nome, poder e modo enviados no JSON do perfil não autorizam variante ou AoE. Os demais tipos de skill e classes conservam a extração anterior.

## PostgreSQL 17.9 local

[Certo] O cluster original `C:/Users/Murillo/AppData/Local/Temp/rpg-hordas-fix-task483352/data` estava parado (`pg_isready` 55930 sem resposta) e foi **copiado**, sem alteração do original, para `C:/Users/Murillo/AppData/Local/Temp/rpg-mage-area-task55911743/data`. Clone iniciado em `127.0.0.1:55931`; logs preservados em `.../logs/`. A base sintética `hordes_drift` do clone tinha fonte v3 e CHECK v3; `createdb -T hordes_drift mage_chain2` seguido de `psql -X -v ON_ERROR_STOP=1 -f` para a migration v4 e para a corretiva retornou **0/0**, com `BEGIN` até `COMMIT`. PostgreSQL reportou `17.9 on x86_64-windows`.

| Prova SQL local | Exit e evidência |
| --- | --- |
| `supabase/tests/mage_area_20261029/simulate.sql` | 0; três hits no mesmo `at`, soma do dano, mana uma vez, base/Singularidade single, morto ignorado, boss um alvo, resistência/poder/vulnerabilidade por alvo, cooldown, relógios invariantes, controle sem dano com hit zero e heal/buff vazios. `MAGE_AREA_SIMULATE_PASS`. |
| `wrapper.sql` via `SET ROLE authenticated` + `public.sync_auto_adventure()` | 0; três variantes AoE, Singularidade single, variante não aprendida, base não aprendida, classe não confirmada e campos falsos do cliente. `MAGE_AREA_WRAPPER_PASS`. |
| `capture_setup.sql` + oito JSONs de `public.sync_auto_adventure()` | 0; horda `[0,1,2]` e depois `[1,2]`, Nova, Tornado, base single, boss `[0]` e controle com hit zero no payload público. `MAGE_CAPTURE_PUBLIC_WRAPPERS_PASS`. |
| `inflight_before.sql` → corretiva → `inflight_after.sql` em `mage_inflight` | 0/0/0; `events`, `rules_snapshot` e `skills` de uma batalha v4 criada antes da corretiva mantiveram MD5 idêntico. |
| Drift de corpo, ACL e owner em três clones de `mage_pre` | Setup 0 cada; corretiva **3 esperado** com `MAGE_AREA_SOURCE_OR_ACL_DRIFT`; `drift_assert.sql` 0 cada confirma ausência de aplicação parcial. |
| Regressões existentes de hordas: `assert`, `draw`, `pet_wrapper`, `defensive_settlement`, `retreat`, `offline`, `advance`, `legacy` | 0 em cada. Incluem limite 15 min/1.200, v3, pet passivo, liquidação única e nenhum XP/nível/atributo concedido. |
| `concurrency_setup` → sessões simultâneas `concurrency_a`/`concurrency_b` → `concurrency_assert` | 0/0/0/0; um encontro, um ledger de ouro e XP/nível intactos. |

[Certo] Após a corretiva, `app_private.adventure_simulate_horde` continua owner `postgres`, ACL `{postgres=X/postgres}`, `SECURITY INVOKER`, `STABLE`, e sem `EXECUTE` para `anon`. `app_private.sync_auto_adventure` conserva `{postgres=X/postgres,authenticated=X/postgres}` e `SECURITY DEFINER`; o wrapper público conserva `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` e nega `anon`. MD5 LF finais observados: simulador `5d99024d389fb4fcf6bf574221fb3879`, sync `08464d437f42c43172ad033ae17506ee`, wrapper público sem mudança `1879a24abc08fec402ea5d96f4a199c6`.

## Fixtures para integração

[Certo] Os arquivos abaixo são respostas JSON completas e válidas do wrapper **público** em usuários artificiais locais, preservando a estrutura `{battle,...}`. `horde.json`, `meteor.json` e `two-survivors.json` são cópias idênticas de um mesmo encontro com Meteoro `[0,1,2]` e Nova Gélida `[1,2]`; não são três capturas independentes. Nenhum evento inimigo contém arrays de hits. O catálogo reduzido em `capture_setup.sql` usa os IDs/efeitos publicados para as skills reais e um nó `test_control` somente para o fixture de controle. Esse nó não existe no catálogo vivo e não é oferecido pela migration.

| Fixture | Casos | SHA-256 LF |
| --- | --- | --- |
| `horde.json`, `meteor.json`, `two-survivors.json` | Meteoro 3, Nova 2 sobreviventes | `bb962623f2236149e483db6eadc70b052479f8723d972883429812b435a61ad4` |
| `nova.json` | Nova 3 | `ae8dc35778e5bc3e945bd9645a028ca74d45bb523ddd7f0e6202f08024765a9f` |
| `tornado.json` | Tornado 3 | `93c8ea93347b7781a87f1633929b1b13643af93d99d0875ba5db3a2e42b0e996` |
| `single.json` | Bola de Fogo sem variante aprendida, hits singulares | `3dd9ed38b7cfe61a2febd3c553daeca67cc764dd9dbaf2cde190facce689c8a5` |
| `boss.json` | Meteoro em boss único | `a88d2933d6fdca6bd91fec784db7bee3fc2030f35edb0cc95f05b486088f2aa3` |
| `control.json` | CC sem strike e um hit de dano zero | `e11fe6c99f1e4b5fdde02fc835dfa77314ebe468a9d055e7f8685ffba81ce848` |

## Encerramento e limites

[Certo] `pg_ctl -D <clone>/data stop -m fast -w` saiu 0; `pg_isready` em 55931 e no original 55930 saiu 2 (`no response`); `Get-NetTCPConnection -State Listen -LocalPort 55931` retornou 0 listeners. Dados e logs dos dois clusters foram preservados. `git diff --check` saiu 0; os avisos LF/CRLF eram de arquivos TS/CSS editados pelos outros owners. Os SQLs novos não têm whitespace final. Não houve pet de ataque, recompensa por criatura ou alteração de XP.

[Certo] Os resultados provam o comportamento na fixture sintética PG17 e no contrato SQL do wrapper sob `SET ROLE`; não provam PostgREST, sessão autenticada do navegador, latência de produção, schema completo atual ou deploy. O alvo vivo continua v3 segundo a reconsulta somente leitura do coordenador. Integração TS/UI, revisão do PR 77 e qualquer promoção pertencem ao coordenador.
