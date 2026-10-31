# Cadência automática da aventura — 29/10/2026

## Resultado e limite

[Certo] Nesta árvore, o catch-up automático espera no mínimo 2 s entre respostas confirmadas; após falhas consecutivas com snapshot em cache, as próximas tentativas automáticas esperam 30, 60 e 120 s (teto). Uma resposta nova, válida e da identidade atual zera a sequência; resposta antiga, cancelamento e mero retorno do cache não zeram. A arena continua com atualização manual imediata. O `AppLayout` é o único consumidor com `background: true`; `<AutoAdventure />` observa a mesma query sem agendar outro timer. Em produção, a arena de `BossPage` está dentro de `AppLayout`.

[Incerto/a] Esta é uma mitigação local de carga, não uma correção da causa raiz do incidente de Auth de 29/10. A [auditoria de pressão](20261029-auth-pressao-cliente.md) mediu possibilidade de carga sequencial em fixtures, sem atribuir custo SQL ou tráfego real. O [BUG-44](https://app.notion.com/p/400812ac94d881e98970ed4d44153f85) registra indisponibilidade remota e causa iniciadora ainda não demonstrada; o suporte associou o episódio anterior a pressão de memória e I/O, o que não identifica este cliente como gatilho hoje. O [BUG-47](https://app.notion.com/p/401812ac94d881379049eec9bcfab9ad) documenta a correção anterior de catch-up e resumo. Esta alteração não reabre nem substitui aquela correção.

## Medição comparável

[Certo] O mesmo `work/auth-incidente-20261029/client-pressure.test.tsx` do baseline foi executado sem editá-lo. Ele monta `App`, rotas, `AppLayout` e `AutoAdventure` reais, com Auth e fronteira Supabase simulados, resposta de 1 ms, timers falsos e shell/arena ativos. Os números são inícios de `sync_auto_adventure` por uma aba; máximo simultâneo foi 1 em todos os cenários.

| Cenário | Baseline 10 s / 60 s | Após alteração 10 s / 60 s |
| --- | ---: | ---: |
| `catchup.pending` repetido | 40 / 240 | 5 / 30 |
| Primeiro sucesso, depois 504 simulado com cache | 2 / 7 | 2 / 3 |

[Certo] A reexecução do harness externo retornou 1 falha porque sua asserção antiga exige mais de 20 chamadas em 10 s; as duas contagens pós-alteração foram impressas antes dessa asserção. O teste persistente `src/test/AutoAdventureCadence.test.tsx`, derivado das mesmas fixtures e montagem, usa os novos limites e passou 3/3. Ele cobre a sequência 30/60/120 s, sucesso que restaura o polling de 2 s, foco/reconexão sem furar o recuo, atualização manual imediata e ausência de concorrência.

## Contrato preservado e troca operacional

[Certo] `sync_auto_adventure` continua sem argumentos e com `AbortSignal`; identidade, geração e relógio confirmado continuam protegendo o cache contra resposta tardia. A cadência não cria HP, dano, eventos ou recompensas. O teste existente de sessão nova/refresh rejeita a resposta da geração anterior e revalida o cache; os testes de resumo conservam vitórias, ouro e itens na transição `pending` → `completed`, inclusive fechamento com zero batalhas; os de `advance` conservam invalidação de saldo e inventário. Nenhum caminho de Auth recebeu atraso.

[Provável] Se cada resposta liquidar somente um lote, o piso de 2 s alonga o processamento de backlog em até aproximadamente oito vezes em comparação com 250 ms, além da duração das RPCs. Depois de falhas repetidas, o usuário pode esperar até 120 s pela próxima tentativa automática; a atualização manual permanece disponível. A cadência reduz chamadas por aba nas fixtures, mas não demonstra redução de CPU, memória, I/O ou latência em produção; abortar HTTP tampouco prova interrupção de SQL já iniciado.

## Verificação local

[Certo] `npx vitest run AutoAdventure`: 12 arquivos, 56/56 testes. `npm run build`, `npx tsc --noEmit` e ESLint direcionado aos cinco arquivos tocados: saída 0. Os testes cobrem `App`/rotas com Auth simulado para cadência, Auth real com Supabase simulado para continuidade, e hooks de resumo, troca de conta e corrida de respostas. Não houve sonda remota, DDL, deploy, commit ou alteração dos arquivos de pets/missões em andamento. O harness `work/` já estava não rastreado e pertence à auditoria anterior; não foi modificado.
