# BUG-55 — preparo de QA de navegador da presença

## Escopo e estado

[Certo] Harness temporário em `C:\Users\Murillo\Documents\Codex\2026-10-15\seguinte-dentro-do-sistema-de-rpg\work\presenca-20261028\qa-harness`. O checkout observado era `Scaffx/rpg-presenca-20261028` em `c493e02bebe06d540b1f94bad3a3dde0d254be9e`; o hook e os testes mudaram em paralelo sob outros owners. Não houve alteração de arquivo de produto, commit, push ou deploy por este worker.

[Certo] A entrada de Vite monta `src/App.tsx`, `src/index.css`, `src/i18n` e o cliente Supabase reais, com JSX automático. O `AuthProvider` continua dentro do App. O painel de QA vive em outro root React, permanece visível ao navegar por rotas SPA e só intercepta `POST` para a origem configurada e o caminho exato `/rest/v1/rpc/update_my_last_seen` no `fetch` global. Auth, demais RPCs, gate e relógio permanecem no fluxo normal.

## Início seguro

[Certo] No PowerShell, somente se a porta 5190 estiver livre, executar com o diretório de ambiente existente que contém os dois nomes públicos necessários:

```powershell
& 'C:\Users\Murillo\Documents\Codex\2026-10-15\seguinte-dentro-do-sistema-de-rpg\work\presenca-20261028\qa-harness\start.ps1' -EnvDir 'C:\Users\Murillo\Desktop\RPG-Buddy\rpg-buddy'
```

[Certo] A busca por nomes achou `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no `.env` desse diretório, sem extrair ou copiar valores. O script também aceita as duas variáveis já definidas no ambiente do processo, caso em que `-EnvDir` pode ser omitido. Ele não imprime nem copia valores, confere a porta 5190 antes de iniciar, fixa Vite em `127.0.0.1:5190` com `strictPort`, usa o `node_modules` já existente e não instala pacotes nem para processos. Abrir `http://127.0.0.1:5190/boss`; usar o login normal em `/auth` com a conta de teste ou a sessão persistida para essa origem. O painel não fornece login alternativo.

[Certo] Nesta sessão de worker, as duas variáveis não estavam no ambiente nem nos `.env` visíveis da raiz. A execução direta de `start.ps1` sem `-EnvDir` parou com a mensagem de falta de `VITE_SUPABASE_URL`, antes de subir servidor. A coordenação iniciou seu Vite na porta 5190, no terminal `term_5368f549-79e5-4eed-84e1-96bd1c9bc1d0`, mas o primeiro acesso resultou em `supabaseUrl is required`. O diretório acima foi indicado à coordenação para a reinicialização do próprio servidor; não iniciar uma segunda instância.

## Seletores e leitura

| Seletor | Leitura ou ação |
| --- | --- |
| `#qa-arm-next` | Reter somente a próxima RPC de presença no transporte. |
| `#qa-disarm` | Cancelar a armação antes de uma RPC ser capturada. |
| `#qa-release` | Liberar a RPC retida, se ainda não abortada. |
| `#qa-refresh` | Chamar `supabase.auth.refreshSession()` pelo SDK real. |
| `[data-testid="qa-started"]` | Chamadas de presença iniciadas no `fetch`. |
| `[data-testid="qa-completed"]` | Chamadas de presença encerradas, inclusive abortadas. |
| `[data-testid="qa-in-flight"]` | Chamadas de presença ainda pendentes no `fetch`. |
| `[data-testid="qa-max-in-flight"]` | Máximo simultâneo observado no `fetch`. |
| `[data-testid="qa-http-success"]` | Respostas HTTP 2xx reais da RPC. |
| `[data-testid="qa-http-failure"]` | Respostas HTTP não 2xx da RPC. |
| `[data-testid="qa-transport-failure"]` | Rejeições de transporte, incluindo abort. |
| `[data-testid="qa-last-http-status"]` | Código da última resposta HTTP, sem corpo. |
| `[data-testid="qa-armed"]`, `[data-testid="qa-holding"]`, `[data-testid="qa-abort-requested"]`, `[data-testid="qa-held-seconds"]` | Estado da retenção e do AbortSignal. |
| `[data-testid="qa-route"]`, `[data-testid="qa-boss-visible"]`, `[data-testid="qa-visibility"]`, `[data-testid="qa-refresh-status"]` | Rota, cena, visibilidade e resultado booleano do refresh. |

## Roteiro para a coordenação

1. [Certo] Entrar normalmente, abrir `/boss`, aguardar `[data-testid="qa-boss-visible"]` mostrar `true` e registrar os contadores iniciais. Recarregar a página se for necessário zerar contadores antes da rodada.
2. [Certo] Acionar `#qa-arm-next`; aguardar a próxima presença (imediata na montagem ou após o intervalo saudável de 30 s). Com `[data-testid="qa-holding"]` em `true`, liberar via `#qa-release` antes dos 15 s de timeout do hook. Confirmar incremento em `qa-http-success`, último HTTP 2xx, `qa-in-flight` de volta a zero e `qa-max-in-flight` de 1 nessa rodada.
3. [Certo] Em outra rodada, armar e não liberar. Aos 15 s o AbortSignal real encerra a retenção: `qa-abort-requested=true`, `qa-transport-failure` aumenta, `qa-holding=false` e nenhuma requisição abortada é enviada. Após backoff de 30 s, observar nova RPC com HTTP 2xx. O contador `qa-completed` inclui a tentativa abortada.
4. [Certo] Para hide/show, armar a próxima RPC, ocultar a aba enquanto ela está retida e reexibir. O abort deve encerrar a retenção; acompanhar a tentativa posterior e o máximo simultâneo. Navegar usando o próprio App entre páginas e voltar a `/boss`; o painel continua na página, enquanto o App mantém seus fluxos reais.
5. [Certo] Acionar `#qa-refresh` com a conta autenticada. `qa-refresh-status=sucesso` representa retorno sem erro do SDK; conferir a cena e a navegação do App após a confirmação normal de Auth. O painel não exibe token, chave, UID, payload ou dados de usuário.

## Verificação e limite

[Certo] O build Vite da entrada externa passou com URL e chave fictícias, sem chamada de rede ao projeto. Um smoke local retornou HTTP 200 para `/boss` e para `qa-entry.tsx`, com o root do App e o painel presentes no HTML. Esse smoke terminou com aviso do Vite ao fechar seu servidor programático; antes da partida informada pela coordenação, a checagem não encontrou listener na porta 5190. `resolveConfig` do Vite com o diretório de ambiente existente confirmou somente booleanos: URL pública presente, chave publicável presente, JSX automático, porta 5190 e `strictPort`. A pasta externa `build/` contém somente o artefato da compilação com valores fictícios e não é usada pelo comando de início.

[Certo] O `authDataGate.fetch` rejeita a promessa do hook quando recebe o abort aos 15 s, ainda que um `fetch` de teste continue retido. Por isso uma pendência do hook acima de 60 s não pode ser reproduzida fielmente neste harness sem modificar Auth/gate/sinal. A coordenação escolheu preservar o abort real no navegador; a pendência não cooperativa de 90 s fica na fronteira dos testes unitários. Nenhum sucesso HTTP real com a conta de teste foi afirmado neste preparo.
