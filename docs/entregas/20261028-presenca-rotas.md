# BUG-55 — correção P2 da montagem do heartbeat

## Escopo

- [Certo] Branch `Scaffx/rpg-presenca-20261028`, base `c493e02`. Alterações desta frente: `src/App.tsx`, `src/components/AppLayout.tsx` e este relatório.
- [Certo] O SHA-256 físico de `src/hooks/usePresence.ts` permanece `6DEF66054E8755F98E8B92C71A23AA5C5189C65D6574F528F36C9718E26A9F7F`. O hook é de outra frente e não foi editado aqui.

## Correção e segurança

- [Certo] `AppRoutes` chama `usePresenceHeartbeat()` uma única vez, dentro de `AuthProvider` e antes de `AuthContinuityBoundary`, `Suspense` e `Routes`. `AppLayout` não importa nem chama o hook. Trocar páginas monta outro layout, mas preserva a instância do heartbeat e sua guarda por UID.
- [Certo] O hook lê `useAuth().user?.id`; `AuthProvider` publica o usuário após `getUser(token)` e aprovação do token em `authDataGate`. A mudança não concede autorização a cache nem a metadata de evento.
- [Certo] O efeito do hook depende de `userId`, não da identidade do objeto `user`. A atualização do mesmo UID sem um intervalo nulo não reinicia o ciclo; logout, troca de UID, aba oculta ou desmontagem limpam timers e abortam a requisição conforme o hook existente. Uma revalidação que retire temporariamente o usuário confirmado pausa o ciclo por segurança e o retoma após nova confirmação.
- [Certo] Nenhum provider, boundary, SQL, SDK, configuração, dependência ou fluxo de economia foi alterado.
- [Certo] Checklist React: a chamada do hook é incondicional em um componente estável, o efeito continua dependente do UID primitivo, as páginas seguem lazy e nenhuma UI, listener ou contexto adicional foi introduzido.

## Validação local

- [Certo] Contrato de fonte: há uma chamada de `usePresenceHeartbeat()` em `AppRoutes`, nenhuma em `AppLayout`, e `AppRoutes` fica sob `AuthProvider` e fora de `Routes` e `Suspense`.
- [Certo] `npx eslint src/App.tsx`: exit 0. `npx eslint src/App.tsx src/components/AppLayout.tsx`: exit 1 por `any` em `AppLayout.tsx:105`, presente no `HEAD`; também há aviso preexistente de dependência de `closeRestTimer` em `:216`. Com a regra de `any` desativada só para aferir o diff, exit 0 com esse aviso.
- [Certo] `git diff --check`: exit 0, com avisos do Git sobre conversão LF/CRLF.
- [Certo] `npx vitest run src/test/usePresence.test.tsx src/test/authFocusExpiryFinal.test.tsx --reporter=dot`: 15/15 testes passaram em dois arquivos no estado compartilhado após a mudança.
- [Certo] `npx tsc --noEmit -p tsconfig.app.json --pretty false`: exit 2, com 44 diagnósticos no projeto e nenhum em `src/App.tsx` ou `src/components/AppLayout.tsx`.
- [Certo] `npx vitest run src/test/presenceRouting.test.tsx --reporter=dot`: 2/2 testes passaram no arquivo do outro worker. Cobrem navegação com RPC pendente, cadência após liquidação, refresh confirmado do mesmo UID e logout. O ambiente de teste emitiu avisos de React Router v7 e i18next; as asserções passaram.

## Limites

- [Certo] A correção P2 preserva a instância durante navegação entre rotas. Um reload completo da página ou remontagem de `AppRoutes` por erro acima dele cria uma nova instância.
- [Certo] O P3 da revisão continua condicional: antes de `authDataGate.fetch`, o SDK pode aguardar `getAccessToken()`/`auth.getSession()`; o timeout do hook apenas aborta e a guarda só sai quando a Promise liquida. O mock pendente não comprova travamento no navegador nem causa de Auth 504. Esta frente não muda esse preflight.
- [Certo] Verificação local de fonte e jsdom não substitui browser autenticado, PostgREST real, função SQL viva ou produção. Sem commit, push, deploy, restart ou escrita remota.
