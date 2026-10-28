# Correção do core frontend de hordas — 2026-10-28

[Certo] Trabalho local na branch `Scaffx/rpg-hordas-continuas-20261028`, a partir de `d787af6`, sobre os arquivos do core já alterados por esta frente. Nenhum commit, push, deploy, browser, RPC remota ou edição de cena, CSS, migração, engine e AuthProvider foi feito.

## Resultado por achado da revisão fria

| Achado | Resultado |
| --- | --- |
| P1 `event_limit` v4 | `battle`, `last_battle`, `last_result` e `encounters` aceitam `event_limit`; `turn_limit` v3 permanece aceito. A listagem trata ambos como empate. Teste cobre os quatro locais e o legado. |
| P1 relógio local no remount | Cada snapshot retornado por sync ou advance ganha âncora `performance.now()`; o mesmo objeto conserva a âncora entre desmontagens. Cache sem âncora fica parado em `server_now` e a query de fundo revalida uma vez no mount, mesmo dentro de `staleTime`. O cálculo do próximo refetch usa o mesmo relógio. `structuralSharing: false` preserva a identidade do snapshot ancorado no React Query. Testes cobrem salto de `Date.now`, remount, avanço monotônico e cache reidratado sem loop de RPC. |
| P2 derrota repetida | Exibição recente é marcada por conta e ID de batalha durante a sessão, com retenção dos últimos 32 IDs por conta; a mesma derrota não reaparece ao remontar. A janela de recência v4 usa o tempo visual atual. Teste remonta a arena. |
| P2 topologia e chefe | v4 normal exige três inimigos; v4 boss exige um. Slots/IDs seguem válidos e a identidade do chefe singular deve coincidir com `battle.boss_id`; normal não pode trazer `boss_id`. v3 segue sem topologia de horda. Testes usam fixtures PG17 e casos inválidos. |
| P2 datas | Timestamps de combate exigem offset explícito, data civil e hora válidas; `reward_day` valida apenas a data civil. O texto original de timestamp PostgreSQL com seis dígitos de fração e offset é preservado. Testes cobrem data inexistente, ausência de offset, dia bissexto e fixture real. |
| P2 resposta A→B→A | O avanço captura geração de identidade por `QueryClient` e versão/objeto do cache no início. Resposta antiga não atualiza cache nem resumo após troca de conta, remount ou sync mais novo da mesma conta. Testes cobrem A→B e A→B→A com e sem remount. |
| P2 gate de holding | A ação é oferecida apenas quando `started_at <= serverTime < ends_at`, além dos guards já existentes. Teste cobre início futuro e início alcançado. |

## Verificação e limites

[Certo] A suíte focada de parser, relógio, componente, cache, identidade, sync e legado terminou com **9 arquivos e 48 testes aprovados**. `npm run build`, ESLint dos arquivos tocados e `git diff --check` passaram. `tsc -p tsconfig.app.json --noEmit --pretty false` mantém **44 diagnósticos globais** já identificados pela coordenação e **zero nos arquivos tocados**.

[Certo] A âncora monotônica representa tempo transcorrido local desde uma resposta da RPC, não uma medição nova do relógio do servidor. Um snapshot restaurado de armazenamento não avança visualmente até novo sync. Os testes são locais com fixtures e mocks; não demonstram Auth em navegador, PostgREST de produção, motor, cena final ou deploy.
