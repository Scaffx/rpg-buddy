# Reparo do preflight de progressão dos portais

Base: `3a3688defdae911f9e2eec8eac072dbb2a6108e3`. Escopo: preflight de `20261020040235_portal_coop_authoritative.sql`, fixture canônica e regressão de drift. Nenhuma função, trigger, mecânica, dado ou grant do projeto Primary foi alterado. Registro do Bug Tracker, gerido pelo coordenador: `3ff812ac-94d8-8156-9f1d-cc3589ca9567`.

## Falha reproduzida

O gate anterior exigia somente os nomes `guard_profiles_economy` e `guard_profiles_progression_insert` com `tgenabled='O'`. Substituir `_guard_profiles_economy()` por `BEGIN RETURN NEW; END` preservava esses metadados e desativava, na prática, a proteção de `profiles.level`. O log do revisor `guard-drift.log` registrou migration **exit 0** nesse estado; a consulta posterior do probe original falhou por concatenação ambígua de `"char"`. Reproduzi o restante com SQL corrigido, em banco local separado: migration antiga **exit 0**, `authenticated` alterou nível **1→50** e `portal_coop_create('fragments','ultra',...)` retornou uma sessão. Evidência preservada em `C:\Users\Murillo\AppData\Local\Temp\portal-coop-guard-baseline-repro.log` e banco `portal_guard_old_repro_20261020` na porta 56248.

## Contrato vivo consultado, somente leitura

| Guarda de `profiles` | Corpo MD5 com CR removido | Trigger vivo | ACL efetiva |
| --- | --- | --- | --- |
| `_guard_profiles_economy()` | `cb1f62ea7e13d6fcdbadb83a62c1c669` | `BEFORE UPDATE FOR EACH ROW`, `tgtype=19`, todas as colunas, `O` | `authenticated`, `anon`, `service_role`, `PUBLIC`: EXECUTE |
| `_guard_progression_initial_values()` | `c04283b05e56ac30f0699ee13bb24b8c` | `BEFORE INSERT FOR EACH ROW`, `tgtype=7`, todas as colunas, `O` | só `service_role` entre esses papéis: EXECUTE |

Ambas são `plpgsql`, `SECURITY INVOKER`, retornam `trigger`, têm owner `postgres`, sem filtro `WHEN`; a tabela `profiles` também tem owner `postgres`. A guarda de UPDATE não fixa `search_path`; a de INSERT usa `search_path=public`. `authenticated` e `anon` têm uso do schema `public`, mas não podem `SET ROLE` para outros papéis nem alterar `session_replication_role` no Primary. A execução de trigger ocorre para seus updates/inserts mesmo quando a função de trigger não é executável diretamente pelo papel.

## Correção

Antes do primeiro DDL, o preflight agora fixa corpo canônico normalizado para LF, função vinculada, owner, retorno, linguagem, modo de segurança, configuração de busca, ACL efetiva e `tgtype`/`tgattr`/`tgqual`/`tgconstraint` de ambos os triggers, além do owner da tabela protegida. Aceita `tgenabled='O'` ou `'A'`; recusa `'R'` e `'D'`. Também recusa caminhos `SET ROLE` que mudariam `current_user` e permissão para alterar `session_replication_role`, pois ambos poderiam contornar guardas ativos no modo padrão. O SQL só verifica os guardas existentes: não os recria, substitui ou revoga. A fixture replica os corpos e ACLs observados no Primary; os no-ops existem apenas nos casos negativos do teste.

## Evidência local

- Comando: `pwsh -NoProfile -File src/test/sql/portal_coop_guard_drift.ps1 -Port 56248` em PostgreSQL 17.9 local, **exit 0, 17/17**. Os três casos positivos (LF, CRLF e `ENABLE ALWAYS`) aplicaram a migration e passaram `portal_coop_assert.sql`.
- Quatorze casos negativos — no-op em cada guarda, owner de função/tabela, binding, trigger desabilitado/replica, evento, filtro de coluna, ACL das duas guardas, `search_path`, `SET ROLE` e permissão para `session_replication_role` — retornaram migration **exit 3** e `to_regclass('public.portal_coop_config') IS NOT NULL = false`, comprovando recusa antes do primeiro DDL. Logs preservados em `C:\Users\Murillo\AppData\Local\Temp\portal-coop-guard-5ad372e2`; bancos separados permanecem no cluster da porta 56248.
- Após os casos de autoridade, `pg_has_role('authenticated','service_role','SET')` e `has_parameter_privilege('authenticated','session_replication_role','SET')` voltaram ambos a `false` no cluster local.
- SHA-256 da migration validada: `EACA556C4F31DBCF1967E8F9D96BB186A0299BB875A34E202F8F952F97998A20`. O parser PowerShell do runner registrou zero erros, e os thresholds do portal seguem 1/20/30/40/50.
- As verificações leram apenas o Primary; não aplicaram migration nem modificaram produção. O teste usa fixture reduzida, então aplicação contra clone integral do schema e reteste independente do revisor continuam pendentes antes de promover.

O cluster de teste permanece rodando em `C:\Users\Murillo\AppData\Local\Temp\portal-coop-pg-task_8374598ba6d4-v2`, porta 56248, e os logs foram preservados; a junction `node_modules` do workspace também permanece. Nenhuma limpeza recursiva foi executada.
