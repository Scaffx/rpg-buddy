# Revisão independente final da cadência — 29/10/2026

## Fonte congelada

[Certo] Checkout `Scaffx/rpg-cadencia-20261029`, HEAD `d787af6499dfed0a0ea75f7431d57294d633a634`. O primeiro freeze do autor foi seguido por uma correção do prazo de navegação; os hashes abaixo correspondem ao segundo freeze comunicado pelo novo autor e conferido localmente. Esta revisão não alterou produto, testes, Auth nem SQL.

| Arquivo | SHA-256 dos bytes locais | Blob Git do conteúdo |
| --- | --- | --- |
| `src/components/AutoAdventure.tsx` | `15d4a7eb9a7825c844a8358914e50cda174baedfab8f1b15dfd90b54914d8b20` | `a361052ec57b9ccfa195ccd38786206ae8de72a2` |
| `src/hooks/useAutoAdventure.ts` | `72eeb7e2d26469845bae679ea98c9c1ac32b1c35cfe7206599d92a570ee013bd` | `386340a6deca942d50923656bc8c5054fd0385ee` |
| `src/lib/autoAdventurePayload.ts` | `1d98bda25307d7d84eddcf2fa748c45eef8722177f298ffda98177461e1edc22` | `827953ec886922de926e90f98ea2c2199d093f34` |
| `src/test/AutoAdventurePayload.test.ts` | `7cf644d44683b4ff5b905737d62bd6556e925245aa594e10ee9342cb2fd09938` | `d88f73c02b2c9347d05c87552a8734b28c7b49dd` |
| `src/test/AutoAdventureCadence.test.tsx` | `a3ac320f3aa516a164fec64f567e47754308385ca664692fc3969cc694a90369` | `4fb638a390d9edeb351e789f55cf5014e2f6c6c8` |
| `src/test/AutoAdventureSessionCadence.test.tsx` | `d4fc1c7c2b1f20dbd4476b22583b723ad1d1d9aae9462a5567fc675430797cdc` | `c43aabdae47e111446954f53dbd6678a707576dd` |

[Certo] `src/App.tsx`, `src/components/AppLayout.tsx` e `src/hooks/useAuth.tsx` permanecem iguais a HEAD, com SHA-256 `edf1208a2ea404921297635728c96ea7a741ee680c28e16401ce59a6dc289686`, `f431c20911a923326667c73616824c8db8a24be0d3e9735f8a33d3de84625e24` e `9238657eacb66480bc48850bfc4bb762f8bc93117433a62a6b56a94f606a5cd9`. Os relatórios dos autores `20261029-cadencia-main-reentrada-fix.md` e `20261029-cadencia-prazo-fix.md` tinham SHA-256 `8fc12342ed3900c9190a52d1de92ff400c691e3d465b75c06ce7acc8f6f541c6` e `28a220fd3fcb37647c58dc593472c557f27ef829dca114e227e7de6ed8c51e63` na conferência.

## Resultado no recorte

[Certo] **Sem P1/P2 aberto no recorte congelado.** O P2 encontrado no primeiro freeze foi reproduzido: `QueryObserver` reiniciava um intervalo completo quando a rota remontava após parte do recuo de 30 s ou do piso `pending` de 2 s. No primeiro freeze, após erro cacheado em `t=0` e navegação em `t=20 s`, o sync ocorria em aproximadamente `t=50 s`, ultrapassando o prazo original de `t=30 s`; após `pending` em `t=0` e navegação em `t=1,5 s`, ocorria em aproximadamente `t=3,5 s`. A base HEAD também usava intervalo relativo, mas tinha recuo fixo de 10 s e não satisfazia o contrato novo; o achado era uma lacuna da garantia solicitada, não uma regressão exclusiva contra a base.

[Certo] No segundo freeze, `src/hooks/useAutoAdventure.ts:43-46,110-120` calcula o restante do recuo desde `errorUpdatedAt`, desliga o timer enquanto a query está em voo e mantém os filtros de foco, reconexão e remontagem. `src/lib/autoAdventurePayload.ts:104-115` calcula o restante dos 2 s desde `dataUpdatedAt`. Após um prazo já vencido, ambos usam um intervalo limitado de 1 s para evitar repetição rápida; esta latência limitada está documentada no relatório do novo autor. `src/components/AppLayout.tsx:49-52` mantém o único observador com timer, e `src/components/AutoAdventure.tsx:64-67` usa a mesma query sem timer e conserva o refetch manual.

[Certo] `AuthProvider` continua exigindo `getUser(token)` para cada candidata (`src/hooks/useAuth.tsx:203-222`); não foi alterado. O hook usa `sub`/`iss`/`session_id` ou, sem vínculo, o token já confirmado como marcador de cache apenas em memória (`src/hooks/useAutoAdventure.ts:14-36,81-86`), sem gravá-lo em chave de query, storage, DOM ou log. Os testes de sessão cobrem nova sessão da mesma UID após `SIGNED_OUT`, reset do recuo, revalidação única, descarte de resposta e resumo antigos, e refresh da mesma sessão vinculada sem remontagem nem reinício do prazo.

## Prova local

[Certo] Reexecutei `npx vitest run src/test/AutoAdventurePayload.test.ts src/test/AutoAdventureCadence.test.tsx src/test/AutoAdventureSessionCadence.test.tsx`: 3 arquivos, **24/24 testes**, exit 0. O teste de sessão monta `App`, `AuthProvider` e `Routes` reais com GoTrue/RPC simulados; o teste de cadência monta `App`, shell e arena com Auth simulada para medir 2 s, recuos de 30/60/120 s, máximo de uma RPC em voo, foco, reconexão, navegação e botão manual.

[Certo] Gate independente em `%TEMP%/cadencia-review-proof-20261029/src/test/AutoAdventureDeadlineExpected.test.tsx`, SHA-256 `fdc6a3739639f27ea582c08c81fa1ec191fd36cc5ee79aee9ea5fa53ae4fa393`: **6/8 no primeiro freeze**, falhando somente nos dois prazos de navegação; **8/8 no segundo freeze**, exit 0. O gate monta `App`, `AuthProvider` e `Routes` reais com API simulada e exige sync até `t=30,1 s` após erro cacheado e até `t=2,1 s` após `pending`, mesmo com remontagem. `git diff --check` terminou com exit 0. O novo autor informou 541/541 na suíte completa, build e lint verdes, e 44 diagnósticos TypeScript iguais ao baseline; não reexecutei essas verificações amplas.

## Limites

[Incerto/a] jsdom, tempo virtual e API simulada não provam autenticação real, execução/cancelamento do SQL, recurso do servidor nem causalidade do incidente de Auth. O QA do navegador real na porta 5191 e o servidor pertencem ao root. Esta conclusão vale somente para os hashes acima; qualquer drift exige nova comparação e reteste. Não houve escrita remota, instalação, commit, push, deploy, navegação no QA ou reinício de processo nesta revisão.
