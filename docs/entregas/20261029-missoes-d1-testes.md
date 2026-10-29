# Missões D-1 — testes montados da página

Data: 2026-10-29. Checkout inicial: `710b2c9`. Escopo de edição desta frente: `src/test/missionsDayPages.test.tsx` e este relatório. A página, helpers, traduções e migração foram editados por outras frentes no mesmo workspace.

## Cobertura

O teste monta `Missions` com React Query e os hooks reais de missões, conclusão e desfazer. As fronteiras substituídas são a sessão Auth, a resposta do Supabase e o layout externo. A asserção de conclusão inspeciona a chamada `complete_mission` produzida pelo hook real; não fornece XP, ouro, atributos ou outros argumentos de recompensa.

Sete cenários passaram:

1. Hoje e Ontem mostram títulos do dia selecionado. Ontem inclui missão diária agendada e única vencida naquele dia; exclui missão criada hoje, outra diária e única futura, inclusive na aba Foco.
2. A aba Concluídas mostra uma missão concluída uma única vez por dia selecionado, sem misturar o histórico de Hoje e Ontem. O controle de desfazer nomeia a data de ontem.
3. O clique em Ontem envia `p_date: 2026-07-22` à RPC. Enquanto a promessa da RPC está pendente, a navegação de data fica em Ontem e não há segundo envio.
4. O clique em Hoje fixa `p_date: 2026-07-23` e não envia parâmetros de recompensa.
5. Na segunda-feira 2026-07-20, Ontem é domingo 2026-07-19. Uma semanal existente fica registrável para a semana anterior mesmo com a cota carregada da semana atual preenchida; a RPC recebe o domingo explícito.
6. Uma semanal iniciada na segunda-feira não aparece na página de domingo.
7. Com a página aberta na virada de meia-noite de São Paulo, a mudança do relógio e o evento `focus` mantêm Ontem selecionado, atualizam sua data para 2026-07-22 e enviam essa data à RPC.

## Execução

`npm test -- --run src/test/missionsDayPages.test.tsx`: **7/7 passaram** na edição integrada observada no workspace. `npx eslint src/test/missionsDayPages.test.tsx`: **passou**. O `node_modules` deste checkout é uma junction para outro checkout, sem `@testing-library/dom`; por isso o teste usa `createRoot` e `act`, padrão já presente na suíte, sem instalar ou alterar dependências.

## Limites

São testes jsdom com dados de Supabase simulados. Não comprovam Auth real, PostgREST, PostgreSQL, RLS, deploy, navegador autenticado ou a animação visual. A virada por evento `focus` foi executada com `Date` simulado; o disparo autônomo do intervalo de 30 segundos e o comportamento visual de movimento reduzido não foram verificados aqui. A validação do servidor e das recompensas cabe à frente backend e à QA integrada. O teste não altera a página, não faz escrita remota e não substitui essas verificações.

## Complemento — intervalo e clique após a virada

Dois casos montados foram acrescentados após a primeira entrega. O primeiro acelera somente o intervalo solicitado pela página, conferindo que ele foi agendado para `30_000` ms; o callback dispara sozinho após a mudança simulada de domingo para segunda-feira em São Paulo, sem foco ou clique. A seleção lógica permanece em Ontem, as datas visíveis avançam para 19/07 e 20/07/2026, e o hook real de missões consulta novamente `mission_weekly_progress` com `week_start` de 2026-07-20 após a leitura inicial de 2026-07-13.

O segundo caso muda o relógio de quarta 23:59 para quinta 00:00 antes do próximo tick. Clicar no cartão ainda visível de terça não chama `complete_mission`; a página atualiza Ontem para quarta e um novo clique envia somente `p_mission_id` e `p_date: 2026-07-22`. A janela real de 30 segundos foi comprimida apenas no teste; ele prova o callback registrado e o fluxo de atualização, não a pontualidade do relógio do navegador em um dispositivo real. Este complemento substitui apenas o limite anterior sobre o intervalo autônomo; os demais limites permanecem.

Nova execução: `npm test -- --run src/test/missionsDayPages.test.tsx` **9/9 passaram**; `npx eslint src/test/missionsDayPages.test.tsx` **passou**. Nenhum defeito de produto foi encontrado nesses cenários simulados.
