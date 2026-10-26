# Revisão fria de foco e sessão

**Base:** `9062510d2d6105b4e938083d5a659657fbb38976`  
**HEAD congelado:** `8592ece51b556bc3e8e304ac403c6c210e1a1a66`  
**Escopo:** diff de `src/hooks/useAuth.tsx`, guard de `src/App.tsx`, Auth SDK instalado e testes locais. O relatório do autor `docs/entregas/20261026-auth-foco.md` não foi lido. BUG-52 no Bug Tracker foi consultado somente para contexto; nenhuma escrita remota foi feita.

## Achado

### P2 — JWT expirado continua com rota e estado visíveis após reconfirmação concluída

**Evidência:** `src/hooks/useAuth.tsx:62-75`, `:93-95`, `:130-138`; reprodução em `src/test/authFocusColdReview.test.tsx:65-91`.

**Cenário:** sessão com token que expira em dois segundos é confirmada por `getUser(token)`. Um `SIGNED_IN` de foco com token e UID idênticos também é confirmado remotamente e preserva, corretamente, o mesmo componente e o rascunho local. Quando essa segunda confirmação termina, `acceptSession` cancela o watchdog e não agenda proteção para `exp`. Avançar o relógio além da expiração sem novo evento de Auth deixa o componente protegido montado.

**Impacto:** o guard em `src/App.tsx:94-106` continua recebendo `user` e `loading=false`, então a tela autenticada e eventual conteúdo já carregado continuam visíveis com JWT vencido. Isto descumpre a leitura literal de “expiração continua bloqueando”. A autorização das chamadas ao servidor continua sujeita à validação do backend; o achado não demonstra bypass de RLS ou API.

**Por que o cenário é plausível:** no Auth SDK instalado, `_callRefreshToken` só emite `TOKEN_REFRESHED` no sucesso; falha de rede considerada repetível não remove a sessão nem emite `SIGNED_OUT` (`node_modules/@supabase/auth-js/dist/module/GoTrueClient.js`, `_callRefreshToken`). Logo, a aplicação não pode depender de um próximo evento para encerrar o estado exposto na expiração.

**Esperado:** ao atingir o `exp` do JWT confirmado, bloquear a rota até existir token novo confirmado por `getUser(token)`, inclusive depois de uma reconfirmação de foco que já terminou. O timer de expiração precisa ser atualizado ao aceitar novo token e invalidado em logout, retry e desmontagem.

## Aspectos preservados no diff

- [Certo] `SIGNED_IN` só mantém a cena se token, UID e `exp` legível correspondem ao estado confirmado nesta instância (`src/hooks/useAuth.tsx:177-185`). A metadata do evento não substitui o usuário retornado por `getUser(token)` (`:123-138`).
- [Certo] A versão monotônica impede que uma resposta antiga substitua evento mais recente; duplicatas enquanto há confirmação pendente preservam o deadline (`:59`, `:171-175`). Os testes existentes cobrem token novo, UID novo, retry, logout, erro, bootstrap e expiração durante reconfirmação.
- [Provável] O caminho usual de retorno ao foco preserva a rota e o estado local: `loading` não muda para `true` durante `SIGNED_IN` repetido e `useProfile` retém a mesma chave de query. A prova disponível é jsdom, não navegador real.

## Fronteira de `TOKEN_REFRESHED` e observação de QA

- [Certo] `TOKEN_REFRESHED` inicia o caminho bloqueante mesmo se, artificialmente, trouxer os mesmos bytes de token e UID após a confirmação anterior (`src/hooks/useAuth.tsx:177-185`). Isso é conservador e compatível com a autorização de continuidade descrita especificamente para `SIGNED_IN`; um token efetivamente novo sempre bloqueia. No SDK instalado, o sucesso de refresh emite `TOKEN_REFRESHED`.
- [Incerto/a] O coordenador observou perda de marcador local no primeiro hide/show da IAB e preservação nos retornos seguintes, sem identificar o evento de Auth ou o token. Essa observação não permite atribuir a primeira perda ao diff: ela pode corresponder a refresh com token novo, outro bloqueio do guard ou ciclo da página. Não há PASS de navegador para todos os retornos.

## Execução e limites

- `npx --no-install vitest run src/test/authFocusStability.test.tsx src/test/authLoadingRecovery.test.tsx src/test/authRecoveryIndependent.test.tsx` → **30/30 passaram**.
- `npx --no-install vitest run src/test/authFocusColdReview.test.tsx` → **1 falha reproduzível**: cena ainda presente após `exp`.
- `npx --no-install eslint src/test/authFocusColdReview.test.tsx` → **exit 0**.
- Não houve edição de produto, teste existente, instalação, CI, navegador, banco, push ou deploy. A evidência é local, com Auth simulado; não valida a integração real nem a produção.
