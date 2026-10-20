# Entrega: legibilidade das ações em Missões — 19/10/2026

## Escopo e base

- Worktree `rpg-prioridades-20261019`, base limpa `2bc08eb` (inclui `392dfb8`).
- Arquivos alterados: `src/pages/Missions.tsx` e este relatório. Sem edição de domínio, hooks, SQL, tipos, traduções ou rotas.
- Critérios de N1 e N3 usados como modelos de inspeção: encontrar a próxima rotina, concluir e localizar edição/correção com teclado. As personas são fictícias; não houve participante humano nem execução assistida dessas jornadas.

## Mudança

- As cinco listas de cartões usam uma coluna na largura estreita, duas a partir de `lg` e três a partir de `2xl`; os cartões têm altura de conteúdo em vez de proporção quadrada.
- O título fica inteiro e quebra palavras longas. A descrição mostra até três linhas; “Ver detalhes” exibe o restante e mantém o checklist.
- Editar, Arquivar e Excluir ficam sempre visíveis com texto, nomes acessíveis existentes e área de toque de 36 px de altura. Excluir permanece secundária e mantém a confirmação existente. Concluir continua como ação principal; Pausar/Retomar também tem texto visível. O botão de detalhes ganhou rótulo e foco visível.
- A contagem de prioridades é chamada de prévia. O formulário informa que a validação do servidor pode incluir missões concluídas ou excluídas anteriormente. A prioridade verde continua sem limite.
- A revisão do diff não encontrou alteração no seletor D-1, no desfazer, nos controles semanais/únicos, nos contadores nem no toast de conclusão baseado no retorno do servidor.

## Validação local

| Comando ou inspeção | Saída | Resultado |
|---|---|---|
| `npx vitest run src/test/missionPriority.test.ts src/test/weeklyMissions.test.ts src/test/completeMissionPayload.test.tsx` | 3 arquivos, 41 testes aprovados | exit 0 |
| `npm run build` | 3.939 módulos transformados; avisos de Browserslist, `PortalEventPage.tsx` e tamanho de chunk | exit 0 |
| `npx tsc --noEmit -p tsconfig.app.json` | 55 erros fora de `src/pages/Missions.tsx`; nenhum erro nesse arquivo | exit 2 |
| `git diff --check` | Sem erro de whitespace | exit 0 |
| CUA `getState()` | `apps: []`, `browsers: []` | Sem sessão autenticada/fixture; inspeção visual 320/768/desktop não executada |

## Limites e estado

- Build e testes são locais. Não houve verificação da versão publicada, screenshot, teste humano, leitor de tela real, escrita em dados de jogador, SQL remoto, deploy, push ou merge.
- Os 55 erros globais de TypeScript permanecem fora do escopo desta entrega. A confirmação de layout em navegador autenticado/fixture e revisão independente ficam para integração.
- A junction existente de `node_modules` foi usada sem alteração.
