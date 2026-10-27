# QA independente da renovação Auth — 26/10/2026

## Escopo e contrato

[Certo] O follow-up inspecionou o SHA `ad9350777fe02cb740d5b8dc47250ec4ef8055ad`, branch `Scaffx/rpg-auth-renovacao-20261026`. O arquivo `src/test/authRefreshIndependent.test.tsx` e este plano são os únicos arquivos editados nesta rodada. O harness temporário `work/auth-refresh-qa/` permanece sob uso do coordenador e não foi alterado. Não houve edição de produto, hook, App, banco, dependências ou publicação.

[Certo] O contrato de segurança local exige `getUser(candidate.access_token)` antes de expor token/usuário candidatos. A identidade e o papel expostos vêm da resposta confirmada; `user_metadata` e `session.user.app_metadata` candidatos não concedem admin. Resposta antiga, logout, retry, prazo e expiração não podem restaurar acesso. A autorização efetiva continua no backend. Referências: `CLAUDE.md`, `docs/audits/20261021-auth-recovery.md`, [getUser](https://supabase.com/docs/reference/javascript/auth-getuser) e [eventos de Auth](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).

[Certo] A [API `refreshSession()`](https://supabase.com/docs/reference/javascript/auth-refreshsession) retorna uma nova sessão mesmo antes do vencimento. Os dois harnesses chamam essa API sem argumento pelo mesmo cliente `src/integrations/supabase/client.ts` usado pelo app. Nenhum token, UID, credencial ou conteúdo de storage é exibido, copiado para arquivo ou enviado por telemetria pelos harnesses.

## Teste adversarial local

[Certo] A execução inicial do teste no SHA acima teve **6/9 passando e 3 falhando**. A fixture anterior emitia JWTs apenas com `sub` e `exp`, então o filtro de continuidade do hook rejeitava a renovação como incompleta: `iss` e `session_id` estavam ausentes em ambos os tokens. As três falhas não demonstravam regressão do fluxo normal com os claims exigidos.

[Certo] A fixture agora emite `sub`, `iss` e `session_id` estáveis entre o token confirmado e a renovação normal. `npx --no-install vitest run src/test/authRefreshIndependent.test.tsx` terminou com **16/16 passando**. A renovação normal preserva usuário, sessão confirmada, rascunho, foco, scroll e ausência de privilégio admin enquanto `getUser(candidate.access_token)` está pendente; só depois da confirmação adota o token novo. `npx --no-install eslint src/test/authRefreshIndependent.test.tsx` terminou com código 0 e sem diagnósticos.

[Certo] Os negativos agora cobrem ausência de `sub`, `iss` ou `session_id`; divergência de `iss` ou `session_id`; `sub` do JWT diferente apesar de `event.user.id` antigo; UID declarado diferente; UID remoto diferente; erro remoto; timeout com evento duplicado; logout; resposta antiga; timer de expiração antigo; e expiração do token confirmado com resposta tardia. Cada candidato com binding inválido fica oculto antes e depois de `getUser`; um `SIGNED_IN` de outro usuário após o bloqueio só aparece depois de sua própria confirmação remota. Os casos usam sessões e JWTs sintéticos em React/jsdom: não comprovam SDK, rota real nem conta publicada.

[Certo] Verificações históricas da preparação do harness: ESLint nos dois TSX temporários teve três avisos de Fast Refresh nos pontos de entrada; TypeScript do app apresentou diagnósticos globais fora do teste; o build Vite em memória da entrada `/boss` transformou 4005 módulos e saiu com código 0; o build isolado do provider saiu com código 0 (77 módulos). Este follow-up não repetiu esses builds nem executou navegador ou sessão real.

## QA real com a conta de teste antes de publicar

1. [Certo] No diretório do worktree, usar o Vite local na origem `http://127.0.0.1:5190` já escolhida pelo coordenador. Usar a mesma origem/porta para login e harness; o storage do navegador é separado por origem. O coordenador abre a UI com Cua, sem `evaluate`, console, script injection ou leitura de storage.
2. [Certo] A prova isolada do provider está em `http://127.0.0.1:5190/work/auth-refresh-qa/index.html`. Se a sessão de teste não aparecer, abrir `/auth`, entrar pela UI normal e voltar ao harness. O indicador `Usuário confirmado presente` deve ser `true`, `Loading=false`, `Erro Auth=false`, `Montagens=1`, `Desmontagens=0`.
3. [Certo] Digitar um rascunho não sensível, rolar a área de teste para baixo e focar o input. Confirmar visualmente que está preenchido, rolado e focado. Clicar em `Renovar sessão real`; o botão evita tomar o foco no clique com mouse. Aguardar `Pedido de refresh=concluído` e o retorno da confirmação do provider.
4. [Certo] Critérios de aprovação na UI: `Token confirmado mudou=true`, `UID confirmado igual=true`, `Loading=false`, `Erro Auth=false`, `Montagens=1`, `Desmontagens=0`, `Input preenchido antes=true`, `Input preservado=true`, `Scroll antes maior que zero=true`, `Scroll preservado=true`, `Foco no input antes=true`, `Foco no input preservado=true`. Repetir uma vez para afastar resultado ocasional. Registrar apenas esses booleanos, contagens, origem local e SHA; não registrar token, UID, screenshot de dados pessoais ou credenciais.
5. [Certo] Se `Pedido de refresh=falhou`, registrar somente esse estado e o horário; isso não aprova continuidade. Distinguir falha da chamada real, falha de confirmação e regressão de montagem pela combinação dos indicadores. Não limpar storage nem forçar sign-out para “consertar” a execução.

## Rota real /boss

[Certo] A entrada `http://127.0.0.1:5190/work/auth-refresh-qa/app.html` monta o `App` real, que inclui seu único `AuthProvider`, `ProtectedRoute` e `/boss`; o script ajusta a URL para `/boss` antes de montar. Uma sonda separada, fora da árvore do provider, mostra somente booleanos e estado da cena DOM. Ela não instala um segundo provider nem altera produto.

1. [Certo] Abrir a entrada `app.html` na origem 5190 já autenticada. Confirmar `Boss visível=true` e a página de boss real atrás da sonda. Na aba **Coletiva**, digitar texto de teste não sensível no campo de código, deixar esse input focado e rolar a área principal até `Scroll antes maior que zero` poder ser verdadeiro.
2. [Certo] Clicar `Renovar sessão real` na sonda. A chamada captura o estado da cena e input reais, consulta `getSession()` no mesmo cliente, confirma remotamente a identidade anterior com `getUser(token)`, aciona `refreshSession()` por clique e confirma remotamente a nova identidade com `getUser(token)`; nenhum valor de token/UID é exibido. O clique evita tomar o foco do input.
3. [Certo] Critérios: `Pedido=concluído`, `Token mudou=true`, `UID remoto confirmado igual=true`, `Cena original desmontou=false`, `Mesma cena=true`, `Input preenchido antes=true`, `Mesmo input e texto=true`, `Scroll antes maior que zero=true`, `Scroll preservado=true`, `Foco no input antes=true`, `Foco preservado=true`. A página não deve mostrar splash ou recuperação. Repetir uma vez com novo rascunho.

## Limites

[Certo] O harness isolado observa diretamente os campos do `AuthProvider`, mas usa seu próprio gate, não a rota real. O harness `/boss` usa o `App` e seu provider reais, porém a sonda fica fora do contexto React: ela infere continuidade da rota pela identidade do nó DOM original e pelo input, e confirma o UID em uma chamada independente de `getUser(token)`. `getSession()` antes do clique pode emitir evento adicional se a sessão estiver perto de vencer; executar com sessão recém-carregada e registrar se a rota mudou antes do refresh.

[Provável] Se o coordenador precisar observar `loading` do provider na própria rota /boss durante o refresh, a sonda externa não tem acesso a esse contexto. Uma integração dev-only dentro de `App` seria a medida mínima; ela pertence ao coordenador/owner de `App`, fora desta frente.
