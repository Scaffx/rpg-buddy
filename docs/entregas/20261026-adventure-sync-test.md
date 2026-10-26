# Sincronização do teste de avanço da aventura — 2026-10-26

[Certo] Trabalho limitado a `src/test/AutoAdventureSync.test.tsx`. Base local antes do ajuste: `32c6c8797998df32fc6c1301e84ae83f8506e01f`, branch `Scaffx/rpg-pets-ui-20261026`, árvore limpa. O auditor relatou, no conjunto focalizado de `d453783f`, uma rodada 26/26 e outra 25/26: em `AutoAdventureSync.test.tsx:110`, o DOM ainda mostrava `2:0:0advance` quando o teste esperava `3:0:0`; o caso isolado passava 1/1. O Tracker já havia sido consultado e atualizado pelo coordenador: https://app.notion.com/p/405812ac94d8815d8d87cbf821654ccc.

[Certo] Causa: o `AdvanceButton` de teste chamava `mutateAsync` e descartava a Promise. `act(async () => button.click())` não aguardava o `onSuccess` assíncrono da mutação nem o flush das notificações do React Query. O teste agora captura a Promise devolvida por `mutateAsync`, confirma que o clique iniciou a mutação e a aguarda dentro de `act`. A Promise só conclui após `onSuccess`, que atualiza o cache e aguarda as invalidações de recompensa. As assertions existentes de RPC, etapa `3`, resumo sem vitória offline e invalidações de ouro/inventário continuam intactas.

## Verificação local

| Comando | Resultado | Exit |
| --- | --- | ---: |
| `.\node_modules\.bin\vitest.cmd run src/test/AutoAdventureSync.test.tsx src/test/AutoAdventurePayload.test.ts src/test/AutoAdventureAdvanceCache.test.tsx src/test/AutoAdventure.test.tsx` | 4 arquivos, 30/30 testes | 0 |
| 12 execuções de `.\node_modules\.bin\vitest.cmd run src/test/AutoAdventureSync.test.tsx -t 'invalidates advance rewards without treating a live fight as an offline recap' --reporter=dot` | 12/12 execuções com 1 teste aprovado e 3 omitidos pelo filtro; nenhuma falha | 0 em cada execução; loop 0 |
| `.\node_modules\.bin\eslint.cmd src/test/AutoAdventureSync.test.tsx` | Sem diagnósticos | 0 |
| `.\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.app.json --pretty false` | 67 diagnósticos globais; nenhum em `AutoAdventureSync.test.tsx`; sem comparação de baseline nesta execução | 2 |
| `git diff --check` | Sem erros de whitespace; Git avisou que substituirá LF por CRLF no working copy | 0 |

[Certo] O motor, a migração e o produto não foram alterados; não houve PG, escrita remota, browser, instalação de dependências, push, merge ou deploy. [Provável] O ajuste elimina a corrida observada porque espera a própria conclusão da mutação; 12 repetições e o conjunto de 30 testes não demonstram ausência absoluta de outras corridas. A prova de 390 testes e build do produto permanece a do coordenador, não foi refeita nesta entrega.
