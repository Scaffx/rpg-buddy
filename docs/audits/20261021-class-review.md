# Revisão independente — autoridade de classe (21/10/2026)

## Escopo e estado

**PASS no escopo de autoridade de classe:** SHA final do autor `d6406918e3c7fd0eec45e9f3315a49c3d2be0290`; migration `20261021145143_hero_class_authority.sql` SHA-256 `ADFA6DC2E9EF06CF28D48C364BC0AD31CF1FCCD93F525047253F45F19EB7AC85`. O diff desde `677768d` acrescenta a adjacência de colunas na cadeia de classes e mantém Aprendiz após Lv4 até a evolução escolhida pelo jogador. As duas falhas reproduzidas no SHA inicial foram retestadas no SHA final, com negativo de histórico e positivo da transição.

Autor: `rpg-continuo-cena-20261020`; revisão: `rpg-continuo-motor-20261020`. Foram lidos o commit de classe, migration, fixture, hooks, onboarding, página de perfil, árvore e catálogo publicados. Primary `jfnospjxdkelxlhcwuia` foi consultado somente em leitura para contratos de RPC, grants, RLS e IDs de classes; nenhum DDL/DML/JWT foi enviado a Primary.

## Provas positivas no PostgreSQL 17 local

Cluster do coordenador em `127.0.0.1:55621`; somente bancos `skills_review_class_audit_*` criados por esta revisão. Os comandos usam `C:\Program Files\PostgreSQL\17\bin\psql.exe -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55621 -U postgres -d <banco> -f <arquivo>`. Para a fixture do autor, o diretório de trabalho é o worktree do autor porque ela contém `\i src/test/sql/hero_class_live_*.sql`. Logs preservados em `%TEMP%\skills_review_class_audit_task_85c9ee95e012`.

O preflight final foi conferido contra as assinaturas, `md5(pg_get_functiondef)` dos dois RPCs vivos, owner `postgres`, `proconfig`, ACL, política/RLS de `player_skill_nodes` e seis IDs/nomes/ancestrais de base. Os três bancos negativos foram executados com `--single-transaction`; os erros são esperados e impedem a aplicação. Nas races, a primeira sessão segura o lock por `pg_sleep(2)` e a segunda inicia cerca de 300 ms depois, em conexão distinta.

| Banco | Sequência / resultado |
| --- | --- |
| `skills_review_class_audit_final_d640691` | Fixture do autor `0`; setup Aprendiz Lv4/Lv5 `0`; migration com `--single-transaction` `0`; probes Aprendiz, segurança, respec e assert do autor `0/0/0/0` (`HERO_CLASS_AUTHORITY_PASS`). Os probes próprios fazem `ROLLBACK`. |
| `skills_review_class_audit_wait_final2` | Fixture `0`; setup de Aprendiz Lv4, Lv5 com ledger e Lv5 sem ledger `0`; migration `0`; `review_hero_class_aprendiz_wait_assert.sql` `0` (`REVIEW_HERO_CLASS_APRENDIZ_WAIT_PASS`). |
| `skills_review_class_audit_body_d640691` | Fixture `0`; probe substitui corpo da RPC viva `0`; migration `3`, erro esperado `HERO_CLASS_PREFLIGHT_RPC`. |
| `skills_review_class_audit_catalog_d640691` | Fixture `0`; probe troca nomes entre IDs Mago/Espadachim `0`; migration `3`, erro esperado `HERO_CLASS_PREFLIGHT_CATALOG`. |
| `skills_review_class_audit_select_d640691` | Duas sessões escolhem ramos diferentes: primeira `0`, segunda `3` (`STARTER_CLASS_ALREADY_CHOSEN`), assert `0`; identidade/mirror únicos e replay da mesma classe. |
| `skills_review_class_audit_allocate_d640691` | Duas sessões alocam o mesmo nó Lv1: primeira `0`, segunda `3` (`NO_POINTS`), assert `0`; rank final `1`. |
| `skills_review_class_audit_respec_d640691` | Duas sessões fazem respec sucessivo sob lock: ambas `0`, assert `0`; uma grátis, uma custa `120`, ouro final `80`, um lançamento de débito. |

O probe de segurança verifica Mago Lv1 com `current_class_id NULL` e `m_dardo`, escolha onboarding, nome/avatar editáveis, falsificação de classe/profile e de `player_skill_nodes` negada (inclusive `TRUNCATE`), helpers de leitura privados sem ACL de cliente, wrappers `authenticated` e `anon` fechado. Os cores de mutação têm `auth.uid()` próprio e são chamados por wrappers invoker. O probe de respec verifica avanço apenas Lv5 e ramo correto, primeiro grátis, segundo `120`, saldo insuficiente atômico, classe tier3 limpa na troca, skill previamente alocada preservada e rollback do ouro/classe quando um trigger injeta falha após débito.

`npx --no-install vitest run src/test/heroClassAuthority.test.tsx src/test/selectClassRpc.test.tsx` no commit final `d640691`: exit `0`, 2 arquivos/4 testes.

## Histórico e transição Aprendiz

| Banco | Entrada | Resultado observado em `677768d` |
| --- | --- | --- |
| `skills_review_class_audit_historical_gap` | Bruxo histórico com pai Mago base, mas `column_index=4` e `level_min=35` (salto 2→4), perfil Mago Lv35 apontando para Bruxo. | Fixture `0`, probe próprio `0`, migration **`0`**, ledger criado e `hero_class_key = mago`. `class_path_matches` não exige colunas adjacentes. |
| `skills_review_class_audit_historical_root5` | Perfil Mago Lv5 ainda apontando para Aprendiz enquanto aguarda escolha humana da classe base. | Fixture `0`, probe próprio `0`, migration `0`, ledger criado, mas `hero_class_key = NULL`. A escolha fica válida no banco e sem árvore ativa no helper. |

O primeiro é dado incompatível: no SHA final, o banco `skills_review_class_audit_gap_d640691` teve fixture `0`, probe `0`, migration em `--single-transaction` exit **`3`** (`HERO_CLASS_HISTORICAL_REVIEW_REQUIRED`). Após rollback: ledger inexistente, perfil histórico intacto e grant anterior intacto (`1|1|1`). A validação exige que cada pai esteja na coluna imediatamente anterior, além da raiz/base, níveis e ausência de ciclos.

O segundo é estado legítimo pendente de avanço: `ClassesPage` usa nível mínimo sem nível máximo e exige clique humano. No SHA final, `hero_class_key` retorna `aprendiz` no Lv5 tanto com ledger quanto sem ele; `has_hero_class=false`. O probe próprio verifica que Lv4 nega a classe Mago base, Lv5 ainda pode usar `a_golpe` antes da escolha, e o RPC de evolução Lv5 muda a chave para `mago` sem promoção automática. O setup também mantém o perfil Aprendiz sem starter fora do ledger, sem inventar classe.

Consultas somente leitura ao Bug Tracker não encontraram entrada específica; registro de bugs fica com o coordenador.

## Limites e composição

Esta fixture é reduzida e reproduz definições de RPC publicadas com hash; testes locais não demonstram aplicação em Primary, autenticação via API real, nem o comportamento do app publicado. O reset de árvore até nível 10 pertence à migration paralela do HUB; o coordenador informou que ela foi integrada e testada em banco composto, fora deste veredito de classe. O cluster PostgreSQL do coordenador, seus bancos preexistentes, logs e o junction `node_modules` foram preservados.
