# Revisão fria final — core e motor de hordas (28/10/2026)

## Escopo e veredito

**Não aceitar o freeze ainda.** Há 1 P1 e 2 P2 reproduzíveis abaixo. Revisei somente o core e o motor; CSS, clerico e labels de loadout ficaram fora do escopo. Não alterei código de produto, migração, teste ou fixture.

Base Git do freeze: `d787af6499dfed0a0ea75f7431d57294d633a634`, branch `Scaffx/rpg-hordas-continuas-20261028`, worktree `C:/Users/Murillo/orca/workspaces/rpg-buddy/rpg-auth-foco-20261026`. O checkout já continha WIP de outras frentes; durante a revisão o HEAD avançou para `59148d56ea42b0ff9890aecdb0b493fde32695ae`, sem alterar os oito arquivos congelados. Os 8 arquivos em `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/hordas-20261028/freeze-final-core-engine/manifest.json` coincidiram com seus SHA-256 **antes e depois** da revisão (8/8); o próprio manifesto tem SHA-256 `523f1b93cd6723f3eb41b69a85b35c4255aaf1f3fb2b1d592126cc431530a285`. A definição anterior das RPCs, owners, ACLs e hashes LF veio apenas da captura sanitizada em `docs/entregas/20261028-hordas-live-sources/`; não houve consulta ou escrita remota nesta revisão.

## Achados acionáveis

### P1 — uma sincronização antiga regride o cache após A→B→A

**Cenário.** Uma chamada `sync_auto_adventure` da conta A permanece pendente. O usuário passa à conta B e volta a A no mesmo `QueryClient`; um snapshot novo de A já mostra etapa 9. Quando a primeira chamada termina com etapa 1, ela sobrescreve o cache de A. Em reprodução local com `QueryObserver` da versão instalada de TanStack Query, a sequência deu `before=9, after=1`.

**Código.** `src/hooks/useAutoAdventure.ts:46-68` usa só `user?.id` na chave, não consome o `AbortSignal`, e `queryFn` devolve a resposta e chama `recordSummary` sem conferir a geração da identidade nem a frescura do snapshot (`:50-56`). A guarda de geração em `:124-131` protege apenas a mutação de avanço. `src/App.tsx:58,201` mantém um único `QueryClient`. Os testes de A→B→A em `src/test/AutoAdventureAccountSwitch.test.tsx` exercitam a mutação, não esta consulta.

**Risco e correção.** A interface pode voltar a mostrar batalha/etapa de uma sessão anterior e incorporar seu resumo; o servidor ainda valida o avanço, então isto não demonstra crédito indevido. Vincular a consulta a uma geração de sessão confirmada, descartar resposta de geração antiga e impedir que uma resposta com relógio servidor mais antigo substitua snapshot mais novo. Cobrir especificamente `sync` pendente em A→B→A e retorno sob novo token da mesma conta.

### P2 — `encounters` rotula empate v4 com motivo v3

**Cenário.** Forcei no clone local um encontro v4 válido a durar 899,8 s e 1.134 eventos, com herói e inimigos vivos; `draw.sql` confirmou `last_result.end_reason='event_limit'`. Na mesma transação, a chamada pública seguinte retornou `encounters[0].end_reason='turn_limit'`.

**Código.** A migração `supabase/migrations/20261028214109_adventure_horde_continuous.sql:284-287,350-354` corrige `last_result` e `adventure_battle_payload`, mas não substitui a projeção de `encounters` em `docs/entregas/20261028-hordas-live-sources/sync.sql:573-582`, cuja linha `:576` fixa `turn_limit` para todo `draw`. `src/components/AutoAdventure.tsx:18-22` reconhece ambos como empate, o que limita o efeito visual atual; o contrato público continua contraditório.

**Risco e correção.** Consumidores do histórico recebem a causa errada. Aplicar a mesma distinção `v4_horde -> event_limit`, `v3 -> turn_limit` na projeção dos encontros, com teste pelo retorno público após a liquidação.

### P2 — MECHANICS promete teto e cadência de ouro que o motor não aplica

**Cenário.** `MECHANICS.md:204-216` afirma até 4/12 ouro por vitória, teto diário de 120 e cadência de 30 minutos para novos créditos. A fonte da RPC em `docs/entregas/20261028-hordas-live-sources/sync.sql:145-160,189-196` calcula 1–48 ouro por vitória completa sem teto diário; os 30 minutos condicionam apenas drop direto de item (`:156-174`). A migração de hordas conserva essa liquidação.

**Risco e correção.** A documentação do freeze informa economia divergente do comportamento entregue e pode induzir testes e decisões de balanceamento errados. Atualizar esses números e explicitar que o intervalo de 30 minutos vale para item direto.

## Evidência de validação

- Vitest instalado, sem instalação: 7 arquivos focados, **27 testes passaram**. Inclui contrato v4, timestamps com offset, relógio monotônico, frame de eventos confirmados, componente, cache de avanço e A→B→A da mutação. A reprodução separada da consulta com `QueryObserver` mostrou `before=9, after=1`.
- PostgreSQL 17 **local e isolado** na porta 55929: clone dos dados sintéticos parados de 55928, em `C:/Users/Murillo/AppData/Local/Temp/rpg-hordas-review-task8aded148eed8/`. Restaurei `sync.sql` e `payload.sql` capturados e o constraint v3; os hashes LF pré-migração foram `1641aa39afd52bcddae1998819c4b330` e `19652de586465e476978672744f83fd5`. A migração exata do freeze passou com `ON_ERROR_STOP=1` e preflight de owner/ACL/hash. Os dados sintéticos já existentes no clone foram ajustados apenas nessa cópia para viabilizar o constraint v3.
- Passaram no clone os SQL `assert`, `draw`, `defensive_victory`, `defensive_settlement`, `pet_wrapper`, `retreat`, `offline` e `advance`; o caso v3 foi criado **antes** da migração em outra base do mesmo clone, liquidado depois e seguido de batalha v4 (`legacy_before`/migração/`legacy_after`). As verificações incluem identidade pública, ACL/RLS/owner, 3 inimigos/1 chefe, relógios, sustento do pet, vitória defensiva, empate, XP inalterado e liquidação uma vez. Duas sessões concorrentes com o ID sintético `a531` passaram `concurrency_assert` após uma sessão reter o lock por 1,5 s.
- `benchmark.sql`: 30 amostras reais para chefe e horda e 30 para relógio de 15 min; p95 local de 0,251 ms, 0,214 ms e 20,261 ms, respectivamente. `catchup_benchmark.sql`: 30 amostras, p95 de 5,974 ms, máximo de 15,498 ms, abaixo de 250 ms no fixture. Os logs dessa revisão estão no diretório `logs/` do clone; testes transacionais fizeram `ROLLBACK` onde previsto.
- `pg_ctl stop -m fast -w` encerrou o clone. `pg_isready` informou **no response** em 55929 e não havia listener nessa porta. Dados e logs foram preservados; 55928 continuou parado.

## Limites

O clone tem fixture reduzida e dados sintéticos; seus tempos não preveem carga de produção. O teste de ACL usa `SET ROLE authenticated` em PostgreSQL local, não o gateway PostgREST nem um navegador autenticado. A captura sanitizada das definições vivas é de 28/10/2026, sem revalidação remota neste turno. Não houve commit, push, deploy, alteração de produto ou escrita remota.
