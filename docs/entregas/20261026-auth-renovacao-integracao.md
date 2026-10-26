# Integração da renovação Auth — 26/10/2026

## Escopo e estado

[Certo] Trabalho local no worktree `rpg-auth-foco-20261026`, HEAD `8a1ff387e9e2bc9745048d3d7ff8e6499afb0976`, com WIP de outras frentes presente. Nenhum commit, push, deploy, browser, banco ou instalação foi feito por esta entrega.

[Certo] O contrato de revisão exige manter a árvore durante a confirmação da mesma sessão após `exp`, com identidade pública nula, I/O bloqueado e prazo máximo de 15 s. O ajuste de integração permaneceu nos arquivos de propriedade delegada; o coordenador ampliou expressamente a propriedade mínima para `src/integrations/supabase/client.ts` e para uma asserção em `src/test/authRefreshRetention.test.tsx`.

## Ajustes

- [Certo] `AuthDataGate.pauseRealtime` agora chama `disconnect()` durante a própria chamada de pausa. Uma barreira com `Promise.allSettled` aguarda todas as desconexões já iniciadas, inclusive quando uma falha, antes de permitir a retomada. Os epochs e a checagem do token aprovado continuam impedindo reconexão de uma sessão revogada ou substituída.
- [Certo] O cliente passa `authDataGate.fetch` também para a opção `realtime.fetch`. A versão instalada de `RealtimeClient` aceita essa opção e `RealtimeChannel._fetchWithTimeout` a usa no fallback HTTP de broadcast. Assim, um `channel.send()` com Bearer antigo após `clear()`/pausa rejeita antes da rede, mesmo se o Realtime conservar `accessTokenValue` antigo.
- [Certo] O status acessível da `AuthContinuityBoundary` usa `t('app.confirming_session')` com a instância i18n do app. A chave foi adicionada a pt, en, es, ru e zh, sem mudança de layout ou dependência.
- [Certo] O caso independente de expiração agora exige `user/session` públicos nulos, `loading=true`, `authError=false`, status acessível e árvore retida/inert durante a quarentena; aceita `getUser(novo JWT)` da mesma sessão dentro do prazo e verifica o mesmo rascunho montado. No ciclo seguinte, espera os 15 s originais e confirma que uma resposta posterior não restaura a identidade. Outros casos independentes seguem cobrando falha e logout.
- [Certo] A asserção de status no teste de retenção usa `i18n.t('app.confirming_session')`, pois o idioma detectado pelo jsdom pode ser inglês. As asserções de identidade, ocultação, rede, montagem, estado, foco e rolagem foram preservadas.

## Provas locais

- [Certo] `npx --no-install vitest run src/test/authRefreshIndependent.test.tsx src/test/authDataGate.test.ts src/test/authRefreshRetention.test.tsx src/test/authRefreshExpiredBoundary.test.tsx src/test/authRefreshContinuity.test.tsx src/test/authClientQuarantineReview.test.ts --reporter=dot`: 52/52 testes, 5 arquivos encontrados pelo Vitest, exit 0, sem rejection não tratada. O arquivo `authRefreshExpiredBoundary.test.tsx` já não existia quando a suíte final rodou; sua ausência não é contada como prova.
- [Certo] `npx --no-install eslint src/lib/authDataGate.ts src/components/auth/AuthContinuityBoundary.tsx src/integrations/supabase/client.ts src/test/authRefreshIndependent.test.tsx src/test/authRefreshRetention.test.tsx`: exit 0.
- [Certo] JSON dos cinco idiomas carregou e retornou a nova chave; `npx --no-install vite build`: exit 0, 4006 módulos transformados.
- [Certo] `npx --no-install tsc --noEmit -p tsconfig.app.json`: exit 2, 67 diagnósticos em outros arquivos, zero nos cinco arquivos TypeScript/TSX tocados nesta entrega. O typecheck global não está verde.

## Limite

[Certo] As provas usam mocks e jsdom; o teste do revisor exercita o `RealtimeClient` instalado e o fallback HTTP, mas não prova WebSocket, expiração real no servidor ou preservação visual em navegador autenticado. A validação final da conta de teste e a decisão de publicação cabem à coordenação, conforme o contrato.
