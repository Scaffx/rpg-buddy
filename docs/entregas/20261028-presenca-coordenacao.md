# BUG-55 — coordenação, QA autenticado e liberação

## Resultado antes da publicação

[Certo] A correção elimina o setInterval que abria uma nova RPC de presença antes de liquidar a anterior. Usa guarda por UID, AbortSignal com deadline local de 15 s e reagendamento após conclusão: 30 s no sucesso e backoff de 30/60/120 s nas falhas. Não acumula beats perdidos.

[Certo] A revisão inicial identificou um P2 adicional: cada página remontava AppLayout e reiniciava o heartbeat. A chamada foi movida para AppRoutes, que permanece montado dentro de AuthProvider e acima de Routes/Suspense. A revisão final aprovou os blobs abaixo. AuthProvider, authDataGate, cliente Supabase, SQL, políticas e economia permaneceram intactos.

| Arquivo | Blob Git revisado e testado |
| --- | --- |
| src/App.tsx | 5853f7be7e000d9edc73eb86a42d33efc3862f9e |
| src/components/AppLayout.tsx | 539fff6b8477e1c8a4ba2dd3207395e190eea21d |
| src/hooks/usePresence.ts | df70361c622f0665b976fb0dbcddb9adfd57a56f |

## Agentes Orca

[Certo] Run run_cd7dcaf709cf, com sete tarefas Sol/xhigh, responsabilidades separadas e entregas aceitas:

- Implementação do hook: [relatório](20261028-presenca-implementacao.md), fix e validação focal concluídos.
- Regressões do hook: [relatório](20261028-presenca-testes.md), 11 casos, incluindo reprodução vermelha anterior à correção.
- Preparação do navegador: [relatório](20261028-presenca-qa-preparo.md), harness externo com App/Auth/SDK reais, sem controles no produto.
- Revisão fria inicial: [parecer](20261028-presenca-revisao.md), P2 de montagem por rota encontrado.
- Correção de montagem: [relatório](20261028-presenca-rotas.md), presença transferida ao componente estável.
- Regressões de navegação: [relatório](20261028-presenca-rotas-testes.md), App/AuthProvider/AppLayout reais com RPC/Auth simulados e duas rotas.
- Revisão final: [parecer](20261028-presenca-revisao-final.md), P2 resolvido e integração local aprovada sob os blobs congelados.

## QA com a conta de teste

[Certo] Em 28/10/2026, a coordenação abriu o App real em http://127.0.0.1:5190/boss com a sessão já existente da conta de teste, sem extrair/copiar JWT ou credenciais e sem alterar relógio. O ambiente externo usa as variáveis públicas já configuradas no checkout primário; a primeira tentativa sem essas variáveis falhou antes do login e foi corrigida somente na preparação local.

[Certo] Evidências visíveis da rodada final, em UTC:

- 20:46:59: uma RPC retida havia 11–12 s; navegar Aventura → Missões → Aventura manteve seis chamadas iniciadas, cinco concluídas, uma em voo e máximo de uma. Não houve abort por navegação.
- Após 15 s, a retenção local recebeu cancelamento, liquidou e acionou o retry. Nenhuma falha/carga foi injetada no Supabase.
- 20:47:15: renovação normal pelo SDK foi iniciada com seis chamadas de presença. Às 20:47:50, Refresh SDK exibiu sucesso, rota /boss e aventura visíveis; a presença havia retomado e respondido HTTP 204, com sete chamadas concluídas, seis sucessos reais, um cancelamento local deliberado e máximo de uma em voo.
- O controle de visibilidade do IAB ocultou a apresentação do navegador, mas document.visibilityState continuou visible. Portanto, esse controle não provou uma transição hidden real. Ocultação/logout/StrictMode têm prova unitária; não se anuncia esse trecho como QA real de visibilidade.

[Certo] Os registros sanitizados, captura de tela e harness estão fora do produto em work/presenca-20261028 no diretório do chat. Uma rodada do dev server anterior ao reload dos fontes de navegação foi excluída e preservada separadamente; a evidência aceita é posterior ao congelamento/reload.

## Verificações finais da coordenação

- [Certo] Vitest completo: **526/526 testes, 75 arquivos, exit 0**.
- [Certo] Build de produção: **exit 0**, com aviso já existente de chunks grandes.
- [Certo] ESLint de App, hook e dois testes novos: exit 0. AppLayout conserva os mesmos dois diagnósticos da base, comparados por regra/mensagem: delta zero.
- [Certo] TypeScript com projeto explícito: exit 2, **44 diagnósticos**, delta zero após normalizar somente posição de linha/coluna. A contagem de 25 do relato autoral de rotas não foi adotada como prova de typecheck limpo; prevalece a execução explícita da coordenação.
- [Certo] Nenhuma dependência instalada ou modificada; node_modules continua junction. Sem migration ou alteração de configuração de Auth.

## Suporte Supabase e limites

[Certo] O usuário autorizou expressamente o envio privado do pacote da investigação anterior. O formulário oficial confirmou Support request sent e ticket logged para o projeto LIifeinRPG/jfnospjxdkelxlhcwuia, com anexo sanitizado e acesso adicional ao projeto desativado. Não exibiu número de ticket; o comprovante foi preservado fora do repositório.

[Incerto] O mecanismo que iniciou a indisponibilidade REST/Auth continua não identificado e depende da telemetria solicitada ao provedor. BUG-55 é uma correção de resistência do cliente, não uma causa comprovada nem uma solução definitiva para os episódios de 504.

[Certo] AbortSignal limita a espera do cliente após o transporte aceitar o sinal; não prova cancelamento de SQL já recebido. O P3 condicional de preflight getSession que nunca liquida não foi reproduzido em navegador. A guarda conserva uma única promessa em vez de acumular novas tentativas enquanto essa promessa não termina.

[Certo] Este registro antecede push/merge/deploy. A publicação só ocorre após estes checks e QA; o recibo de liberação e o smoke da versão publicada são evidências externas separadas.
