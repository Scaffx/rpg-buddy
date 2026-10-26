# Revisão fria final da renovação Auth — 26/10/2026

[Certo] Base comparada: `20d127516dec179639dc650c920aafcf8562de9a`. HEAD de produto congelado: `73aa106769b2bee1e4294aaaa88ccec47a9b9e5b`. Escopo lido: `CLAUDE.md`, `CONTRATO-REVISAO.txt`, diff e código de `useAuth`, `AuthContinuityBoundary`, `App`, cliente Supabase, `AuthDataGate`, SDK instalado e testes. Não li relatos de builders ou de outros revisores, não executei browser, banco, instalação, publicação, push nem deploy.

## Veredicto

[Certo] **Contrato não aprovado no HEAD.** Duas refutações independentes executadas falham: resposta privada iniciada com A é liberada depois de revogação/troca para B, e foco volta ao rascunho após o usuário escolher outro controle durante a quarentena. O teste novo fica vermelho de propósito para registrar as duas falhas até a correção de produto.

## Achados

### A1 — resposta privada antiga passa pela troca de identidade — alta

[Certo] Cenário: `AuthDataGate.approve(token-a)`, iniciar REST privado cujo `fetch` fica em espera, `clear()` por logout, `approve(token-b)` e só então resolver a resposta de A. `AuthDataGate.fetch` confere `permitted()` antes de despachar, mas em `src/lib/authDataGate.ts:114-116` devolve o `Response` sem conferir o token/epoch depois do `fetch`. Em `src/test/authRefreshFinalReview.test.tsx:29-42`, a asserção de rejeição falhou: a promise resolveu `Response 200` com payload de A. Esperado pelo contrato §6-7: não liberar resposta de pedido/identidade revogada. Impacto: consumidor assíncrono ou cache que sobreviva ao logout pode receber dado privado anterior; RLS no servidor não retira a resposta já iniciada. O teste não prova exibição em uma tela específica.

### A2 — restauração de foco rouba interação posterior — média

[Certo] Cenário: input do rascunho focado, quarentena suspende a árvore, usuário foca o botão externo de continuação, confirmação da mesma sessão resolve. `AuthContinuityBoundary` restaura sempre `saved.focused` em `src/components/auth/AuthContinuityBoundary.tsx:53-54`, sem verificar se outro elemento ganhou foco. Em `src/test/authRefreshFinalReview.test.tsx:44-66`, a asserção falhou: `document.activeElement` terminou no input antigo, não no botão focado depois. Esperado pelo contrato §9: preservar foco somente sem tomar uma interação posterior. A prova é React/jsdom, sem QA visual.

### A3 — canal Realtime antigo persiste após disconnect — risco de integração, ainda sem entrega de evento provada

[Certo] O teste de `src/test/authRefreshFinalReview.test.tsx:68-86` usa `RealtimeClient` instalado: `disconnect()` preserva `dm-account-a` em `getChannels`; após aprovar B, `resumeRealtime` chama `setAuth(token-b)` e `connect()` porque `hasChannels()` permanece verdadeiro. O mecanismo está em `src/lib/authDataGate.ts:37-57`, `node_modules/@supabase/realtime-js/dist/module/RealtimeClient.js:195-210,424-437` e o cliente do app chama `resumeRealtime` em `src/hooks/useAuth.tsx:85-88,159-160`. [Provável] Na troca A→B, a reconexão pode ocorrer antes do cleanup de hooks com canais de A; verificar a ordem no navegador e impedir reentrada de canal de outra identidade. Este teste confirma o transporte e a retenção de canal, não uma entrega de mensagem ou um vazamento de linha protegida por RLS.

## Fronteiras revisadas

[Certo] `useAuth.tsx:23-49,171-219,231-258` exige `getUser(jwt)` fora do callback, compara UID remoto, exp do JWT e binding `sub/iss/session_id` para continuidade; metadata local não concede admin nesse caminho. `useAuth.tsx:130-146,238-258,269-278` mantém deadline absoluto em duplicatas, oculta na expiração e tenta retomada da mesma âncora. `useAuth.tsx:111-129,248-249,279-289` invalida confirmações tardias em falha/logout/desmontagem. São conclusões de leitura e dos testes locais, sem JWT real de servidor nesta revisão.

[Certo] `App.tsx:82-114,142-194,198-212` coloca a fronteira antes de `Routes`/hooks protegidos e preserva a árvore durante Suspense; guard exige usuário confirmado e Admin consulta `useIsAdmin`. `AuthDataGate` libera Auth e a chave pública exata, segura candidatos, respeita abort e prazo antes do despacho (`src/lib/authDataGate.ts:70-116`). A lacuna A1 é posterior ao despacho. O cliente instala `global.fetch`, `realtime.accessToken` e o veto de `setAuth` candidato antes de o `AuthProvider` montar (`src/integrations/supabase/client.ts:14-39`); isso foi confrontado com `SupabaseClient.ts:327-357,533-540,592-615` do SDK local. Não atribuo a Suspense bloqueio de efeitos, timers ou rede.

## Execução e limites

[Certo] `npx --no-install vitest run src/test/authRefreshFinalReview.test.tsx --reporter verbose`: exit 1, 1 passou (SDK real), 2 falharam com as evidências A1 e A2. `npx --no-install eslint src/test/authRefreshFinalReview.test.tsx`: exit 0.

[Certo] `npx --no-install vitest run src/test/authDataGate.test.ts src/test/authClientQuarantineReview.test.ts src/test/authRefreshContinuity.test.tsx src/test/authFocusExpiryFinal.test.tsx --reporter dot`: exit 1, 28 passaram, 2 falharam em `authFocusExpiryFinal.test.tsx:130,163`. Esses dois casos esperam `retry` no instante do exp; o HEAD retorna `loading` durante o prazo de retenção de 15 s exigido pelo contrato §3-4. São expectativas antigas, não prova de novo defeito de produto. Não alterei esses testes.

[Certo] `npx --no-install vitest run src/test/authRefreshIndependent.test.tsx src/test/authRefreshRetention.test.tsx src/test/authFocusColdReview.test.tsx --reporter dot`: exit 0, 26 passaram. Isso cobre cenários de provider/retention simulados, sem anular as duas refutações novas.

[Certo] Os cenários temporais usam relógio e JWTs simulados. A QA Cua com `refreshSession` real, foco/scroll no navegador, resposta de rede real, canal Realtime com evento e validação de produção pertencem à integração do coordenador. Não afirmo que servidor, RLS ou ambiente publicado foram validados aqui. Outros agentes editaram arquivos fora da propriedade durante esta revisão; não os alterei nem usei seus relatos como evidência.
