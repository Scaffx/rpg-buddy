# BUG-55 — revisão final independente da presença

**Parecer: seguro para integrar a correção local sob os blobs congelados abaixo.** O P2 de montagem por rota da revisão anterior foi resolvido. Não encontrei bug concreto adicional que impeça a integração; este parecer não certifica o comportamento em navegador autenticado, PostgREST real ou produção.

## Escopo e fonte

- Worktree `C:/Users/Murillo/orca/workspaces/rpg-buddy/rpg-auth-foco-20261026`, branch `Scaffx/rpg-presenca-20261028`, `HEAD` base `c493e02bebe06d540b1f94bad3a3dde0d254be9e`.
- Blobs conferidos antes e após a revisão e os testes: `src/App.tsx` `5853f7be7e000d9edc73eb86a42d33efc3862f9e`; `src/components/AppLayout.tsx` `539fff6b8477e1c8a4ba2dd3207395e190eea21d`; `src/hooks/usePresence.ts` `df70361c622f0665b976fb0dbcddb9adfd57a56f`.
- Li `CLAUDE.md`, o diff contra `HEAD`, a fonte dos três arquivos, o parecer anterior, `useAuth.tsx`, `authDataGate.ts`, os dois testes focados e o trecho instalado do SDK relevante ao preflight. Esta revisão não alterou produto, testes, harness, Auth ou dependências.

## Reavaliação do P2

- `src/App.tsx:143-150,206-213`: `AppRoutes` chama `usePresenceHeartbeat()` uma vez sob `AuthProvider`, acima de `AuthContinuityBoundary`, `Suspense` e `Routes`. Navegar entre `Dashboard` e `Missions` troca a página e seu `AppLayout`, mas preserva a instância de `AppRoutes` e o `pendingByUser` do hook. `src/components/AppLayout.tsx` não importa nem chama o hook.
- `src/hooks/usePresence.ts:21-28,51-58,72-99,112-122`: a identidade efetiva do efeito é o UID primitivo. Um novo objeto `user` com o mesmo UID não reinicia timer ou chamada pendente; o próximo heartbeat saudável é agendado 30 s após a liquidação. Uma requisição ainda pendente impede outra na mesma instância.
- `src/test/presenceRouting.test.tsx`: com `App` montado, duas navegações desmontam e remontam layouts enquanto uma RPC permanece pendente; o teste observa uma única RPC, nenhum abort por navegação e a segunda chamada só 30 s após a liquidação. O outro caso cobre refresh confirmado do mesmo UID via `getUser(token)` sem abort nem chamada extra, seguido de logout que aborta e não reinicia o ciclo.

## Auth, pausa e limite P3

- `src/hooks/useAuth.tsx:150-175,203-223,254-264`: `user` é publicado após `getUser(token)`, validação de UID e expiração; a mudança de montagem não usa metadata de evento nem storage como identidade. `src/lib/authDataGate.ts:127-169` exige token aprovado para dados privados. O gate de `ProtectedRoute` e as rotas administrativas em `src/App.tsx:83-115,184-191` não foram alterados.
- `src/hooks/usePresence.ts:101-122`: aba oculta limpa timer e aborta a chamada; logout zera UID, limpa o ciclo e aborta. Resposta tardia não agenda chamada após logout. Esses casos passam nos testes do hook. Se a revalidação de Auth remover temporariamente `user`, o ciclo pausa até nova confirmação.
- O P3 anterior continua **condicional**: em `src/hooks/usePresence.ts:59-76`, 15 s abortam o signal, mas a guarda só é removida quando a Promise liquida. No SDK instalado, `fetchWithAuth` espera `getAccessToken()` antes de chamar o fetch com signal (`node_modules/@supabase/supabase-js/src/lib/fetch.ts:22-34`); `_getAccessToken()` espera `auth.getSession()` (`SupabaseClient.ts:533-540`). Após entrar em `authDataGate.fetch`, a espera do fetch é liquidada por abort via `Promise.race` (`src/lib/authDataGate.ts:171-189`). A Promise artificial que ignora abort comprova o limite lógico do hook, mas não uma espera sem liquidação no preflight real, nem um defeito observado no navegador ou em produção. Sem essa prova, não elevo o P3 a bloqueio.

## Verificação e decisão

- `npx vitest run src/test/usePresence.test.tsx src/test/presenceRouting.test.tsx --reporter=dot`: **13/13**, 2 arquivos, exit 0. Avisos de React Router v7 e i18next no jsdom não afetaram as asserções.
- `npx eslint src/App.tsx src/hooks/usePresence.ts src/test/presenceRouting.test.tsx src/test/usePresence.test.tsx`: exit 0. `git diff --check`: exit 0, com avisos do Git sobre futura conversão LF/CRLF.
- A aprovação vale somente para os três hashes acima. Qualquer alteração nesses blobs invalida este parecer e exige nova verificação. Os testes usam Auth e RPC mockados em jsdom; a validação de navegador autenticado, PostgREST real, SQL vivo e implantação pertence à fronteira de QA/produção do coordenador. Sem commit, push, deploy, restart ou escrita remota nesta revisão.
