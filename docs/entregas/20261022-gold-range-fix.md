# Correção do CHECK de ouro do primeiro clear — 2026-10-22

## Escopo e causa

Base de integração: `43000344b125f3a75c4273721db12d92edb1ddf2`, branch
`Scaffx/rpg-ouro-check-20261022`. Economia foi entregue em `0664b2b` e
`c6d57fc` antes da integração. O `app_private.sync_auto_adventure()` final
(`md5(pg_get_functiondef)=59914430e3b78e96f69deaf770f82910`) calcula
`1..48` de ouro por vitória e grava esse prêmio em `public.adventure_encounters`
no primeiro clear. A migração `022614` já havia ampliado
`app_private.adventure_battles.gold_awarded` para `0..48` e liberado o limite
superior de `public.adventure_state.gold_today`, mas o CHECK de
`public.adventure_encounters.gold` permanecia em `0..12`. O INSERT do recibo
falhava com `23514`, abortando toda a liquidação antes do crédito, ledger e item.

## Mudança

`supabase/migrations/20261022032246_adventure_encounters_gold_range.sql` foi
criada por `npx --no-install supabase migration new adventure_encounters_gold_range`
(CLI `2.121.0`), posterior à cadeia `022416 → 022614 → 022726` e também à
correção de classe `030906` em sua ordem lexical. SHA256 canônico LF da nova
migration: `B2935C8697FD0AE4092B0E0A9955FD40E7C9645ACAC5774C73C273E2B6B1053F`.

O preflight exige os corpos e metadados dos RPCs `app_private` e `public` de
`sync_auto_adventure`, owner `postgres`, ACL de execução, tabela de encounters
com owner `postgres`, RLS e política de leitura por `auth.uid()`, ausência de
grants de escrita em tabela e colunas, coluna `gold integer NOT NULL` e o
CHECK original validado, local, ligado à coluna `gold` da tabela correta, com
definição `0..12`. Exige ainda que os CHECKs de batalha e estado sejam os já
entregues por Economia (`0..48` e `>=0`). Só então troca o CHECK nomeado de
encounters por `gold BETWEEN 0 AND 48`, numa única transação. Nenhum RPC,
recompensa, tabela de UI, Receitas, Baús ou correção de classe foi alterado.

## Fixture e evidência PG17

Fixture real: `supabase/tests/economy_composed_20261022`; as 28 entradas de
`sha256.json` bateram (`drift_count=0`). O replay local teve 12 arquivos com
saída `0`; extensão, seed, suplemento, `022416`, `022614` e `022726` também
saíram `0`. Foram usados snapshot e suplemento exatos. O arquivo `022416` no
checkout tinha CRLF, que altera o hash de função armazenado pelo PostgreSQL;
aplicou-se somente uma cópia LF no diretório de logs, com o mesmo SHA256
canônico do manifesto:
`0C56E076B3CEEDC34F9CCBEC4DAC1DA0D19C4CDF0A75D84CDEBF45F83264E79A`.
Sem essa normalização local, o guard de origem de `022614` recusou o corpo
`4ea1a5c1bd0be5e0b762756e2da8309d`; com ela, a cadeia passou e os hashes
finais foram `sync 59914430e3b78e96f69deaf770f82910`,
`register_boss_recipe 859d52e06b6f95a3947a033116d71026` e
`advance_auto_adventure 09c5c400405def35917f1c63e4f58ac8`.

Banco isolado: PostgreSQL 17 em `127.0.0.1:55837`, diretório preservado
`C:/Users/Murillo/AppData/Local/Temp/rpg-gold-range-fix-20261022-0324`.
Nenhuma conexão ou escrita foi feita no projeto Supabase remoto. A migration
aplicada na cadeia real saiu `0` (`logs/gold-range-migration.log`).

Em clone pré-correção com CHECK `0..12`, `economy_gold_range_flow.sql` gerou
um boss10 por `public.sync_auto_adventure()` e alterou apenas
`started_at/ends_at` da batalha no banco local para adiantar o relógio. O
settlement calculou `35` de ouro e saiu `3`: `23514` em
`adventure_encounters_gold_check` (`logs/gold-range-before.log`). A transação
retrocedeu, com zero encounter, ledger de aventura, inventário e estado dessa
identidade.

Depois da correção, o mesmo fluxo saiu `0` e terminou em
`GOLD_RANGE_FLOW_PASS` (`logs/gold-range-flow.log`): normal etapa 9 ganhou `30`,
boss10 ganhou `35`, ambos por battles criadas pelo servidor e liquidadas pelo
RPC público. Encounter, battle, saldo e ledger concordaram; o item do boss
entrou no inventário, a receita e o recibo de baú foram criados, e replay não
duplicou ouro, item nem baú. XP total, nível e atributos ficaram iguais aos
snapshots tirados antes das vitórias. Esse fluxo correu em `BEGIN/ROLLBACK`.

`economy_gold_range_bounds.sql` saiu `0` e terminou em
`GOLD_RANGE_BOUNDS_PASS`: inserts de teste sem prêmio aceitam `0` e `48`,
recusam `49` e `-1` pelo CHECK nomeado e não deixam linhas inválidas
(`logs/gold-range-bounds.log`).

Duas sessões autenticadas invocaram simultaneamente o RPC para o mesmo boss10,
com uma transação mantida por quatro segundos. Ambas saíram `0`; um backend
esperou `transactionid` com `pg_blocking_pids={94708}`
(`logs/gold-range-logged-blockers.log`). O assert saiu `0`,
`GOLD_RANGE_CONCURRENT_PASS`: um encounter de `35`, um ledger, saldo creditado
uma vez, um item e nenhum XP/nível novo
(`logs/gold-range-concurrent-logged-assert.log`).

Quatro clones pré-correção receberam drifts distintos de corpo de `sync`,
CHECK (`<=13`), grant `UPDATE` a `authenticated` e RLS desabilitado. Todos os
preflights saíram `3` com o código de drift correspondente antes do `ALTER`;
cada clone continuou com um único CHECK original ou adulterado, sem aplicação
parcial (`logs/gold-range-drift-*-migration.log`).

Teardown: `pg_ctl stop -m fast -w` saiu `0`; `pg_isready` na porta `55837`
saiu `2` e retornou `no response` (`logs/teardown.log`). Dados e logs locais
foram preservados.

## Limites

Esta é evidência PostgreSQL 17 local, com identidade `authenticated`/JWT
simulada pela fixture. Ela não prova estado atual do banco remoto, execução
via PostgREST autenticado nem promoção/deploy. Não houve push, merge ou deploy.
