# Revisão fria: quarentena de I/O no cliente Supabase

Data: 2026-10-26. Escopo: `src/integrations/supabase/client.ts`, `src/lib/authDataGate.ts` e uso de Realtime pelo produto. Esta é uma revisão de WIP local; não é aprovação do produto nem prova de Auth, RLS ou Realtime remotos.

## Identificação da amostra

- Worktree: `rpg-auth-foco-20261026`, branch `Scaffx/rpg-auth-renovacao-20261026`, HEAD inicial `8a1ff387e9e2bc9745048d3d7ff8e6499afb0976`.
- Amostra inicial de `client.ts`: SHA-256 `C185D61298832479D4D7C8B1AD113C14E2DC5006452D3D14AF4E53CDB865774B`; `authDataGate.ts`: SHA-256 `0FA3EE1EF93525A32C4A74F9F62D8DDF1422102952B0F90BEEB5B1B98380EF7D`.
- Após correção concorrente de `pauseRealtime`, `authDataGate.ts`: SHA-256 `9973A390E1312729A1F08E7B3D6F1B9A632E9F7A8678E34521EC9BF66A7C1E79`; `client.ts` permaneceu com o hash acima nesse ponto. O HEAD não congela esses arquivos WIP.
- Após correção concorrente do fallback HTTP, `client.ts`: SHA-256 `3D7C4B8074E5E08878909735ACFF5B744B68F69950D6AAF14DD6F4B9EC2E7D4F`; `authDataGate.ts` permaneceu com o hash acima.
- SDK instalado na amostra: `@supabase/supabase-js` 2.101.1. O teste usa `RealtimeClient` instalado e tokens de fixture, sem conexão remota.

## Método e resultado parcial

`src/test/authClientQuarantineReview.test.ts` importa o módulo **real** `client.ts` e o gate real; só `createClient` é mockado para capturar as opções e controlar o socket. O caso de fallback constrói o `RealtimeClient` real com as opções recebidas pelo mock, para percorrer `channel.send()` como em `DungeonArena.tsx:714-716`.

- Auth remoto e chave pública exata: passaram. Um JWT de fixture emitido antes de `consider()` não foi enviado; durante a confirmação, o pedido esperou `approve()`.
- Rejeição, aborto, timeout de 15 s e expiração de token anteriormente aprovado: passaram sem reaproveitar o pedido com outra aprovação nem gerar fetch de dados.
- Realtime antes da correção: o teste de socket conectado falhou, pois `client.ts:26-29` chamava `pauseRealtime`, mas `authDataGate.ts:37-40` só invocava `disconnect()` na microtarefa posterior. O setter nativo não recebeu o candidato. Após a correção concorrente que invoca `disconnect()` imediatamente e aguarda seu término, esse teste passou.
- Realtime após logout: o teste **falhou na amostra parcial**. Com token antes aprovado, `clear()` e `pauseRealtime()`, um canal sem socket ativo fez `send({ type: 'broadcast' })` cair para HTTP. O SDK enviou `Authorization: Bearer <token de fixture anterior>` para `/realtime/v1/api/broadcast` por `fetch` nativo. `client.ts:18-19` configurava o gate apenas em `global.fetch`, sem `realtime.fetch`. O SDK usa valor de token em cache para o fallback REST; `disconnect()` não o invalida. Esse cenário era reutilização de token **anteriormente aprovado após logout**, não envio de token candidato antes da aprovação. Após o owner ligar `realtime.fetch` ao gate em `client.ts:19-22`, o mesmo teste passou sem chamar o fetch nativo.

Comando: `node_modules/.bin/vitest.cmd run src/test/authClientQuarantineReview.test.ts --reporter=verbose`. Inicialmente: 4 aprovados, 2 falharam. Após a primeira correção concorrente: 5 aprovados, 1 falhou (fallback HTTP). Após a segunda: **6 aprovados, 0 falhas**. `node_modules/.bin/eslint.cmd src/test/authClientQuarantineReview.test.ts`: saída 0. `node_modules/.bin/tsc.cmd --noEmit -p tsconfig.app.json --pretty false`: 44 erros globais no snapshot; nenhum em `authClientQuarantineReview.test.ts`, `authDataGate.ts` ou `client.ts`.

## Limites e reteste necessário

Os testes não provam que a sessão remota é legítima: o gate só recebe `approve()` do fluxo superior. Não houve browser, conta de teste, banco, servidor Realtime real, merge, publicação nem tráfego com credenciais reais. `createClient` foi mockado; no caso de broadcast, seu mock construiu o `RealtimeClient` instalado usando as opções reais do módulo. A revisão deve ser repetida contra hashes finais depois de congelar o WIP; o coordenador fará a revisão final e QA no browser.
