# Revisão da recuperação de autenticação — 21/10/2026

## Falha corrigida

[Certo] A revisão começou no commit autoral `2acc64d28626f56ab3e6f3efd8b8f9424e4f60de`. Nele, `AuthProvider` confirmava com `getUser(access_token)` a sessão obtida por `getSession`, mas o callback de `onAuthStateChange` aceitava imediatamente `session.user` de qualquer evento com sessão. O teste independente do CENA reproduziu `getSession` pendente + `SIGNED_IN` com `app_metadata.role=admin` do storage: a UI virava admin antes de confirmação remota. Li esse teste no worktree CENA sem alterá-lo; não o executei como parte desta entrega.

[Certo] O código local instalado de `@supabase/auth-js` em `node_modules/@supabase/auth-js/src/GoTrueClient.ts` confirma a origem: `_recoverAndRefresh()` carrega `currentSession` do storage e emite `SIGNED_IN` mesmo sem solicitar novamente o usuário ao Auth quando a sessão ainda não precisa de refresh. `SIGNED_IN` não comprova, por si, a autenticidade do `session.user` recebido pelo listener. A [documentação de eventos](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) descreve o callback síncrono; a [documentação de `getUser`](https://supabase.com/docs/reference/javascript/auth-getuser) diz que ele consulta o servidor e aceita um JWT explícito.

## Correção

[Certo] `AuthProvider` agora trata toda sessão vinda de `getSession` ou de evento, inclusive `INITIAL_SESSION`, `SIGNED_IN` e `TOKEN_REFRESHED`, como candidata. Antes da confirmação, `user` e `session` expostos pelo contexto ficam nulos e `loading` verdadeiro, portanto `useIsAdmin` nega admin. A chamada `getUser(candidate.access_token)` roda em microtask após o callback síncrono, sem aquisição de segundo lock local pela forma com JWT explícito no SDK instalado. Só um usuário retornado pelo Auth com o mesmo `id` do candidato entra no contexto; seus `app_metadata` substituem os do storage.

[Certo] Uma versão monotônica descarta resultados de `getSession` ou `getUser` após evento posterior, retry, timeout ou unmount. `SIGNED_OUT` limpa imediatamente o contexto e vence a verificação pendente; `INITIAL_SESSION` tardio não substitui evento posterior. Cada confirmação tem watchdog de 15 segundos, e erro, rejeição, token/ID ausente ou divergência de ID mostram o estado de recuperação existente. O código não chama `signOut`, não limpa storage, não manipula `navigator.locks` e não usa `user_metadata` para admin. O backend RLS permanece como autoridade.

## Verificação

[Certo] O teste autoral real chama-se `src/test/authLoadingRecovery.test.tsx`; o nome `authSessionRecovery.test.tsx` citado no despacho não existia. `npx --no-install vitest run src/test/authLoadingRecovery.test.tsx`: exit 0, 13 testes. Casos: bootstrap com rejeição/retry; `SIGNED_IN` do storage sem admin prematuro; login confirmado enquanto `getSession` está pendente; `INITIAL_SESSION` com sessão; `TOKEN_REFRESHED`; eventos repetidos e resposta antiga; logout durante verificação; rejeição, timeout e divergência de `getUser`; StrictMode/unmount.

[Certo] `npx --no-install eslint src/hooks/useAuth.tsx src/test/authLoadingRecovery.test.tsx`: exit 0, zero erros e um aviso preexistente `react-refresh/only-export-components` em `useAuth.tsx`. `npx --no-install tsc -p tsconfig.app.json --noEmit`: exit 2, 44 diagnósticos globais, nenhum nos arquivos tocados, igual à baseline informada pelo coordenador. Nenhuma dependência ou lockfile mudou.

## Limites

[Certo] Os testes autorais usam mocks de Supabase em React/jsdom; não verificam a sessão publicada, o lock real do GoTrue, OAuth no navegador, nem a execução independente do teste do CENA. A revisão antes do rollout e a observação publicada pertencem ao coordenador. Eventos repetidos podem causar chamadas remotas repetidas de `getUser(jwt)`; a versão monotônica e o watchdog impedem que respostas antigas concedam acesso, mas não cancelam a requisição da biblioteca.
