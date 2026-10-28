# BUG-55 fixP2 — regressão de presença entre rotas

## Escopo

- [Certo] Branch `Scaffx/rpg-presenca-20261028`, SHA inicial `c493e02bebe06d540b1f94bad3a3dde0d254be9e`; `git fetch origin` concluiu sem saída. Este worker criou apenas `src/test/presenceRouting.test.tsx` e este relatório. `App.tsx`, `AppLayout.tsx`, `usePresence.ts` e `usePresence.test.tsx` eram de outras frentes e não foram editados aqui.
- [Certo] O teste monta `App` e `AuthProvider` reais, com `getUser(token)` simulado e exigido na asserção. As páginas `Dashboard` e `Missions` são leves, mas ambas usam `AppLayout` real; somente filhos pesados e hooks periféricos do layout foram simulados.

## Resultado

- [Certo] A primeira regressão cruza `/` → `/missions` → `/` com a primeira RPC pendente. Confirma três montagens e duas desmontagens do layout, nenhuma nova RPC, nenhum abort por navegação e máximo de uma RPC em voo. Depois de liquidar a RPC, cruza duas rotas novamente e confirma que a próxima chamada ocorre 30.000 ms após o settle, sem reiniciar a cadência.
- [Certo] A segunda regressão envia `TOKEN_REFRESHED` com token novo, mesmo UID e binding de sessão, verifica segunda confirmação `getUser(token)` e preservação da RPC pendente; em seguida, `SIGNED_OUT` aborta a requisição e sua conclusão tardia não agenda outra chamada.
- [Certo] `npx vitest run src/test/usePresence.test.tsx src/test/freeAccessRoutes.test.tsx --reporter=dot`, antes do novo teste, passou **19/19 em 2 arquivos**. A primeira execução do teste novo não coletou casos porque uma tentativa de `vi.mock` com caminho variável foi elevada pelo Vitest; o mock foi trocado por caminhos literais no arquivo de teste. Após isso, `npx vitest run src/test/presenceRouting.test.tsx --reporter=verbose` passou **2/2**.
- [Certo] Após a última ampliação da navegação, `npx vitest run src/test/presenceRouting.test.tsx src/test/usePresence.test.tsx src/test/freeAccessRoutes.test.tsx --reporter=dot` passou **21/21 em 3 arquivos**. `npx eslint src/test/presenceRouting.test.tsx` passou sem diagnósticos.
- [Certo] `npm run lint` terminou com exit 1 e **656 erros, 32 avisos** globais, sem diagnóstico para o teste novo. `npx tsc --noEmit -p tsconfig.app.json --pretty false` imprimiu **25 erros TS** globais e nenhum em `presenceRouting.test.tsx`, `App.tsx`, `AppLayout.tsx` ou `usePresence.ts`; o comando foi capturado via pipeline PowerShell, cujo exit final não representa o exit do compilador.

## Limites

- [Certo] São testes jsdom com relógio, RPC e Auth simulados. Eles verificam o roteamento e a cadência no App local, sem provar navegador autenticado, transporte PostgREST, SQL vivo ou produção.
- [Certo] O teste novo foi criado quando o fix de `App.tsx`/`AppLayout.tsx` já estava presente; não houve execução vermelha contra o código anterior. A montagem real do layout e a contagem de RPC tornam a regressão sensível à volta do heartbeat para o layout, mas esta última afirmação é inferência do fluxo de montagem.
