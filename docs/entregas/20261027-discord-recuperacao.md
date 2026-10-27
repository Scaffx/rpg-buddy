# Recuperação da tela de login Discord — 2026-10-27

## Escopo e reprodução

- Worktree `rpg-auth-foco-20261026`, HEAD inicial `ce1ec0f432aee9da8a98c6c9136ad0c715cfaf97`.
- Antes da correção, `src/test/authDiscordRecovery.test.tsx` falhou: `signInWithDiscord()` resolvia na web sem navegação; passados 15 segundos, o botão ainda estava desabilitado (`expected true to be false`).
- Causa na tela: `handleDiscordLogin` deixava `discordLoading` ativo na web quando a promessa resolvia, presumindo que o documento sempre navegaria. O `catch` mostrava só um toast com `err.message`.

## Correção

- `Auth.tsx` limita a espera a 15 segundos. A página mostra status acessível persistente, permite interromper a espera e exibe uma ação de tentar novamente após timeout, falha, cancelamento ou retorno à página após ela ficar oculta.
- Um identificador monotônico e um ref bloqueiam cliques repetidos na mesma tentativa. Timer e respostas tardias só podem encerrar a tentativa a que pertencem; o unmount limpa timer e listener. A resolução da promessa na web não é tomada como navegação confirmada. No Capacitor, o retorno de `Browser.open` libera a interface e mantém orientação na página.
- Mensagens de OAuth são fixas e traduzidas em `pt`, `en`, `es`, `ru` e `zh`; nenhum erro bruto ou callback com token é exibido. Email/senha, sessão, `getUser`, cliente Supabase, URLs e deep link não foram alterados.

## Evidência local e limites

- Teste novo: 5 cenários passaram. Cobre web sem navegação, timeout com retry, bloqueio de cliques repetidos, resposta antiga depois do retry, erro com URL/token ocultado, cancelamento, retorno por visibilidade, Capacitor e desmontagem.
- `npm run test -- --run src/test/authDiscordRecovery.test.tsx src/test/authFocusStability.test.tsx src/test/authLoadingRecovery.test.tsx`: 32 testes passaram. `npm run build`: passou.
- `npm run lint`: falhou com 656 erros e 36 avisos no repositório. Lint restrito a `Auth.tsx` e ao teste novo mostrou 6 erros `no-explicit-any` em código preexistente de `Auth.tsx`; o mesmo arquivo no HEAD tinha 7. O teste novo passou isoladamente no ESLint.
- `npx --no-install tsc --noEmit -p tsconfig.app.json`: exit 2, 67 linhas de erro fora dos dois arquivos tocados de TS/TSX; nenhum erro em `Auth.tsx` ou no teste novo.
- A coordenação relatou timeout remoto em `/auth/v1/authorize` e respostas 504; esta frente não acessou navegador, banco nem login publicado. A UI agora se recupera, mas isso não corrige o serviço remoto nem prova login real.
- Depois do timeout/cancelamento, uma requisição OAuth já entregue ao SDK pode continuar e até redirecionar tardiamente; este escopo não fornece cancelamento dessa requisição. O isolamento por tentativa protege o estado da tela contra respostas tardias.
