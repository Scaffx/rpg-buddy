# Cadência da aventura: prazo preservado na remontagem — 29/10/2026

## Escopo e diagnóstico

[Certo] Checkout `Scaffx/rpg-cadencia-20261029`, HEAD `d787af6499dfed0a0ea75f7431d57294d633a634`. Esta entrega toca `src/hooks/useAutoAdventure.ts`, `src/lib/autoAdventurePayload.ts`, `src/test/AutoAdventureCadence.test.tsx`, `src/test/AutoAdventurePayload.test.ts` e este relatório. `src/test/AutoAdventureSessionCadence.test.tsx` permanece com SHA-256 `d4fc1c7c2b1f20dbd4476b22583b723ad1d1d9aae9462a5567fc675430797cdc`.

[Certo] O `QueryObserver` cria `setInterval` novo a cada montagem. Antes do fix, o intervalo de erro com snapshot era sempre 30/60/120 s e o de `catchup.pending` sempre 2 s, mesmo quando parte desse prazo já havia passado desde `errorUpdatedAt` ou `dataUpdatedAt`. Em `App`/rotas reais com RPC simulada, os dois testes novos do checkout falharam antes da mudança: após erro cacheado e navegação aos 20/29 s, não havia terceiro sync no vencimento original; após `pending` e remontagem perto de 2 s, também não havia segundo sync. O gate independente `AutoAdventureDeadlineExpected.test.tsx`, SHA-256 `fdc6a3739639f27ea582c08c81fa1ec191fd36cc5ee79aee9ea5fa53ae4fa393`, reproduziu 6/8 antes do fix, com essas duas falhas.

## Mudança

[Certo] O hook calcula o intervalo restante do recuo de falha pelo último `errorUpdatedAt`. O helper calcula o restante do piso `pending` de 2 s pelo `dataUpdatedAt`. Se o prazo já venceu e não houve refetch, ambos usam 1 s para evitar um intervalo de 1 ms repetido enquanto a aba está sem foco. Durante uma RPC em andamento, o observador não mantém timer periódico; a conclusão recalcula o prazo a partir do estado atualizado. A conta, sessão confirmada, marcador em memória, guarda de identidade, resumo, refetch manual imediato, um observador de layout e as regras de foco/reconexão ficam no contrato existente. Não houve alteração de AuthProvider, SQL ou backend.

## Prova local e limite

[Certo] `npx vitest run src/test/AutoAdventureCadence.test.tsx src/test/AutoAdventureSessionCadence.test.tsx src/test/AutoAdventurePayload.test.ts`: 24/24. `npx vitest run --root C:/Users/Murillo/AppData/Local/Temp/cadencia-review-proof-20261029 --config C:/Users/Murillo/orca/workspaces/rpg-buddy/rpg-cadencia-20261029/vitest.config.ts src/test/AutoAdventureDeadlineExpected.test.tsx`: 8/8 após o fix. `npx vitest run`: 77 arquivos e 541/541 testes (baseline 538; três testes novos de cadência). `npm run build`, lint dos cinco arquivos de código/teste tocados e `git diff --check`: exit 0. `npx tsc -p tsconfig.app.json --noEmit`: exit 2, 44 diagnósticos, delta zero ante baseline de 44 e nenhum nos arquivos tocados.

[Certo] Os testes cobrem prazo de erro cacheado com navegações em 20 e 29 s, nenhum sync antes de 30 s, piso `pending` apesar de remontagens, ausência de sobreposição de RPC, prazo vencido com foco ausente, recuos 30/60/120 s e reset após resposta válida, refresh da mesma sessão, saída/reentrada com `getUser(token)` confirmado e fallback em memória. O teste usa jsdom e RPC/GoTrue simulados; QA autenticado no servidor local 5191 cabe à coordenação. Não houve instalação, commit, push, deploy ou alteração remota.

## Fonte congelada para QA e revisão

| Arquivo | SHA-256 dos bytes locais |
| --- | --- |
| `src/hooks/useAutoAdventure.ts` | `72eeb7e2d26469845bae679ea98c9c1ac32b1c35cfe7206599d92a570ee013bd` |
| `src/lib/autoAdventurePayload.ts` | `1d98bda25307d7d84eddcf2fa748c45eef8722177f298ffda98177461e1edc22` |
| `src/test/AutoAdventureCadence.test.tsx` | `a3ac320f3aa516a164fec64f567e47754308385ca664692fc3969cc694a90369` |
| `src/test/AutoAdventurePayload.test.ts` | `7cf644d44683b4ff5b905737d62bd6556e925245aa594e10ee9342cb2fd09938` |
| `src/test/AutoAdventureSessionCadence.test.tsx` | `d4fc1c7c2b1f20dbd4476b22583b723ad1d1d9aae9462a5567fc675430797cdc` (não alterado nesta entrega) |

[Provável] O build e os testes locais sustentam o fix de prazo; a verificação autenticada de navegação no QA 5191 e a revisão fria final ainda podem revelar diferenças de ambiente.
