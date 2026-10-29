# Integração da cadência na reforma — 29/10/2026

## Base e escopo

[Certo] Checkout `Scaffx/rpg-hordas-continuas-20261028`, HEAD `c13d5ab3da2af18987ca2f08cd5793d4f8a10c00`. A fonte congelada no checkout `rpg-cadencia-20261029` foi confirmada por SHA-256: hook `72eeb7e2d26469845bae679ea98c9c1ac32b1c35cfe7206599d92a570ee013bd`, helper completo `1d98bda25307d7d84eddcf2fa748c45eef8722177f298ffda98177461e1edc22` e teste de sessão `d4fc1c7c2b1f20dbd4476b22583b723ad1d1d9aae9462a5567fc675430797cdc`. A fonte main foi usada como contrato de comportamento; o hook e o parser completos não foram copiados.

[Certo] Alterações desta integração: `src/hooks/useAutoAdventure.ts`; somente `nextAdventureRefetchDelay` em `src/lib/autoAdventurePayload.ts`; `src/test/AutoAdventureCadence.test.tsx`, `src/test/AutoAdventureSessionCadence.test.tsx`, `src/test/AutoAdventurePayload.test.ts` e a fixture de sessão em `src/test/AutoAdventureSyncRace.test.tsx`. Os campos `participation`, `care_as_of`, `effective_bonus` e `effective_sustain` do parser de pet permanecem como estavam na reforma; o diff do payload tem apenas o hunk de cadência junto aos hunks de pet que já existiam antes desta integração. Não houve edição de AuthProvider, SQL, pet panel, companions, shop, i18n ou VFX.

## Comportamento integrado

[Certo] O hook agora distingue gerações de cache por UID, época Auth e vínculo `sub`/`iss`/`session_id` do token já confirmado por `AuthProvider.getUser(token)`. Quando faltam essas claims, o token confirmado vira marcador somente em memória. Claims e fallback não autorizam aventura, não entram na chave da query, DOM, log ou storage. Após `SIGNED_OUT` externo e `SIGNED_IN` da mesma UID, o cache visível é revalidado uma vez, o resumo anterior é limpo, o recuo reinicia e a resposta antiga não substitui a nova. Um `TOKEN_REFRESHED` com vínculo estável mantém a geração.

[Certo] O recuo de erro cacheado conta desde `errorUpdatedAt` e o piso de `catchup.pending` conta desde `dataUpdatedAt`, inclusive após navegação e remontagem. Se o prazo já venceu sem foco, o timer usa 1 s para evitar repetição rápida. Durante `fetchStatus !== 'idle'`, o observador do layout não mantém intervalo automático. A arena conserva refetch manual imediato; 30/60/120 s, no máximo uma RPC em voo no harness e dois segundos de piso `pending` continuam cobertos. A resposta válida da identidade atual zera o contador. O tempo de combate segue ancorado no `server_now` confirmado da reforma, em vez de substituir o helper pelo cálculo de parede do checkout main.

[Certo] Permaneceram no hook da reforma `anchorAdventureClock`, a guarda de snapshot mais recente, o resumo por snapshot aceito e as proteções de geração/cache do `advance_auto_adventure`; a integração não cria dano, HP, eventos ou recompensas. A fixture antiga de `AutoAdventureSyncRace` usava dois tokens opacos distintos para representar refresh da mesma sessão, incompatível com o fallback por token; ela agora usa claims vinculadas com o mesmo `session_id` no refresh. O teste de sessão novo monta `App`, `AuthProvider` e rotas reais, com GoTrue/RPC simulados.

## Verificação local

[Certo] Foco de cadência, sessão, payload e corrida: 4 arquivos, 24/24 testes. A suíte completa final passou 96 arquivos, 676/676 testes. `npm run build`: saída 0. `npx tsc -p tsconfig.app.json --noEmit --pretty false`: saída 2, 44 diagnósticos do baseline informado, nenhum nos caminhos tocados. ESLint dirigido aos seis arquivos de código/teste tocados e `git diff --check`: saída 0. A primeira suíte completa encontrou a fixture de refresh opaco; após corrigir a fixture, o foco passou. Uma repetição completa teve falha intermitente em `AutoAdventure.test.tsx` (hook simulado, teste isolado passou); a execução completa posterior passou 676/676.

| Arquivo na reforma | SHA-256 final |
| --- | --- |
| `src/hooks/useAutoAdventure.ts` | `6e37785b3e7ce96fd1e7ded6adf09b74c7f66f2cd1c93324cb745578c75cafe2` |
| `src/lib/autoAdventurePayload.ts` | `26bd9e38977f3aa55917ed13a536ebe42595eb23396a56c6032bd60bd46a5f1e` |
| `src/test/AutoAdventureCadence.test.tsx` | `16257211e36769ceb0edcf3f76d7831c6e08768fe443a5ba67b88d6989fddb13` |
| `src/test/AutoAdventureSessionCadence.test.tsx` | `d4fc1c7c2b1f20dbd4476b22583b723ad1d1d9aae9462a5567fc675430797cdc` |
| `src/test/AutoAdventurePayload.test.ts` | `15ae9f0e181fe4f744871bc73ce639364bdae5a5ba023b49aede1e194b6668bf` |
| `src/test/AutoAdventureSyncRace.test.tsx` | `2d3380a63ffb0588fee9385b1f8224cb274b0cc356ad5730b778e14a3d8e9a05` |

## Gates abertos

[Incerto/a] jsdom, timers falsos e RPC/GoTrue simulados não provam autenticação no navegador, execução ou cancelamento de SQL, tráfego real entre abas, custo PostgreSQL nem impacto em CPU, memória, I/O ou no incidente Auth. QA autenticado da reforma, revisão fria final e qualquer decisão sobre PR77 DRAFT pertencem à coordenação. Não houve instalação, sonda ou escrita remota, alteração de servidores/processos, commit, push ou deploy.
