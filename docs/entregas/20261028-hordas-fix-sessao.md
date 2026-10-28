# Correção focada: nova sessão da mesma conta — 28/10/2026

## Escopo e resultado

[Certo] Checkout `C:/Users/Murillo/orca/workspaces/rpg-buddy/rpg-auth-foco-20261026`, branch `Scaffx/rpg-hordas-continuas-20261028`, HEAD/base `59148d56ea42b0ff9890aecdb0b493fde32695ae`. A correção alterou apenas `src/hooks/useAutoAdventure.ts` e `src/test/AutoAdventureSyncRace.test.tsx`, criou `src/test/AutoAdventureSessionContinuity.test.tsx` e este relatório. O WIP preexistente dos demais arquivos permaneceu intacto.

[Certo] A falha residual P1 descrita em `20261028-hordas-revisao-delta.md` foi reproduzida antes do fix. Com etapa 8, resumo pendente e cache fresco, `SIGNED_IN` da mesma UID com outro `session_id` passou por `getUser(token)` e remontou `AuthContinuityBoundary`, mas a RPC de revalidação não iniciou: o teste integrado esperava a terceira chamada e observou apenas duas. O teste isolado anterior também falhou após corrigir sua falsa continuidade de montagem: a instância realmente remontada permaneceu na etapa 8.

[Certo] `trackIdentity` agora marca a nova geração confirmada no `QueryClient`, independentemente do `previousIdentity` local que se perde no remount. A primeira montagem dessa geração limpa o resumo anterior, cancela a consulta antiga e invalida a chave da conta uma única vez; `refetchOnMount` não dispara uma segunda consulta quando há cache. O estágio anterior permanece visível com `isFetching` e cache invalidado até a resposta nova. A checagem de identidade antes de invalidar impede que uma troca posterior inicie uma consulta velha. Query keys seguem como conta e tipo; nenhum token foi adicionado a chaves ou logs.

[Certo] A reprodução integrada após o fix verificou 3 chamadas de RPC no total: etapa 8 inicial, pedido antigo pendente, e uma única RPC nova após `getUser(token)` da sessão B. A etapa 9 foi aceita, o pedido antigo teve `AbortSignal` abortado e seu retorno de etapa 1 não substituiu o cache nem refez o resumo. A árvore real de `AuthProvider` e `AuthContinuityBoundary` desmontou a cena anterior e montou a nova (`mounts=2`, `unmounts=1`). O resumo passou de duas vitórias para `null` durante a revalidação, sem erro visível.

[Certo] Um teste separado de `TOKEN_REFRESHED` com o mesmo `session_id` verificou `getUser(token)` do token renovado, pausa do Realtime enquanto a confirmação estava pendente, retomada com o token confirmado, uma única montagem da cena, nenhum unmount e nenhuma RPC adicional. O teste isolado anterior agora usa `key={epoch}` para produzir remount de fato e espera duas montagens; ele não afirma mais representar sozinho o boundary real.

## Verificação

[Certo] Antes do fix: `AutoAdventureSessionContinuity.test.tsx` falhou na ausência da terceira RPC; `AutoAdventureSyncRace.test.tsx` falhou ao exigir a etapa 9 após remount. Após o fix, `npm test -- --run src/test/AutoAdventureSessionContinuity.test.tsx src/test/AutoAdventureSyncRace.test.tsx src/test/AutoAdventureSync.test.tsx src/test/AutoAdventureAdvanceCache.test.tsx src/test/AutoAdventureAccountSwitch.test.tsx src/test/authRefreshContinuity.test.tsx`: **6 arquivos, 30 testes passaram**. `npx eslint` nos três arquivos de código alterados e `git diff --check`: código 0. Não há P1/P2 pendente neste cenário coberto.

| Arquivo | SHA-256 após CRLF→LF |
| --- | --- |
| `src/hooks/useAutoAdventure.ts` | `486ea3bf5d1aa4bd1996aaf12e92660ca02b29587b522e8dfdf08a58e7433257` |
| `src/test/AutoAdventureSyncRace.test.tsx` | `b6e7c6fa1d52b9683449a433c503cbde0ff9b8beecd1ca26f368219544a7b6ac` |
| `src/test/AutoAdventureSessionContinuity.test.tsx` | `905bda7d11484b18c52c2eff450dd8ad4587c3c28afa23f51ffbd5ef9cfd3cd3` |

[Certo] Os hashes LF das partes de SQL e economia conferem com o relatório anterior: migração `858c6600d4ec72fb45a833b1cc6b9cc20013497baa5c48f4782219e75e72a39b`, teste `draw.sql` `3416055cbc9e7032a7588577a191c01411015be04e9945f3f96c08c03a93191c`, `MECHANICS.md` `e07eec9b566f75286b7befb91607a47ff32e82a53200fe531d981204417433f6`.

## Limites

[Certo] Os testes usam React, TanStack Query, `AuthProvider` e `AuthContinuityBoundary` reais, com SDK Auth, RPC e Realtime mockados em jsdom. Eles não validam PostgREST, sessão autenticada em navegador, função SQL viva nem produção. Não houve SQL remoto, navegador, instalação, commit, push ou deploy; o coordenador fará a revisão do delta e a suíte final.
