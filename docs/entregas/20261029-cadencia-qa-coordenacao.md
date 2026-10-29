# Cadência da aventura — QA e rollout da coordenação

[Certo] O checkout `Scaffx/rpg-cadencia-20261029` começou limpo em `d787af6499dfed0a0ea75f7431d57294d633a634`, a mesma revisão que a Vercel servia em produção durante a preparação. A alteração mínima mantém os RPCs e a validação de identidade existentes. Nenhuma migration, configuração paga ou alteração do AuthProvider integra este recorte.

[Certo] O run Orca é `run_883331c5c4e4`. Port inicial: `task_03503202c98f`/`ctx_45260e905d6c`; revisão inicial: `task_8fa1250c64d1`/`ctx_3a371ec7a036`; correção da reentrada: `task_e8183b3f12ee`/`ctx_479756f98850`. Recibos confirmam GPT-6-Sol, esforço xhigh. O checkout principal e seu WIP foram preservados.

## Fronteiras da evidência

[Certo] O harness de navegador é externo ao repositório e não integra o build publicável. Ele monta o App real e envolve o fetch apenas para contar inícios, conclusões, máximo em voo e status HTTP de `sync_auto_adventure`. Não registra tokens, headers ou corpos e não injeta respostas, atrasos ou falhas. A autenticação segue o OAuth normal do Discord, com a conta de teste existente.

[Certo] A primeira rodada em `http://127.0.0.1:5191/boss`, anterior à correção adicional de reentrada, confirmou aventura v3, atualização manual, navegação e renovação real do SDK seguida de `getUser(token)`, mantendo a rota. A contagem observada chegou a 31 chamadas concluídas, máximo 1 em voo e HTTP 200. Isso não mede throughput do banco, todos os cenários de concorrência ou recursos do host.

[Certo] Os testes locais do port inicial usam App, AuthProvider e rotas reais com a fronteira da API simulada: 240→30 inícios de RPC por minuto no cenário pending de resposta em 1 ms, máximo 1 em voo. Esse número não é medição de tráfego publicado e não prova que o cliente tenha causado o incidente remoto.

[Certo] O teste de saída do harness usa explicitamente `supabase.auth.signOut({scope:'local'})`, preservando as outras sessões da conta. É uma ação de QA sobre a sessão local, sem substituir a validação do produto. Referência: [escopos oficiais de signOut](https://supabase.com/docs/reference/javascript/auth-signout).

## Fonte final e segunda rodada

[Certo] Em 29/10 às 13:03 UTC, a coordenação conferiu os hashes finais em disco: hook SHA256 `e57fb240f1d347a433135f5ad50de1dc8d392433684d318518dce9e429287011`, teste de sessão `d4fc1c7c2b1f20dbd4476b22583b723ad1d1d9aae9462a5567fc675430797cdc`. O autor encerrou sua propriedade antes da nova QA; relatou 538/538 testes, build/lint aprovados e 44 diagnósticos TypeScript idênticos à base, sem delta nos caminhos tocados. A revisão independente final é tarefa `task_fcfd5926f62f`/`ctx_906066a2c4ea`.

[Certo] A fonte final foi recarregada intencionalmente uma vez no navegador local. A conta existente abriu `/boss`, etapa 11, Mago nível 1/69 XP, HP/MP e ataques atualizando. A renovação real do SDK seguida de `getUser(token)` mostrou “Sessão renovada e confirmada”, sem sair de `/boss` ou reapresentar o carregamento inicial. Em seguida, a saída SDK de escopo local foi concluída, o produto mostrou landing/auth e o OAuth normal do Discord entrou novamente na mesma conta. A navegação para aventura recuperou a cena e a contagem observada chegou a 10/10 chamadas concluídas, máximo 1 em voo e HTTP 200. Não foram acionados avanço, compra, missão ou resgate.

[Certo] Durante a saída local havia uma sincronização em voo; ela terminou HTTP 500. A consulta agregada dos logs na janela explícita 13:03–13:06 UTC identificou dois `sync_auto_adventure` com SQLSTATE 57014 (13:04:05), 21 respostas 200 de aventura e fluxo Auth com 6×200, 1×204 e 2×302. A janela inclui todos os clientes do projeto, não apenas esta aba; não vincula os dois erros ao logout. Há ainda um timeout em outro caminho REST. O arquivo externo `qa-main/server-log-summary-1303-1306.json` contém somente agregados sanitizados. Não foram lidos headers, tokens, código OAuth ou corpos pessoais.

[Certo] O retorno por OAuth navega o documento e cria outro App/QueryClient. Portanto essa rodada confirma acesso e recuperação reais, mas a prova específica da mesma instância de cache após evento SIGNED_OUT permanece nos testes montados com App/AuthProvider/rotas e API simulada. O novo intervalo não é prova de correção do custo SQL nem do incidente de recursos; a inspeção servidor continua em tarefa separada e sem mutações remotas.

## Estado de liberação

[Certo] A revisão encontrou um segundo P2 no candidato anterior: navegar aos 20 s após falha cacheada remontava o intervalo inteiro e adiava a próxima tentativa de t30 para t50. A coordenação solicitou correção, sem aceitar a limitação. `task_91e47ccdb579`/`ctx_ca9c10eaf1f3` mudou o cálculo para o tempo restante desde `errorUpdatedAt`/`dataUpdatedAt`, suspendeu o timer durante fetch e preservou os demais guards. O autor reproduziu as falhas antes do fix e passou 8/8 provas externas, 24/24 focais e 541/541 testes completos, build/lint/diff aprovados e os mesmos 44 diagnósticos TypeScript da base. Relatório: `20261029-cadencia-prazo-fix.md`.

[Certo] O novo freeze final tem hook SHA256 `72eeb7e2d26469845bae679ea98c9c1ac32b1c35cfe7206599d92a570ee013bd` e helper `1d98bda25307d7d84eddcf2fa748c45eef8722177f298ffda98177461e1edc22`. A coordenação abriu outra aba sobre essa fonte às aproximadamente 13:18 UTC, sem manter a aba local anterior ativa. A aventura abriu autenticada. Navegou para Missões, preencheu o filtro com “QA preservar rascunho” e executou renovação real do SDK seguida de getUser. Após “Sessão renovada e confirmada”, `/missions` e o campo preenchido foram preservados; captura externa `qa-main/final-filter-session.png`. Depois voltou pela navegação normal a `/boss`, com cena ativa, e clicou “Atualizar aventura”: contador passou de 8 para 9 inícios imediatamente, máximo 1 em voo. A UI recebeu somente respostas reais, sem compra, missão, resgate ou avanço acionados.

[Certo] A revisão independente final terminou sem P1/P2 aberto nos hashes congelados. Reexecutou 24/24 testes focais e o gate externo 8/8, confirmou AuthProvider intacto, e delimitou a latência de até 1 s para reagendar um prazo já vencido. A coordenação encerrou a rodada com 13/13 chamadas concluídas, máximo 1 em voo e HTTP 200; captura externa `qa-main/final-adventure-session.png`. A aba local foi fechada para não manter mais um cliente ativo sem uso.

[Certo] QA e revisão satisfazem o recorte de cliente desta mitigação. O resultado do rollout será acrescentado no relatório de coordenação da reforma e no registro BUG-44. A recuperação operacional por reinício é uma mitigação distinta; reduzir a frequência de chamadas não garante que o limite de recursos do projeto deixe de ser atingido. O candidato não adiciona SQL nem inclui a reforma de hordas/pets/poções/missões em rascunho.
