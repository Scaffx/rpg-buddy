# Revisão focada do delta local — hordas, 28/10/2026

## Veredito

[Provável] **Não aceitar o freeze como integralmente fechado.** A corrida A→B→A está protegida no teste isolado com `QueryObserver`, mas o caminho de uma nova sessão confirmada da mesma conta não passa pelo efeito que promete cancelar e revalidar a consulta. O efeito observado decorre do código; não foi reproduzido em teste integrado de nova sessão.

[Certo] Checkout `C:/Users/Murillo/orca/workspaces/rpg-buddy/rpg-auth-foco-20261026`, branch `Scaffx/rpg-hordas-continuas-20261028`; HEAD/base `59148d56ea42b0ff9890aecdb0b493fde32695ae`. O WIP dos demais arquivos foi preservado. Esta revisão só criou este relatório; não houve commit, push, deploy, SQL remoto ou navegador.

## Delta identificado

[Certo] SHA-256 dos cinco arquivos entregues, após normalização CRLF→LF, coincide com `20261028-hordas-fix-final.md`:

| Arquivo | SHA-256 LF |
| --- | --- |
| `src/hooks/useAutoAdventure.ts` | `15b93e3d70e3c4762a3bf4b402235d388891013da88afd0e98ee5201ac5cc780` |
| `src/test/AutoAdventureSyncRace.test.tsx` | `c48fe57fd7f9d302118c5422d7e24619504c1cfb3401169d7ffeed9ab68f97a3` |
| `supabase/migrations/20261028214109_adventure_horde_continuous.sql` | `858c6600d4ec72fb45a833b1cc6b9cc20013497baa5c48f4782219e75e72a39b` |
| `supabase/tests/horde_20261028/draw.sql` | `3416055cbc9e7032a7588577a191c01411015be04e9945f3f96c08c03a93191c` |
| `MECHANICS.md` | `e07eec9b566f75286b7befb91607a47ff32e82a53200fe531d981204417433f6` |

## Os três achados originais

### P1 — `sync` antigo em A→B→A: fechado no hook; integração de sessão ainda falha

[Certo] `src/hooks/useAutoAdventure.ts:64-88` entrega o `AbortSignal` ao builder PostgREST, recusa resposta de geração anterior, mudança de cache e `server_now` mais antigo. A versão instalada de `@supabase/postgrest-js` implementa `abortSignal`. `src/test/AutoAdventureSyncRace.test.tsx:70-112` usa `QueryObserver` real: cache A permanece etapa 9 após a resposta antiga de etapa 1, B permanece intacto, o resumo não absorve o retorno velho e não há erro visível nem remontagem **nesse mock do hook**. `recordSummary` só recebe objeto aceito no cache e deduplica por identidade (`useAutoAdventure.ts:24-60`); o relógio do snapshot aceito conserva sua âncora. O teste focado passou.

[Provável] **Falha residual de integração, cenário reproduzível e impacto:** com A já em cache na etapa 8, `server_now` recente e `next_at` futuro, entre na mesma conta por uma nova sessão (`session_id` diferente) menos de 10 s depois. O `SIGNED_IN` invalida o vínculo anterior em `src/hooks/useAuth.tsx:256-264`, incrementa `continuity.epoch` e zera o usuário **antes** de `getUser(token)` confirmar a nova sessão (`:180-208`). `src/components/auth/AuthContinuityBoundary.tsx:95` usa essa época como `key`, portanto remonta a árvore. Na nova montagem, `previousIdentity.current` começa `null` em `src/hooks/useAutoAdventure.ts:51`; o efeito `:103-113` retorna em `:106` e não cancela/invalida a consulta de A. Como o cache A está fresco no `QueryClient` compartilhado (`src/App.tsx:58-67,200-213`), `staleTime: 10_000` e `refetchOnMount` condicionado a stale (`useAutoAdventure.ts:90,100`) deixam a etapa 8 e sua âncora de relógio visíveis sem RPC imediata. O resumo da mesma chave também permanece até ser reconhecido. Impacto: nova sessão pode mostrar batalha, etapa e resumo anteriores até outro evento de refetch; o crédito continua server-authoritative. A sequência é derivada do código, ainda sem teste integrado de nova sessão.

[Certo] `AutoAdventureSyncRace.test.tsx:130-149` simula `epoch` novo com `Probe` ainda montado e afirma `mounts=1`; esse par de condições não representa o `AuthContinuityBoundary` real. Uma renovação normal do mesmo vínculo mantém a época em `useAuth.tsx:259-260,170-174`, e por isso mantém a tela, mas também não aciona a revalidação do efeito. O teste de sessão precisa montar AuthProvider + boundary + hook e distinguir `SIGNED_IN` de novo `session_id` de `TOKEN_REFRESHED` do vínculo atual. O hook deve revalidar uma vez na montagem de uma geração confirmada nova, sem transformar refresh normal em remount ou loop.

### P2 — `encounters.end_reason`: fechado no clone PG17

[Certo] O delta SQL é somente a substituição de cinco linhas em `supabase/migrations/20261028214109_adventure_horde_continuous.sql:288-292`: `draw` com `engine_version='v4_horde'` projeta `event_limit`; demais versões projetam `turn_limit`. `pg_temp.horde_replace_once` exige uma ocorrência única (`:259-267`), preservando o preflight de fonte/owner/ACL da migração. A expressão original aparece uma vez na fonte sanitizada `docs/entregas/20261028-hordas-live-sources/sync.sql:576`.

[Certo] A evidência preservada em `C:/Users/Murillo/AppData/Local/Temp/rpg-hordas-fix-task483352/logs/candidate.log` registra `BEGIN`→`COMMIT` com código 0 informado pelo relatório do fix. `draw-projection.log` registra o wrapper público com `SET ROLE authenticated`, `HORDE_CLOCK_DRAW events=1134 last_seconds=899.800000`, as três verificações de retorno e `ROLLBACK`, sem erro. `draw.sql:46-69` cobre a primeira resposta, a seguinte e a projeção v3 sintética. O clone PG 17.9 foi encerrado e não foi reaberto nesta revisão. A linha v3 é um registro v4 reclassificado dentro da transação: ela prova a projeção condicional, não a execução histórica integral do motor v3.

### P2 — texto econômico: fechado como descrição da função capturada

[Certo] `MECHANICS.md:204-217` agora descreve a fórmula observada em `sync.sql:145-160,189-196`: 1–48 ouro por vitória completa, sem teto diário de ouro; 30 minutos condicionam item direto e o limite de dois itens é diário. A correção fecha a divergência factual apontada no relatório anterior quanto à função capturada.

## Verificação e limites

[Certo] Rodei `npm test -- src/test/AutoAdventureSyncRace.test.tsx src/test/AutoAdventureSync.test.tsx src/test/AutoAdventureAdvanceCache.test.tsx src/test/AutoAdventureAccountSwitch.test.tsx src/test/authRefreshContinuity.test.tsx`: **5 arquivos, 28 testes passaram**. `git diff --check` saiu sem erro. Os testes de hook usam Auth e RPC mockados; `QueryObserver` é real da versão instalada. Os testes de Auth verificam `getUser(token)` e continuidade em isolamento, mas não incluem o hook de aventura na árvore real.

[Certo] A evidência SQL é de um clone local sintético PG17 com `SET ROLE`, não de PostgREST nem da produção. A função de referência é captura sanitizada de 28/10/2026; não houve revalidação da definição viva neste turno. O coordenador executa a suíte completa e o refresh autenticado real separadamente.

[Certo] O coordenador informou em paralelo 558 testes em 82 arquivos, build e lint focado aprovados e `tsc` com 44 erros de baseline fora do fix. Também informou um refresh real pelo SDK que preservou a tela e a etapa 11; esse fluxo manteve `epoch` estável e não testa o cenário de nova sessão acima. Não refiz nem auditei esses comandos nesta revisão.
