# BUG-55 — regressões locais do heartbeat de presença

## Escopo e base

- [Certo] Branch `Scaffx/rpg-presenca-20261028`, base `c493e02bebe06d540b1f94bad3a3dde0d254be9e` em 2026-10-28. Este worker editou somente `src/test/usePresence.test.tsx` e este relatório; a implementação de `src/hooks/usePresence.ts` pertence a outro worker.
- [Certo] `git fetch origin` concluiu sem saída; `node_modules` é uma junction para `C:\Users\Murillo\Desktop\RPG-Buddy\rpg-buddy\node_modules` e não foi instalado nem alterado.

## Evidência de regressão e correção

- [Certo] A primeira tentativa de `npx vitest run src/test/usePresence.test.tsx --reporter=verbose` não coletou testes porque a junction não contém `@testing-library/dom`; a suíte foi reescrita com `createRoot` e `act`, já usados no repositório, sem mudar dependências.
- [Certo] Antes da alteração do hook, o mesmo comando coletou 9 testes: **7 falhas esperadas e 2 passes**. A RPC controlada ainda pendente após 90.001 ms tinha sido chamada 3 vezes, contra 1 esperada, reproduzindo a sobreposição do BUG-55.
- [Certo] Após a alteração do hook e a ampliação da suíte, `npx vitest run src/test/usePresence.test.tsx --reporter=verbose` passou **11/11**. `npx eslint src/test/usePresence.test.tsx` passou sem saída.
- [Certo] A bateria `npx vitest run src/test/usePresence.test.tsx src/test/authFocusExpiryFinal.test.tsx --reporter=dot` passou **15/15 em 2 arquivos**. `git diff --check` não apontou erro de whitespace; emitiu apenas o aviso de conversão LF/CRLF no arquivo de produto de outro worker.

## Contratos cobertos

- [Certo] Uma RPC que ignora `abortSignal` segue pendente por mais de 90 s sem nova chamada; o sinal é abortado aos 15 s e o ciclo só volta após o settle. Após sucesso, a próxima chamada ocorre 30 s depois.
- [Certo] Resposta `{ error }`, rejeição de promessa, timeout com abort que liquida e backoff de 30/60/120/120 s são exercitados com relógio falso.
- [Certo] `visibilitychange` oculto/visível cobre tanto abort que liquida quanto transporte que ignora abort; logout, unmount e troca de UID abortam a requisição antiga e ignoram sua conclusão tardia.
- [Certo] Um novo objeto `user` com o mesmo UID não reinicia a RPC pendente. StrictMode e remount mantêm apenas um ciclo ativo após o replay do efeito.

## Limites

- [Certo] Os testes usam jsdom, mock de `supabase.rpc`, `AbortSignal` e timers falsos. Eles não verificam navegador autenticado, transporte real do PostgREST, função SQL viva, resposta de rede ou produção.
- [Certo] `npx tsc --noEmit -p tsconfig.app.json --pretty false` terminou com exit 1 por diagnósticos globais do projeto. Não houve diagnóstico em `src/test/usePresence.test.tsx`; o diagnóstico em `src/hooks/usePresence.ts:68` diz que `update_my_last_seen` não está nos tipos gerados da RPC. A mesma chamada já existia no hook do SHA base; este worker não alterou código de produto nem tipos gerados.
