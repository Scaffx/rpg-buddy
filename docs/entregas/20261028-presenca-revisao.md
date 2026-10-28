# BUG-55 — revisão independente a frio da presença

**Parecer: não aprovar nesta rodada.** Navegação entre rotas reinicia a cadência e perde a guarda de requisições da instância anterior. Há ainda um limite condicional de liveness se a Promise não liquidar após `abort()`; o mock de unidade não prova que isso ocorra depois da camada `authDataGate` no navegador. Nenhuma dessas observações demonstra a causa de qualquer incidente de Auth/504.

## Escopo e congelamento

- Worktree `C:/Users/Murillo/orca/workspaces/rpg-buddy/rpg-auth-foco-20261026`, branch `Scaffx/rpg-presenca-20261028`, `HEAD` base `c493e02bebe06d540b1f94bad3a3dde0d254be9e`.
- `src/hooks/usePresence.ts`: SHA-256 físico `6DEF66054E8755F98E8B92C71A23AA5C5189C65D6574F528F36C9718E26A9F7F`, conferido antes e após a leitura. Diff de produto contra o `HEAD`: só esse hook.
- Fontes examinadas: `CLAUDE.md`, diff e versão base do hook, `src/test/usePresence.test.tsx`, `src/hooks/useAuth.tsx`, `src/lib/authDataGate.ts`, cliente Supabase, `AppLayout`, rotas, RPC da migration, código instalado de `@supabase/supabase-js` e `@supabase/postgrest-js` 2.101.1, e [documentação oficial de `abortSignal`](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal). Não li os relatos do implementador ou de QA.

## Achados

### 1. P2 — troca de rota reinicia heartbeat e perde exclusão por UID

**Cenário.** Com a aba visível e o mesmo usuário confirmado, abrir Dashboard e navegar para Missions antes de 30 segundos. Cada página monta seu próprio `AppLayout` (`src/pages/Dashboard.tsx:456`, `src/pages/Missions.tsx:711`), que chama o hook em `src/components/AppLayout.tsx:60`. O `useRef(new Map())` em `src/hooks/usePresence.ts:24` pertence a cada instância; o novo efeito chama `beat()` de imediato em `:112`. O cleanup da instância anterior aborta sua chamada em `:119`, mas o novo hook não conhece a requisição antiga. Assim, a próxima chamada não espera os 30 segundos saudáveis e, se o transporte/servidor ignorar o abort, pode coexistir com a anterior para o mesmo UID. Navegar repetidamente gera uma RPC por montagem, além da cadência prevista.

**Evidência local.** O teste de remount em `src/test/usePresence.test.tsx:273-287` espera uma chamada imediata na montagem nova; ele só faz essa montagem depois de a chamada anterior ter terminado. Não cobre remount rápido com `controlledRpc(true)`, usado nos demais testes para simular abort ignorado. O estado de single flight não é compartilhado entre instâncias. Isto não altera a confirmação de identidade, mas não atende à cadência e à exclusão solicitadas para rotas/remount.

### 2. P3 condicional — temporizador de 15 s não limita uma Promise que ignora abort

**Cenário.** Uma RPC fica pendente e ignora o `AbortSignal`, como o próprio `controlledRpc(true)` dos testes permite. Em `src/hooks/usePresence.ts:59-63`, o timeout apenas chama `controller.abort()`. A entrada em `pendingByUser` só sai no `finally` (`:72-77`), e o retry só é agendado por `onSettled` (`:88-99`). Se a Promise não liquidar, não há nova tentativa, mesmo com a aba visível: depois de 90 s o indicador baseado em `isOnline` (`:129-132`) pode mostrar o usuário offline indefinidamente. O teste `src/test/usePresence.test.tsx:113-130` comprova que, aos 90 s, ainda há só uma chamada; ele força manualmente `settle(first)` para destravar a próxima.

**Contrato do SDK e limite da prova.** No `@supabase/postgrest-js` instalado, `abortSignal()` atribui o signal ao builder (`node_modules/@supabase/postgrest-js/src/PostgrestTransformBuilder.ts:593-595`), e o builder o passa ao fetch (`PostgrestBuilder.ts:143-149`). A camada `authDataGate` liquida o fetch ao abort por `Promise.race` (`src/lib/authDataGate.ts:171-189`), mesmo se o transporte artificial ignorar o sinal. Portanto, o teste de 90 s com RPC mockada prova a guarda de uma Promise pendente do hook, mas **não** demonstra travamento do fluxo normal pós-gate no navegador nem cancelamento de SQL já recebido pelo servidor. Existe um trecho anterior: `fetchWithAuth` aguarda `getAccessToken()` antes de chamar o fetch com o signal (`node_modules/@supabase/supabase-js/src/lib/fetch.ts:22-34`); `_getAccessToken()` aguarda `auth.getSession()` (`SupabaseClient.ts:533-540`). Nesse trecho o timeout do hook não limita a espera. A conclusão é condicional a um preflight que não liquida, sem prova de ocorrência em navegador ou produção.

## Contrato preservado e verificações

- A presença deriva o UID de `useAuth().user` (`src/hooks/usePresence.ts:21-22`). O provider só publica `user` após `getUser(token)` e conferir identidade/expiração (`src/hooks/useAuth.tsx:203-223`); `authDataGate` só libera data APIs para token aprovado (`src/lib/authDataGate.ts:127-169`). Não encontrei no diff concessão de Auth a estado em cache ou metadata de evento.
- No ciclo que permanece montado, a próxima chamada é agendada após a conclusão, com 30 s no sucesso e backoff de 30/60/120 s em erros retornados ou rejeitados. Os testes cobrem visibilidade, logout, troca de UID, StrictMode e resposta tardia dentro da mesma instância.
- `npm run test -- src/test/usePresence.test.tsx`: **11/11 passaram**. `npx eslint src/hooks/usePresence.ts src/test/usePresence.test.tsx`: **passou**. `git diff --check`: **passou**.
- `npx tsc --noEmit -p tsconfig.app.json`: **exit 2, 44 diagnósticos** no projeto; o diagnóstico em `usePresence.ts:68` é o nome da RPC ausente dos tipos gerados, já presente na chamada da versão base do hook. Esta revisão não atribui os demais erros ao diff.

## Limites e decisão

Os testes são jsdom com Supabase e Auth mockados; não exercitam PostgREST real, navegador autenticado, banco vivo nem implantação. A fonte SQL versionada de `update_my_last_seen()` não prova a definição viva em produção. O achado de troca de rota impede aprovação local do BUG-55 até que o dono do produto trate ou justifique explicitamente a cadência e exclusão entre montagens; o segundo item pede validação da fronteira anterior ao fetch, sem inferir falha de browser a partir do mock. Esta revisão não autoriza alteração de produto, merge ou deploy.
