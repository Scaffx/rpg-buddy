# QA local da expiração durante a renovação Auth — 26/10/2026

## Estado da entrega

[Certo] A entrada temporária é `work/auth-refresh-qa/expired.html` com a lógica em `expired.tsx`. Ela importa `App`, CSS, i18n e cliente Supabase reais após instalar a sonda local. O único `AuthProvider` é o do `App`; o painel fica em outra raiz React, fora do contexto privado. Não foram editados produto, testes, harnesses existentes, banco, credenciais ou armazenamento. Nada foi commitado, publicado ou instalado nesta frente.

[Certo] O checkout observado parte de `8a1ff387e9e2bc9745048d3d7ff8e6499afb0976` e contém WIP paralelo em `src/App.tsx`, `src/hooks/useAuth.tsx`, `src/integrations/supabase/client.ts` e testes. A compilação em memória de `expired.html` transformou 4007 módulos e terminou com código 0; a checagem TypeScript da entrada, incluindo `src/vite-env.d.ts`, retornou zero diagnósticos da entrada. ESLint retornou código 0 com um aviso de Fast Refresh esperado para um ponto de entrada. Essas verificações não executaram navegador nem Auth remoto.

## Roteiro para o coordenador com Cua

1. [Certo] Na origem local autenticada `http://127.0.0.1:5190`, abrir `http://127.0.0.1:5190/work/auth-refresh-qa/expired.html`. O endereço muda para `/boss` sem recarregar, para que o `BrowserRouter` use a rota real. Para reiniciar a sonda, abrir novamente a URL do HTML; recarregar `/boss` abriria a entrada pública normal.
2. [Certo] Esperar `Confirmação inicial e DOM prontos=true`. A sonda espera a cena `data-tour="boss-header"`, o campo de código da aba **Coletiva** e uma chamada remota `getUser(token)` sobre a sessão real. Se faltar a sessão, entrar pela UI normal em `/auth` na mesma origem e voltar à entrada; não inspecionar storage, token, UID ou credencial.
3. [Certo] Na aba Coletiva, digitar texto de teste sem dados pessoais no campo de código, sem enviar ou clicar em **Entrar**. Manter o campo focado e rolar o `main` ou a janela até `Campo, foco e scroll preparados=true`. Os botões permanecem desabilitados durante a execução, e `mousedown` no painel preserva o foco.
4. [Certo] Executar **A: expirar antes da resposta**. O relógio local vai para `exp` do JWT confirmado mais 250 ms, rearma timers pendentes, observa a ocultação e chama `refreshSession()` real pelo botão. Registrar apenas os booleanos/contagens da sonda e uma inspeção da árvore de acessibilidade enquanto a cena estiver oculta.
5. [Certo] Para B, reabrir a entrada HTML e preparar novamente campo, foco e scroll. Executar **B: expirar durante getUser**. O relógio local vai para `exp` antigo menos 2 s antes de `refreshSession()`. Respostas de `fetch` do Auth `/auth/v1/user` são entregues à página 5 s depois de a rede real responder; o watchdog do hook continua com prazo normal de 15 s. Verificar `Expirou com getUser pendente=true`, `Oculto com getUser pendente=true` e `Respostas getUser atrasadas>=1`.

## Critérios observáveis

[Certo] Cada modo só tem evidência favorável se `Estado=concluído`, `Refresh concluído=true`, `Token mudou=true`, `Usuário remoto confirmado igual=true`, `Candidato válido no relógio local=true`, `Ocultação observada=true`, `Conteúdo oculto fora da AX por DOM/CSS=true`, `Cena/input desmontados=false`, `Mesma cena conectada=true`, `Mesmo input e valor=true`, `Scroll preservado=true` e `Foco preservado=true`. Para A, exigir também `Expirou antes do refresh=true`; para B, os três indicadores específicos do passo 5. Se qualquer um faltar, registrar falha ou inviabilidade, sem chamar PASS.

[Certo] O indicador de AX usa conectividade, atributos `hidden`/`inert`/`aria-hidden` e CSS computado de cena, input e `main`; `MutationObserver` observa desmontagem **e** alterações de visibilidade, com amostragem curta durante a execução. Ele não substitui a inspeção da árvore de acessibilidade real por Cua. Capturar somente estados/contagens e evitar screenshots que incluam dados da conta.

## Limites e riscos da simulação

[Certo] O relógio virtual modifica apenas `Date.now` e rearma os `setTimeout` pendentes no documento; não altera relógio do OS, JWT, refresh token, storage, headers ou corpo de resposta. A sonda retém token e UID somente em memória para comparações booleanas e não os renderiza nem os registra. O atraso envolve apenas entrega local da resposta `/auth/v1/user`, após o `fetch` real; Auth remoto e novo token são reais. Portanto a prova **não demonstra expiração real do JWT no servidor**.

[Certo] O `auth-js` instalado usa margem de renovação de 90 s ao carregar sessão. A sonda exige mais de 120 s restantes antes de mover o relógio, para não iniciar com confirmação pendente da preparação. Ao mover o relógio para perto ou além de `exp`, `refreshSession()` pode disparar uma renovação interna antes da renovação explícita; `Chamadas Auth token` mostra a contagem, sem payload. Se isso impedir a ordem desejada, se o novo token já não vencer depois do relógio virtual, se a rede levar tempo demais para B entrar em `getUser` pendente antes de `exp`, ou se houver erro Auth, a sonda marca `inviável`/`falhou` ou deixa os indicadores específicos falsos. O coordenador deve relatar esse limite; não forçar token nem alegar PASS.

[Certo] Esta entrada permanece em `work/`, fora do build público atual. Não incluir os dois arquivos temporários em commit ou deploy de produto. O QA de navegador foi deixado ao coordenador, que já controla a origem 5190 com Cua.
