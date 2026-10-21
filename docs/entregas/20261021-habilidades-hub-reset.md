# Habilidades HUB + reset — 21/10/2026

## Escopo e estado

- Base do worktree: `9a8033829c3f6dea546b4709e569958c0a046e61` (`Scaffx/habilidades-hub-reset-20261021`).
- Primary `jfnospjxdkelxlhcwuia`, link `link_6abe70536ca4819193b60c2d9ba7d54a`: somente leitura. Nenhuma escrita remota, deploy, push ou navegador pelo worker.
- Função viva observada: `public.reset_skill_tree()` com owner `postgres`, `SECURITY DEFINER`, `search_path=public`, ACL explícita para `anon`, `authenticated` e `service_role`; SHA256 de `pg_get_functiondef`: `f1feb27f302a8c5725c13cf87b8b6013d3e10203cb1807dc86b79add4793f944`. A regra anterior cobrava 150 ouro só acima do nível 15, excluía apenas `player_skill_nodes.source='points'` e retornava `{ok,charged}`.

## Implementado

- Nova migration gerada por `npx --no-install supabase migration new reset_skill_tree_level10`: preflight de assinatura, owner, ACL, segurança, corpo/hash e colunas; core privado `app_private.reset_skill_tree_core()` e wrapper público `SECURITY INVOKER`. Grátis até nível 10 inclusive; acima de 10, débito condicional atômico de 150 ouro; retorno `charged` real mais contagem de pontos/skills removidos.
- Reset apaga apenas nós `source='points'`. Retira do loadout apenas IDs desses nós, preservando ordem, armas, scroll/drop e outras entradas. Não altera classe, XP, rotinas, atributos permanentes, inventário nem snapshot de luta já criada.
- Hook retorna a resposta da RPC e invalida alocações, profile, saldo e histórico de ouro. UI exibe limiar 10 e usa `charged` retornado na confirmação de sucesso; pontos gastos incluem nós de todas as árvores, inclusive Aprendiz.
- Hub mantém árvore, editor e talentos. Aba e título mudaram para **Talentos da vida real**; painel redundante de habilidades de combate saiu de `FeatsTree`, sem alteração em compra, alocação ou efeitos dos talentos.
- Editor tem botões acessíveis de subir/descer e salva a ordem no array `profiles.combat_skill_loadout`; mostra MP/recarga e a rotação de prontidão. Oculta a configuração de frascos nesse editor de aventura, preservando as colunas existentes. O MOTOR confirmou `dano/damage`, `heal`, `buff`, `debuff` e `cc`; `utility` recebe aviso de não execução. Skills de dano exibem aviso de que descrições de queimadura, congelamento, DoT e área não se aplicam ao motor v3.
- Acessórios que mudam a aparência: **FUTURO**. Nenhuma implementação nesta entrega.

## Gate de classe observado

`useHeroClass.hasClass` considera `starter_class` ou `localStorage` suficientes para mostrar a árvore. A função viva `allocate_skill_node(text)` não valida classe/árvore. Na aventura atual, `v_has_class` depende de `current_class_id IS NOT NULL`; um herói com `starter_class=mago`, `current_class_id=NULL` e `m_dardo` alocado pode ver a skill no editor, mas o SQL não a aceita como habilidade de classe. O editor agora avisa isso e preserva a alocação e o loadout. Root reservou a correção de proveniência canônica da classe para outra frente; o aviso não é considerado correção final. Não se criou classe fictícia nem se removeu a habilidade.

## Verificação

| Prova | Resultado |
| --- | --- |
| PostgreSQL 17 isolado: fixture da definição viva, migration e `src/test/sql/reset_skill_tree_assert.sql` | PASS; saída `RESET_SKILL_TREE_ASSERT_PASS`, exit 0. Nível 10 `charged=0`, repetição sem novo reembolso; nível 11 `charged=150` por chamada conforme regra vigente; saldo insuficiente aborta sem débito/remoção; scroll/drop, loadout válido, outro herói, XP/classe/atributo e snapshot permanecem. |
| Preflight negativo: `ALTER FUNCTION ... SET search_path=pg_catalog` antes da migration | PASS; migration recusada com `RESET_SKILL_TREE_PREFLIGHT_DRIFT`, exit esperado 3; core ausente após rollback. |
| `npx --no-install vitest run src/test/habilidadesHubReset.test.tsx src/test/loadoutEntry.test.ts` | PASS; 2 arquivos, 9 testes, exit 0. Ordem salva, custo/recarga, tipo `heal` versus `utility`, gate de classe, talentos sem painel de combate e limiar 10/11. |
| `npx --no-install vite build` | PASS, exit 0; aviso existente de Browserslist antiga/chunks grandes. |
| `npx --no-install tsc --noEmit -p tsconfig.app.json` | REPROVADO global, exit 2: 44 erros fora dos arquivos tocados; nenhum erro em arquivos HUB/RESET/teste deste escopo. Log: `%TEMP%/habilidades-reset-tsc-20261021.log`. |
| `npx --no-install eslint` nos componentes/hooks/páginas/teste tocados | REPROVADO, exit 1: 37 ocorrências `no-explicit-any` em arquivos que já usavam `any`; a nova ocorrência introduzida foi removida. |

Cluster local `C:\Users\Murillo\AppData\Local\Temp\skills-reset-pg-20261021-task68f5`, porta 55439: parado com `pg_ctl stop -m immediate`, exit 0. Arquivos de dados e `server.log` foram preservados; junction `node_modules` não foi alterada.

Comandos centrais no banco isolado `skill_reset_retest` (PowerShell, `psql.exe` de PostgreSQL 17; cada comando teve exit 0):

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -h 127.0.0.1 -p 55439 -U postgres -d skill_reset_retest -v ON_ERROR_STOP=1 -f src/test/sql/reset_skill_tree_fixture.sql
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -h 127.0.0.1 -p 55439 -U postgres -d skill_reset_retest -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20261021142713_reset_skill_tree_level10.sql
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -h 127.0.0.1 -p 55439 -U postgres -d skill_reset_retest -v ON_ERROR_STOP=1 -1 -f src/test/sql/reset_skill_tree_assert.sql
```

No banco `skill_reset_preflight`, a mesma fixture seguida de `ALTER FUNCTION public.reset_skill_tree() SET search_path=pg_catalog` fez a migration sair com exit 3 esperado; `to_regprocedure('app_private.reset_skill_tree_core()') IS NULL` retornou `t`.

## Limites

PASS é local e isolado; não prova schema/API publicados após aplicar a migration. O preflight exige a definição/hash/ACL acima e recusa drift. Batalhas antigas seguem snapshots já gravados; a verificação SQL provou que o reset não atualiza o snapshot do fixture, enquanto replay/cursor do motor permanecem sob teste do MOTOR/root. Nenhum teste visual em navegador ou leitor de tela foi executado pelo worker.
