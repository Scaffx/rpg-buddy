# Follow-up: remount com cache stale na mesma geração Auth — 28/10/2026

[Certo] Base/HEAD `59148d56ea42b0ff9890aecdb0b493fde32695ae`, branch `Scaffx/rpg-hordas-continuas-20261028`. Este follow-up alterou somente `src/hooks/useAutoAdventure.ts`, `src/test/AutoAdventureSessionContinuity.test.tsx` e criou este relatório. O WIP anterior e os arquivos das outras frentes foram preservados.

## Reprodução antes da correção

[Certo] A asserção integrada usa `AuthProvider` e `AuthContinuityBoundary` reais com SDK/RPC mockados. Após nova sessão confirmada da mesma conta, a etapa 9 é aceita por uma única RPC nova. O teste então desmonta apenas `Adventure`, invalida o cache com `refetchType: 'none'` e remonta `Adventure` na mesma geração Auth. Antes do ajuste, esperava quatro chamadas RPC acumuladas e obteve três; o cache stale não foi atualizado. O teste de `TOKEN_REFRESHED` normal continuou passando.

## Correção e verificação

[Certo] `refetchOnMount` agora suprime a busca automática com cache apenas enquanto `revalidatedGenerations` ainda não marcou a revalidação inicial daquela geração. Após o processamento, volta a usar a regra anterior: cache sem âncora ou stale causa refetch no remount. A revalidação inicial não duplica RPC, e a etapa 10 da busca posterior é aceita após o remount.

[Certo] Após o ajuste, `npm test -- --run src/test/AutoAdventureSessionContinuity.test.tsx src/test/AutoAdventureSyncRace.test.tsx src/test/AutoAdventureSync.test.tsx src/test/AutoAdventureAdvanceCache.test.tsx src/test/AutoAdventureAccountSwitch.test.tsx src/test/authRefreshContinuity.test.tsx` passou: **6 arquivos, 30 testes**. `npx eslint src/hooks/useAutoAdventure.ts src/test/AutoAdventureSessionContinuity.test.tsx` e `git diff --check` saíram com código 0.

| Arquivo | SHA-256 após CRLF→LF |
| --- | --- |
| `src/hooks/useAutoAdventure.ts` | `a86ed8ce74c9718976c3173502b56ad29c95ac708685af5f8f811d23741bc213` |
| `src/test/AutoAdventureSessionContinuity.test.tsx` | `f2094207e5104e107aaac6bff18d933d19ce39f3c46e87b2250faeba2bf66dc9` |

[Certo] Limite: a integração usa React/TanStack/Auth e boundary reais em jsdom, com SDK/RPC mockados; não prova comportamento de PostgREST ou navegador autenticado. Não houve SQL remoto, instalação, commit, push ou deploy. O coordenador fará a suíte final e o closeout.
