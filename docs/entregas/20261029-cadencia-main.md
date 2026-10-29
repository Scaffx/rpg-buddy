# Cadência da aventura portada para main — 29/10/2026

## Base e recorte

[Certo] Checkout `Scaffx/rpg-cadencia-20261029`, HEAD inicial `d787af6499dfed0a0ea75f7431d57294d633a634`, árvore inicial limpa. Blobs congelados de `HEAD`: `useAutoAdventure.ts` `dc0ef91c7c47018465177e83634244cbe9f9665d`, `autoAdventurePayload.ts` `4c3edc3efd1792468bf1a89d259b7ceea527528c`, `AutoAdventure.tsx` `887570eaf44b6703bae530cbd0943a43b56f45f0`, `AutoAdventurePayload.test.ts` `5300aabf347750c5b3963a287910e0231bd738a7`. O `node_modules` ausente recebeu somente uma junction para `C:\Users\Murillo\Desktop\RPG-Buddy\rpg-buddy\node_modules`; não houve instalação nem edição do alvo.

[Certo] Alterações de produto limitadas a `src/hooks/useAutoAdventure.ts`, `src/lib/autoAdventurePayload.ts` e uma linha em `src/components/AutoAdventure.tsx`. Testes alterados/criados: `src/test/AutoAdventurePayload.test.ts`, `src/test/AutoAdventureCadence.test.tsx` e `src/test/AutoAdventureSessionCadence.test.tsx`. Nenhum arquivo de Auth, SQL, horda, poção, pet ou missão foi modificado.

## Comportamento

[Certo] `catchup.pending` agenda o próximo sync no mínimo 2.000 ms depois do anterior. Apenas o observador do `AppLayout` mantém o timer automático; a arena usa a mesma query sem segundo timer e preserva `refetch()` manual imediato. Falhas com snapshot em cache usam 30/60/120 s, com teto de 120 s; uma resposta de sync válida e da identidade atual zera o contador. Foco, reconexão e remontagem por navegação consultam o mesmo prazo; a troca confirmada de conta ou geração Auth inicia contador próprio.

[Certo] A query mantém `sync_auto_adventure` sem argumentos, usa `AbortSignal` quando o builder o oferece, rejeita resposta antiga após mudança de conta/época e não atribui falha antiga à sessão nova. Quando já havia snapshot em cache, a nova geração limpa o resumo daquela identidade e revalida uma vez; o refresh confirmado da mesma sessão preserva a montagem e o prazo. `parseAdventureSnapshot`, recompensa, `advance_auto_adventure` e autoridade de tempo/combate continuam no contrato anterior. O resumo `pending` → resposta final de zero batalhas foi exercitado com shell e arena montados, sem duplicação.

## Evidência local

| Medida | Antes neste HEAD | Depois neste checkout |
| --- | ---: | ---: |
| Uma aba, `App`/rotas/shell/arena, `catchup.pending`, inícios de RPC em 10 s | 40 | 5 |
| Mesmo cenário em 60 s | 240 | 30 |
| Máximo simultâneo no cenário | 1 | 1 |

[Certo] A fixture usa timers falsos e resposta simulada de 1 ms na fronteira da API. O log anterior é `C:\Users\Murillo\Documents\chatwork\auth-incidente-20261029\main-port\baseline-mounted.log`; o teste novo `AutoAdventureCadence.test.tsx` fixa 5/30, máximo 1, recuo 30/60/120, recuperação, foco, reconexão, navegação, botão manual, troca de conta e fechamento do resumo. O relatório do checkout irmão mediu erro com cache em 2/7 antes e 2/3 depois em 10/60 s; esses números são referência daquele checkout, não medição nova desta base.

[Certo] `AutoAdventureSessionCadence.test.tsx` monta o `AuthProvider` real com `getUser(token)` simulado: sessão nova da mesma conta revalida, resposta tardia não altera cache/resumo, erro tardio não aumenta o recuo novo, e `TOKEN_REFRESHED` da mesma sessão mantém a montagem. Isso é prova local de lógica de cliente, não autenticação de navegador ou GoTrue remoto. Os registros BUG-44 e BUG-47 no Notion foram consultados somente para preservar o limite causal e o encerramento do resumo.

[Certo] `vitest run`: 77 arquivos, 535/535 testes, saída 0 (`full-vitest-final.log`). `npm run build`: saída 0 (`build.log`). `npx tsc --noEmit -p tsconfig.app.json --pretty false`: saída 2, 44 diagnósticos idênticos linha a linha à base (`baseline-tsc.log` e `post-tsc-final.log`), zero delta nos caminhos tocados. ESLint direcionado aos seis arquivos alterados/criados: saída 0 (`eslint-final.log`). `git diff --check`: saída 0. Todos os logs ficam em `C:\Users\Murillo\Documents\chatwork\auth-incidente-20261029\main-port`.

## Limites e próximo gate

[Provável] Se cada RPC quitar apenas um lote, o piso de 2 s pode alongar o catch-up em aproximadamente oito vezes frente a 250 ms, além da duração das próprias chamadas. Após falhas repetidas, o próximo sync automático pode esperar 120 s; a atualização manual continua disponível.

[Incerto/a] A fixture não mede tráfego real entre abas, custo PostgreSQL, cancelamento de SQL após abort HTTP, CPU, memória, I/O ou efeito em Auth. BUG-44 registra pressão de memória/I/O relatada pelo provedor para episódio anterior, sem provar que este cliente causou o incidente de 29/10; BUG-47 registra a correção já publicada do resumo. Não houve sonda remota, escrita remota, servidor local, commit, push, merge ou deploy. Browser QA e revisão fria ficam com a coordenação.
