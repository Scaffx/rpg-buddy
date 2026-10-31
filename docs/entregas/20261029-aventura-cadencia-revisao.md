# Revisão fria: cadência da aventura — 29/10/2026

## Veredito

[Certo] No recorte congelado abaixo, não encontrei regressão P1/P2 acionável em cadência, identidade, cache, avanço ou resumo. O patch limita a repetição local de `sync_auto_adventure` sem alterar o contrato da RPC nem derivar progresso, eventos ou recompensas no cliente. Este veredito é sobre fonte e fixtures locais, não sobre custo SQL ou comportamento do deploy.

[Certo] A afirmação de verificação TypeScript no relatório do autor exige correção de escopo: `npx tsc --noEmit` na raiz usa um `tsconfig.json` com `files: []` e referências, e não prova a compilação de `tsconfig.app.json`. Executei o projeto explicitamente: há 44 diagnósticos em caminhos fora dos cinco arquivos revisados e zero diagnósticos nesses cinco caminhos. Portanto, o typecheck global continua vermelho; não atribuo os 44 erros a este patch.

## Fonte congelada e propriedade

[Certo] Base local `HEAD c13d5ab3da2af18987ca2f08cd5793d4f8a10c00`; comparei as quatro alterações rastreadas por `git diff` e o teste novo não rastreado. Os SHA-256 dos cinco blobs de trabalho foram iguais antes e depois dos testes:

| Arquivo | SHA-256 |
| --- | --- |
| `src/components/AutoAdventure.tsx` | `EDB24C7997CA0B78610EFE153760A4B14FB1168F1FB4100CD9DD684ECB0377B4` |
| `src/hooks/useAutoAdventure.ts` | `56191E475D246BA90F1E2221AFF92AC735FE711251E167BDB6E4E00C589CAA56` |
| `src/lib/autoAdventurePayload.ts` | `2C286043787403F0B336D00F278A38792C11190B08D5B01EA2B5FD8499672B1F` |
| `src/test/AutoAdventurePayload.test.ts` | `38B082DFD1561E62535B8895EB7154A8FE7612277E706D05F4EDA996978D535F` |
| `src/test/AutoAdventureCadence.test.tsx` | `ED156DDCB1D85DD92A8D1A1F8E1BA19A71FABF2F49B800CBE1819DCF4BE10394` |

[Certo] Minha única escrita é este relatório. Os arquivos de produto, o relatório do autor, pets SQL/UI e o harness `work/` permaneceram somente leitura; o SQL novo de pets é um alvo móvel fora desta revisão.

## Caminhos de risco examinados

[Certo] `src/lib/autoAdventurePayload.ts:114-121` troca somente o piso de `catchup.pending` de 250 para 2.000 ms. `src/hooks/useAutoAdventure.ts:111-123` mantém um intervalo somente no observador `background`; `src/components/AppLayout.tsx:49-52` é a única chamada de produção com `background: true`, enquanto `src/components/AutoAdventure.tsx:49-55` observa a mesma chave sem timer. A arena de `src/pages/BossPage.tsx:415,461` está dentro do shell. O teste com `App` real e shell + arena em `src/test/AutoAdventureCadence.test.tsx:144-153` observou máximo de uma RPC simultânea.

[Certo] `src/hooks/useAutoAdventure.ts:15-25,103-123` aplica 30/60/120 s após falhas com snapshot em cache e bloqueia foco/reconexão durante o prazo; a sequência só zera após resposta `sync` aceita em `:91-102`. `src/components/AutoAdventure.tsx:155-159,236-237` preserva atualização manual imediata, inclusive na tela de erro. O teste em `src/test/AutoAdventureCadence.test.tsx:155-196` executa falhas sucessivas, recuperação, foco, reconexão e clique manual. A navegação não tem um teste novo específico de cadência; a leitura de `refetchOnMount` em `:119-122`, do único shell e da chave estável é a evidência para remount. `src/test/AutoAdventureSessionContinuity.test.tsx` também executa remount após navegação com Auth confirmado, mas sem combinar navegação e recuo de 120 s na mesma fixture.

[Certo] `src/hooks/useAutoAdventure.ts:28-35,60-107,125-137` mantém escopo por conta/`authEpoch`, aborta ou rejeita resposta antiga e não deixa retorno de cache ou `server_now` anterior substituir snapshot novo. Os testes `AutoAdventureSyncRace` e `AutoAdventureSessionContinuity` cobrem A→B→A, nova sessão confirmada, refresh da mesma sessão, resposta atrasada e `server_now` regressivo. `src/lib/adventureClock.ts:3-20` ancora apenas resposta confirmada e usa tempo monotônico para projetar eventos; não há mudança nessa lógica. O teste de sessão usa `AuthProvider` real com `getUser(token)` simulado; o teste de cadência usa Auth simulado.

[Certo] `src/hooks/useAutoAdventure.ts:37-58,64-72` preserva o resumo acumulado por snapshot aceito; `:168-215` mantém o `advance_auto_adventure` por `battleId`, a guarda de geração/cache e as invalidações de ouro, inventário e outros saldos confirmados. Os testes `AutoAdventureSync`, `AutoAdventureAdvanceCache`, `AutoAdventureAccountSwitch` e `AutoAdventure.test.tsx` passaram para lotes `pending`→`completed`, recompensas e avanço. O patch não toca parser de recompensas, projeção da cena nem essas guardas de avanço.

## Execução e limite da medição

[Certo] `npx vitest run AutoAdventure`: 12 arquivos, 56/56 testes, saída 0. `npx eslint` direcionado aos cinco arquivos: saída 0. `git diff --check` nas quatro alterações rastreadas: saída 0. `npx tsc -p tsconfig.app.json --noEmit --pretty false`: saída 1, 44 diagnósticos fora do recorte e zero nos cinco caminhos; isto não é um build global limpo.

[Certo] Reexecutei, sem editar, o harness antigo `work/auth-incidente-20261029/client-pressure.test.tsx`. Na fixture de uma aba, com `App`/shell/arena, resposta artificial de 1 ms e timers falsos: `catchup.pending` caiu de 40/240 para 5/30 inícios de RPC em 10/60 s (87,5% menos nas duas janelas); primeiro sucesso seguido de 504 com cache caiu de 2/7 para 2/3 (mesma contagem em 10 s, 57% menos em 60 s). O máximo simultâneo foi 1. A reexecução teve 1 teste aprovado e 1 reprovado, porque a asserção anterior em `work/auth-incidente-20261029/client-pressure.test.tsx:148` ainda exige mais de 20 chamadas em 10 s; os números pós-patch foram impressos antes dessa asserção. O teste persistente novo usa os limites novos e passou 3/3.

[Provável] Se cada RPC quitar só um lote, o piso de 2 s pode alongar o catch-up por cerca de 8 vezes em relação ao piso anterior de 250 ms, além da duração das RPCs. Depois de três erros consecutivos com cache, a próxima tentativa automática pode esperar 120 s; a arena mostra indisponibilidade nesse intervalo, com botão manual em `src/components/AutoAdventure.tsx:155-159`. São custos explícitos da mitigação, sem evidência de violação de requisito P1/P2 neste recorte.

[Incerto/a] Fixtures locais não demonstram taxa real de abas, custo PostgreSQL, cancelamento de SQL após abort HTTP, latência de Auth, fluxo GoTrue/PostgREST autenticado ou redução de CPU/memória/I/O em produção. Não fiz sonda remota, DDL, instalação, commit, push ou deploy.
