# Recuperação do carregamento de autenticação — 21/10/2026

## Causa e evidência

[Certo] Na base `9a8033829c3f6dea546b4709e569958c0a046e61`, `useIsAdmin` chamava `auth.getUser()` em cada montagem sem `catch` nem encerramento de `loading` na rejeição. `ProtectedRoute` exigia `adminLoading === false` antes de sair do splash. `AuthProvider` também usava `getSession().then(...)` sem tratar rejeição. Os dois caminhos permitem splash permanente e rejeição não tratada quando as promises falham.

[Certo] O coordenador observou na rota publicada `/habilidades`, em 21/10/2026 às 15:33 UTC, o splash “abrindo o portal” persistente e logs do GoTrue com `Lock auth-token was released because another request stole it` e `AbortError: Lock broken by another request with steal option`. Não houve leitura de tokens/cookies, limpeza de storage nem desbloqueio manual. Registro Bug Tracker `400812ac-94d8-8112-ab9d-f5399315172b`; atualizações do registro pertencem ao coordenador.

[Provável] A inicialização paralela de `getSession()` e `getUser()` aumentava a disputa pelo lock do cliente; os logs não identificam qual chamada o roubou. A causa direta do splash sem fim é a ausência de conclusão dos estados de loading diante da falha.

## Correção local

[Certo] `AuthProvider` agora registra o listener primeiro, lê a sessão e confirma seu usuário com uma única chamada a `getUser(initialSession.access_token)`, em sequência e fora do callback do listener. Na versão instalada de `@supabase/auth-js`, essa forma consulta Auth sem adquirir outro lock local; a forma sem argumento adquiria o lock. Rejeição, erro retornado ou usuário divergente deixam a interface em estado sem acesso, com opção “Tentar novamente”. O limite de 15 segundos cobre promessa de inicialização que nunca conclui. Retry refaz a confirmação sem `signOut`, limpeza manual de storage, lock customizado ou desativação de proteção.

[Certo] Eventos novos de login/logout/refresh vencem a resposta inicial atrasada; `INITIAL_SESSION` não substitui um evento novo nem concede papel administrativo a partir da sessão armazenada. Cleanup e versão do evento impedem escrita tardia após unmount, retry e StrictMode. `useIsAdmin` deriva somente de `app_metadata.role` do usuário exposto pelo contexto confirmado e nega admin durante loading/erro; `user_metadata` não é usado. O backend continua responsável por RLS e autorização.

[Certo] `ProtectedRoute`, `PublicRoute` e `LandingRoute` mostram erro recuperável em vez do splash quando a sessão não pôde ser confirmada. Os demais consumidores preservam os campos anteriores de `useAuth`. A decisão de confirmar a sessão inicial segue a distinção oficial entre [`getSession`, que lê storage](https://supabase.com/docs/reference/javascript/auth-getsession), e [`getUser`, que consulta Auth](https://supabase.com/docs/reference/javascript/auth-getuser); o [listener de eventos](https://supabase.com/docs/reference/javascript/auth-onauthstatechange) permanece síncrono.

## Verificação e limites

[Certo] `npx --no-install vitest run src/test/authLoadingRecovery.test.tsx`: exit 0, seis testes. Os mocks cobrem rejeição de `getSession`/`getUser`, retry, negação de admin apesar de `user_metadata.role=admin`, login/logout durante resposta inicial, StrictMode/unmount e promessa pendente além do limite.

[Certo] `npx --no-install tsc -p tsconfig.app.json --noEmit`: exit 2, 44 diagnósticos globais, zero nos quatro arquivos de produto/teste tocados; a quantidade coincide com a baseline fornecida pelo coordenador. Nenhum pacote ou lockfile foi alterado.

[Certo] `npx --no-install eslint src/hooks/useAuth.tsx src/hooks/useIsAdmin.ts src/App.tsx src/test/authLoadingRecovery.test.tsx`: exit 0, zero erros e um aviso já existente de `react-refresh/only-export-components` em `useAuth.tsx`, que exporta o provider e o hook.

[Certo] A prova é de hooks com mocks em React/jsdom. Ela não valida a sessão publicada, o comportamento real do lock GoTrue, o schema/API viva, o navegador nem o rollout. O coordenador fará a integração e a observação publicada após o rollout.

[Provável] Em conexão que demore mais de 15 segundos, o usuário pode ver retry apesar de a primeira requisição terminar depois; a resposta tardia é ignorada, e o watchdog não cancela a chamada da biblioteca. Esse limite foi escolhido para evitar splash indefinido sem manipular o lock ou a sessão persistida.
