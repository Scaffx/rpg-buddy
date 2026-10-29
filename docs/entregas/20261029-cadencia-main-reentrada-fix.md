# Cadência da aventura: reentrada da mesma conta após saída externa — 29/10/2026

## Escopo e fonte congelada

[Certo] Checkout `Scaffx/rpg-cadencia-20261029`, HEAD `d787af6499dfed0a0ea75f7431d57294d633a634`. Esta entrega altera apenas `src/hooks/useAutoAdventure.ts`, `src/test/AutoAdventureSessionCadence.test.tsx` e este relatório. A revisão fria de partida é `docs/entregas/20261029-cadencia-main-revisao.md`. O hash inicial SHA-256 do hook naquela revisão era `a0c89d38a849fe29ff9180d86030bab337be64985acd443bc41e113d644337a7`; o teste inicial era `bd2a9f383b2ffb7db4dbdce66d0d43f65640da7e57409c87c295c29770b8daa8`.

| Arquivo final | SHA-256 dos bytes locais | Blob Git do conteúdo |
| --- | --- | --- |
| `src/hooks/useAutoAdventure.ts` | `e57fb240f1d347a433135f5ad50de1dc8d392433684d318518dce9e429287011` | `dba2ea639e9100e68058da6b2b68f00062dc055a` |
| `src/test/AutoAdventureSessionCadence.test.tsx` | `d4fc1c7c2b1f20dbd4476b22583b723ad1d1d9aae9462a5567fc675430797cdc` | `c43aabdae47e111446954f53dbd6678a707576dd` |

## Diagnóstico e correção

[Certo] O novo teste reproduziu a lacuna com `App`, `AuthProvider` e `Routes` reais: após `SIGNED_OUT` externo, a rota protegida desmonta o hook; um `SIGNED_IN` posterior da mesma conta passa por `getUser(novoToken)` e remonta o hook, mas o estado anterior de cache/identidade impedia sync imediato. Antes do fix, `npx vitest run src/test/AutoAdventureSessionCadence.test.tsx` falhou no cenário novo: esperava 3 chamadas a `sync_auto_adventure` (inicial, antiga em voo, nova), recebeu 2. A revisão fria já registrara que a base anterior também podia reutilizar cache fresco; a prova aqui delimita a garantia de revalidação agora exigida, sem atribuir regressão exclusiva ou causalidade a incidente de Auth.

[Certo] `useAutoAdventure.ts:14-36` agora separa gerações de cache pelo `ownerId`, `continuity.epoch` e vínculo `sub`/`iss`/`session_id` do `Auth.session` já confirmado. Se esse vínculo faltar, usa o token confirmado como marcador somente em memória, alinhado ao fallback de `AuthDataGate.approve`; não vai para log, DOM, storage ou chave da query. Esses valores servem apenas ao cache: autorização e estado de aventura continuam dependentes do `getUser(token)` no `AuthProvider` e da resposta do RPC. Um refresh da mesma sessão vinculada mantém o marcador mesmo com token e objeto de sessão novos. Uma nova sessão da mesma conta recebe contador de falhas zero e força uma única revalidação do snapshot existente pelo mecanismo já presente; o resumo antigo é limpo e resposta antiga tardia não altera cache ou resumo.

## Prova local

[Certo] Após o fix, o teste de sessão passou 6/6. Os cenários com `SIGNED_OUT` intermediário provam cache fresco com `next_at` distante, nova confirmação por `getUser`, exatamente um sync novo, resposta antiga tardia ignorada, resumo anterior limpo e recuo antigo de 120 s não herdado; uma falha da sessão nova volta ao primeiro recuo de 30 s. A reentrada com tokens confirmados sem `iss`/`session_id` também foi reproduzida antes do fallback (1 sync observado, 2 exigidos) e passou depois; os tokens não aparecem nas chaves da query. O cenário `TOKEN_REFRESHED` da mesma sessão vinculada mantém a montagem e o recuo já iniciado, sem sync adicional durante a confirmação. A navegação de rota continua coberta no teste de substituição direta de sessão.

[Certo] `npx vitest run src/test/AutoAdventureSessionCadence.test.tsx`: 6/6 testes. `npx vitest run`: 77 arquivos, 538/538 testes. `npm run build`: exit 0. `npx eslint src/hooks/useAutoAdventure.ts src/test/AutoAdventureSessionCadence.test.tsx`: exit 0. `git diff --check`: exit 0. `npx tsc -p tsconfig.app.json --noEmit`: exit 2, 44 diagnósticos, delta 0 ante os 44 do baseline documentado e nenhum nos arquivos tocados. A suíte focada anterior à extensão sem vínculo passou 20/20; a suíte completa posterior inclui o cenário novo.

## Limites

[Incerto/a] O teste usa GoTrue/RPC simulados em jsdom. Não prova autenticação real de navegador, execução ou cancelamento de SQL no servidor, tráfego remoto ou efeito no incidente Auth. Se um token sem vínculo mudar após confirmação, o fallback pode revalidar dados novamente; o hook não usa esse marcador para autorização nem reinicia a página. O QA externo na porta 5191 pertence à coordenação e deve ser recarregado sobre estes hashes. Não houve sonda ou escrita remota, instalação, commit, push, deploy ou parada de servidor.
