# Revisão fria da cadência no checkout main — 29/10/2026

## Escopo congelado

[Certo] Revisão somente leitura do produto e dos testes em `Scaffx/rpg-cadencia-20261029`, HEAD `d787af6499dfed0a0ea75f7431d57294d633a634`. Examinei os três arquivos de produto e os três testes abaixo; nenhuma correção de produto, teste, Auth ou SQL foi feita. Os hashes SHA-256 representam os bytes locais; os blobs Git permitem recuperar precisamente o conteúdo revisado, inclusive dos testes ainda não rastreados.

| Arquivo | SHA-256 local | Blob Git do conteúdo |
| --- | --- | --- |
| `src/components/AutoAdventure.tsx` | `15d4a7eb9a7825c844a8358914e50cda174baedfab8f1b15dfd90b54914d8b20` | `a361052ec57b9ccfa195ccd38786206ae8de72a2` |
| `src/hooks/useAutoAdventure.ts` | `a0c89d38a849fe29ff9180d86030bab337be64985acd443bc41e113d644337a7` | `9ffab2fa2efb3d428bb88c44d69ae4d56ef38130` |
| `src/lib/autoAdventurePayload.ts` | `8aa85beb3e07def3103f8adde7e8accd3ecf36fa95586b7cbc2a684e62d8cbb6` | `b96daf31998162bd60aed74dba91630f57365e87` |
| `src/test/AutoAdventurePayload.test.ts` | `ead9921bf2c4240e0eb322ba34ed8b3227207a8b078e45be62f6ae5a498ae98b` | `0d8ec19d8d15db9b1fb02a415e6280469f7f3568` |
| `src/test/AutoAdventureCadence.test.tsx` | `4a26806a2025221febbbd3aeefe6e95a868e86012d1f498001db696d6a9b75488` | `07e2f603cb471863631f0cfbdc25bd27896f25bc` |
| `src/test/AutoAdventureSessionCadence.test.tsx` | `bd2a9f383b2ffb7db4dbdce66d0d43f65640da7e57409c87c295c29770b8daa8` | `8787e5acdb4bf32669e82d77299ba5471690f12b` |

## Achado

**P2 — reentrada da mesma conta após `SIGNED_OUT` externo pode usar snapshot da sessão anterior sem revalidação imediata.** [Provável] Em `src/hooks/useAutoAdventure.ts:14-20`, a identidade continua a mesma se `ownerId` e `authEpoch` coincidirem. O evento `SIGNED_OUT` recebido por `AuthProvider` executa `accept(null)` em `src/hooks/useAuth.tsx:254-255`, sem aumentar `continuity.epoch`; os hooks da rota protegida desmontam quando `user` vira `null` (`src/App.tsx:97-103`), de modo que `trackIdentity` não observa o dono nulo. Um `SIGNED_IN` posterior da mesma conta, em outra sessão, também não aumenta a época quando já não há sessão confirmada (`src/hooks/useAuth.tsx:180-195`). Se o cache da query tiver menos de 10 s, `refetchOnMount` exige `current.isStale()` e não faz novo sync (`src/hooks/useAutoAdventure.ts:85,94-105`). Com snapshot `pending=false` e `next_at` distante, o timer segue esse próximo horário (`src/lib/autoAdventurePayload.ts:104-112`), deixando visível o snapshot anterior até outro gatilho. O teste de sessão cobre substituição direta por `SIGNED_IN` e refresh (`src/test/AutoAdventureSessionCadence.test.tsx:113-202`), mas não o evento `SIGNED_OUT` intermediário. Esta inferência é estática; não foi executado um teste desse fluxo específico. A base `d787af6` também podia reutilizar cache fresco por `staleTime` e `refetchOnMount`, portanto o achado delimita a garantia nova de revalidação, sem alegar regressão exclusiva desta mudança.

## Comportamento verificado

[Certo] O diff dos três arquivos de produto é de 64 inserções e 14 remoções, com uma só alteração na arena (`src/components/AutoAdventure.tsx:65`). O `AppLayout` conserva o único observador com timer (`src/components/AppLayout.tsx:49-52`); a arena usa a mesma query sem timer e conserva `refetch()` manual. `nextAdventureRefetchDelay` mudou apenas o intervalo de `catchup.pending` de 250 para 2.000 ms; o cálculo pelo relógio do servidor para `pending=false` continua igual. `sync_auto_adventure` continua sem argumentos; parse, tempo, combate e recompensa seguem dados devolvidos pelo RPC. `advance_auto_adventure` continua com `p_battle_id` e o fluxo anterior de cache/invalidação (`src/hooks/useAutoAdventure.ts:137-167`).

[Certo] No código, erro após snapshot válido incrementa `cachedFailures`, e o timer de erro usa 30/60/120 s, com teto em 120 s (`src/hooks/useAutoAdventure.ts:23-35,78-95`). Foco e reconexão consultam `errorUpdatedAt`; remontagem por navegação consulta o mesmo prazo e `isStale()`. Sucesso confirmado zera o contador (`:72-76`). Uma resposta antiga após troca de identidade é tratada como cancelada antes de parse, resumo ou contagem de falhas (`:69-82`). O `AbortSignal` é passado ao builder quando disponível; isso não prova cancelamento do SQL no servidor. O resumo `pending=true` seguido de lote final com zero batalhas preserva os totais e fecha `pending` (`:38-56`).

[Certo] Executei `npx vitest run src/test/AutoAdventurePayload.test.ts src/test/AutoAdventureCadence.test.tsx src/test/AutoAdventureSessionCadence.test.tsx`: 3 arquivos, 18/18 testes, exit 0. Os testes montam `App` com shell e arena para cadência, foco, reconexão, navegação e atualização manual; o teste de geração Auth monta `AuthProvider` real com `getUser(token)` simulado e cobre sessão substituída, RPC antiga tardia e `TOKEN_REFRESHED` da mesma sessão. O limite de uma chamada simultânea foi observado no mock de resposta de 1 ms; requisições HTTP canceladas ainda podem continuar a executar no servidor.

[Certo] Conferi os logs do autor em `C:\Users\Murillo\Documents\chatwork\auth-incidente-20261029\main-port`: `full-vitest-final.log` registra 77 arquivos e 535/535 testes; `build.log` termina em `built in 30.30s`; `baseline-tsc.log` e `post-tsc-final.log` são idênticos byte a byte e contêm 44 diagnósticos TS cada; `eslint-final.log` está vazio. `git diff --check` terminou com exit 0. O build completo e o TypeScript foram verificados pelos logs do autor, não reexecutados nesta revisão. O baseline montado registrou 40/240 inícios de RPC em 10/60 s; o teste focado atual fixa 5/30 no mesmo cenário de timer falso. A redução de 240 para 30 chamadas por minuto é medição local de mock, não evidência de CPU, I/O, Auth ou custo PostgreSQL em produção.

## Limites e decisão

[Provável] O piso de 2 s pode prolongar o catch-up quando cada RPC quita apenas um lote, e o recuo pode adiar recuperação automática por até 120 s após falhas repetidas. A atualização manual continua imediata. O caso `SIGNED_OUT` externo seguido de nova sessão da mesma conta precisa de cobertura e correção antes de afirmar revalidação imediata para toda sessão nova.

[Incerto/a] Não houve navegador autenticado, GoTrue/PostgREST real, tráfego entre abas, prova de interrupção de SQL após abort, medição de recurso do servidor ou sonda remota. Não há base para atribuir o incidente de Auth a esta cadência. O QA de navegador no servidor externo `5191` pertence à coordenação.
