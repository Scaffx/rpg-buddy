# Revisão fria final de Auth — 26/10/2026

## Escopo congelado

- Base remota `main`: `9062510d2d6105b4e938083d5a659657fbb38976`.
- HEAD revisado: `eb241756d14eccf2548fd9e781dc421c6296bdff` (`Scaffx/rpg-auth-foco-20261026`).
- Árvore limpa antes da revisão. Examinei `CLAUDE.md`, o diff de `src/hooks/useAuth.tsx`, os testes de Auth e os consumidores diretos da identidade. Não consultei as entregas do autor ou dos revisores antes de fechar a análise.

## Veredito

**Aprovado para o contrato com access tokens JWT do Supabase que contêm `exp` numérico.** Não encontrei falha reproduzível de preservação de foco, elevação por metadados locais ou corrida de expiração no diff revisado.

- `src/hooks/useAuth.tsx:140-156`: cada sessão candidata passa por `getUser(token)` explícito fora do callback; UID diferente, erro e token expirado bloqueiam. A sessão exposta recebe o usuário retornado por Auth, inclusive no caminho que preserva a cena.
- `src/hooks/useAuth.tsx:189-203`: repetição durante confirmação mantém o prazo original; só `SIGNED_IN` do mesmo token e UID previamente confirmados e não expirados mantém a cena. Token/UID novos exigem nova confirmação.
- `src/hooks/useAuth.tsx:62-107`: o timer próprio da sessão confirmada bloqueia após `exp`, inclusive depois de uma reconfirmação concluída e sem novo evento. Logout, falha e troca de token limpam a identidade e o timer antigo; respostas antigas são descartadas por versão.
- `src/hooks/useAuth.tsx:224-229`: desmontagem cancela os timers e a inscrição. `retryAuth` limpa o estado antes de reiniciar a leitura (`:40-46`).

## Evidência executada

- `npm run test -- --run src/test/authFocusStability.test.tsx src/test/authFocusColdReview.test.tsx src/test/authLoadingRecovery.test.tsx src/test/authRecoveryIndependent.test.tsx`: 31 testes passaram.
- `npm run test -- --run src/test/authFocusExpiryFinal.test.tsx`: 3 testes passaram. O novo teste verifica cena/formulário estáveis durante foco, reconfirmação concluída seguida de expiração sem evento, novo token sobrevivendo ao prazo antigo, resposta antiga ignorada, logout, retry e desmontagem.
- `npx --no-install eslint src/test/authFocusExpiryFinal.test.tsx`: sem erro ou aviso. ESLint do produto mostrou apenas o aviso já presente `react-refresh/only-export-components` em `useAuth.tsx:258`.
- `npx --no-install tsc --noEmit -p tsconfig.app.json`: falhou por erros globais fora do Auth revisado; a saída filtrada não apresentou erro em `src/hooks/useAuth.tsx` nem no arquivo de teste novo. O projeto TypeScript não inclui testes no `tsconfig.app.json`.
- `git diff --check`: limpo.

## Limites

- Validação local com Auth simulado; não houve prova de sessão real do projeto, browser ou publicação, conforme a restrição do despacho.
- `src/hooks/useAuth.tsx:20-31,64,84`: se um `getUser` externo aceitar token sem `exp` numérico legível, o provedor não arma prazo de expiração. Essa condição não foi reproduzida com JWT emitido pelo Supabase; o veredito pressupõe o formato normal desses tokens. `expires_at` da sessão candidata não pode substituir com segurança o `exp` do token.
- O teste novo preserva apenas os arquivos sob propriedade deste trabalhador. Nenhum arquivo de produto foi alterado.
