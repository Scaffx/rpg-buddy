# Reteste frio final — renovação de Auth

**Veredito:** aprovo tecnicamente o SHA congelado `b29a3f340efb665c99e3308cf6bf2f7759c461d1` para o QA final de navegador. Esta aprovação cobre o diff da frente de Auth contra `20d127516dec179639dc650c920aafcf8562de9a` e a revisão específica após `73aa106769b2bee1e4294aaaa88ccec47a9b9e5b`. Não é aprovação de publicação: faltam `refreshSession` real na conta de teste, expiração real no servidor e fechamento do diagnóstico TypeScript global.

## Método e resultado

- Examinei o contrato `work/auth-renovacao-20261026/CONTRATO-REVISAO.txt`, o código/diff e os testes no SHA acima, sem usar relatórios dos builders. `git diff --check 20d1275 b29a3f3` passou. A árvore já continha `work/` não rastreado, que não foi alterado.
- `npx --no-install vitest run src/test/authRefreshFinalReview.test.tsx src/test/authRefreshRevision.test.tsx src/test/authDataGate.test.ts src/test/authClientQuarantineReview.test.ts src/test/authRefreshRetention.test.tsx`: **5 arquivos, 33 testes, exit 0**.
- Suítes complementares `authRefreshContinuity`, `authRefreshIndependent`, `authFocusExpiryFinal`, `authFocusStability`, `authLoadingRecovery`, `authRecoveryIndependent`: **6 arquivos, 66 testes, exit 0**.
- `npm run build`: **exit 0**. `npx --no-install tsc --noEmit -p tsconfig.app.json`: **exit 1** por diagnósticos em arquivos fora do diff desta frente, incluindo `CombatArena.tsx`, `ReportsPanel.tsx`, `useLeaderboard.ts` e `ProfilePage.tsx`; nenhum diagnóstico observado nos arquivos alterados de Auth. Não executei uma compilação da base isolada para afirmar equivalência exata dos erros.

## Verificação dos três defeitos reproduzidos antes

1. **Resposta A após limpeza/aprovação B:** `AuthDataGate.clear()` avança a geração e cancela as requisições em voo (`src/lib/authDataGate.ts:36-50`); `fetch` combina cancelamento, `AbortSignal` e checagem de geração/âncora antes de entregar a resposta (`:166-190`). O teste de resposta tardia em `authRefreshFinalReview` passou. Uma nova âncora aprovada também invalida A (`:33-36`).
2. **Foco roubado de interação posterior:** a fronteira registra `focusin` e gestos de rolagem durante a retenção e só restaura foco/rolagem se não houve escolha posterior (`src/components/auth/AuthContinuityBoundary.tsx:43-91`). Os testes de foco e rolagem passaram. O foco preservado pertence ao mesmo nó retido, e a troca de identidade incrementa `epoch` e descarta a árvore (`src/hooks/useAuth.tsx:180-190`).
3. **Canal A reconectado sob B:** `clear()` marca canais para retirada; `pauseRealtime` desconecta e chama `removeAllChannels`, aguardando a limpeza antes de permitir `setAuth`/`connect` (`src/lib/authDataGate.ts:36-115`). O cliente recusa autenticação candidata e conexão antes da aprovação (`src/integrations/supabase/client.ts:25-39`). Testes com `RealtimeClient` e com o módulo cliente passaram, inclusive canal B criado durante limpeza e limpeza pendente.

## Restante do contrato observado no código

- Bootstrap e candidatos passam por `getUser(token)` fora do callback de Auth; UID, expiração e vínculo `sub`/`iss`/`session_id` são validados antes da adoção (`src/hooks/useAuth.tsx:203-225`). Metadados locais não concedem admin: `useIsAdmin` consulta `user.app_metadata` do usuário remoto confirmado.
- Na renovação do mesmo vínculo, a sessão antiga fica exposta apenas enquanto `exp` é válido. Se expira durante a confirmação, a fronteira entra em retenção com estado React oculto e `inert`; candidato confirmado no prazo restaura a árvore. `expire()` pausa o Realtime sem retirar canais desse vínculo, e a aprovação posterior os reconecta (`src/hooks/useAuth.tsx:98-112, 137-175`; `src/lib/authDataGate.ts:29-35, 88-115`).
- Logout, retry, falha, timeout e desmontagem limpam autorização; o watchdog de 15 segundos, versões monotônicas e tratamento de duplicatas impedem resposta tardia ou extensão indevida do prazo (`src/hooks/useAuth.tsx:59-67, 113-136, 237-295, 306-314`). O gate mantém Auth acessível, bloqueia dados privados sem token aprovado, respeita abort e conserva chamadas com a chave pública sujeitas a RLS (`src/lib/authDataGate.ts:117-190`).
- Canais reais do projeto aparecem em mensagens diretas, inscrições e masmorras. A barreira global do cliente e a retirada em troca de vínculo abrangem essas instâncias; efeitos/timers de componentes retidos não foram tratados como prova de ausência de atividade, por isso o gate de rede é necessário.

## Limites para o coordenador

Este foi um reteste local de código e testes simulados, sem navegador, banco, instalação, commit, push ou deploy. A suíte não prova `refreshSession` real nem expiração real do servidor; o coordenador precisa executar esse QA e decidir o estado do `tsc` antes de publicar. Não encontrei defeito concreto restante no escopo revisado do SHA congelado.
