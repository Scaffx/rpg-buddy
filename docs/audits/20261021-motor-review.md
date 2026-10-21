# Revisão independente do MOTOR — 21/10/2026

## Escopo e autoridade

[Certo] Revisão somente leitura do commit MOTOR `fe0b81c5c2fc7bdc42da20cfa583cd0fb3355fd3` (worktree limpo), comparado à base `9a8033829c3f6dea546b4709e569958c0a046e61`. SHA-256 final da migration `20261021142812_continuous_adventure_skill_stats_engine.sql`: `54068E68C03C9E771E6290B0E7E81A111785C6C497227A3341D6551F36A607F5`. O diff tem somente migration nova, parser/tipo, hook de resumo, testes e entrega do MOTOR. Nenhum arquivo do autor, Primary, Edge ou migration histórica foi modificado pelo revisor.

[Certo] Os probes próprios vivem em `src/test/sql/review_skill_motor_independent.sql`. A rodada final usa PostgreSQL 17, banco exclusivo `skills_review_sha_fe0b81c5`, porta `55621`, e termina com `ROLLBACK`; os bancos auxiliares `skills_review_acl_ctxbbbae3` e `skills_review_audit_ctxbbbae3` preservam o teste negativo e o diagnóstico pré-correção. Os arquivos de fixture reduzida do autor preparam o schema, mas as asserções do revisor são independentes das suítes do autor. Nenhum desses bancos é a API ou o schema vivo do Primary.

## Achados antes do SHA final

[Certo] **Corrigido no SHA final — timeout vivo:** antes do commit, herói nível 10 com armadura válida +20 DEF/+100 HP e chefe da etapa 10 terminavam 16 eventos com HP 266/54; o core registrava derrota e recuo. Repro pré-correção: `INCONCLUSIVE_SETTLED_AS_DEFEAT`, exit 0. No SHA final, a mesma luta continua além de 16 eventos, vence com herói HP 230, etapa 11 e recibo do chefe. Um caso de 320 eventos com ambos vivos vira `draw/turn_limit`, sem ouro, entitlement ou recuo. Bug Tracker [400812ac-94d8-81be-8703-c601b33212b1](https://app.notion.com/p/400812ac94d881be8703c601b33212b1?pvs=204).

[Certo] **Corrigido no SHA final — recuo em cascata:** o WIP recuava 10→9→8 após duas mortes reais sem avanço humano (`HOLDING_CASCADE`, exit 0). O SHA final manteve etapa 9/`holding` na segunda morte (`HOLDING_STABLE`, exit 0).

[Certo] **Corrigido no SHA final — MATK e equipamento inválido:** a versão inicial somava MATK integral ao ataque de mago. Probe final A/B de três magos iguais confirmou +20 MATK válido → +10 `hero_attack` e dano não saturado maior; item equipado acima do nível e item com quantidade zero não alteraram ataque nem defesa.

[Certo] **Descrição dos nós:** `m_bola_fogo`, `m_lanca_gelo` e `g_corte` anunciam queimadura, congelamento ou sangramento. O v3 usa dano/elemento base, sem esses efeitos secundários, conforme o recorte aceito. O texto visível da árvore/aventura precisa informar a limitação para não prometer um efeito inexistente; enviado ao coordenador, fora do ownership desta revisão.

[Certo] **Corrigido no SHA final — golpes com efeito:** `gt_furtivo` e `a_vetor` (`debuff`) e `ferreiro_t1_pancada_atordoante` (`cc`) descrevem dano com marca ou atordoamento. O WIP aplicava só o efeito, com dano zero. O SHA final inclui dano e efeito nesses três IDs canônicos, ignora `strike=false` forjado no loadout e protege `n_escudo` por um golpe. A consulta read-only do Primary feita pelo coordenador às 15:02 UTC confirmou cinco nós não-dano catalogados; isso não prova alcance efetivo de Ferreiro para nova escolha. A conclusão anterior baseada apenas nas migrations históricas foi corrigida após a fonte viva.

## Rodada independente vinculada ao SHA final

[Certo] `createdb skills_review_sha_fe0b81c5` exit 0. Com `psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55621 -U postgres -d skills_review_sha_fe0b81c5 -f <arquivo>`, exit 0 nos nove arquivos, nesta ordem: `auto_adventure_fixture.sql`, `20261019194052_auto_adventure.sql`, `boss_auto_fixture.sql`, `20261019205224_boss_auto_entitlements.sql`, `20261019211310_auto_adventure_reachable_catalog.sql`, `continuous_adventure_fixture.sql`, `20261020040128_continuous_adventure_battle_engine.sql`, `adventure_skill_motor_fixture.sql`, `20261021142812_continuous_adventure_skill_stats_engine.sql`. Os paths completos são `src/test/sql/` ou `supabase/migrations/` conforme o nome.

[Certo] `psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55621 -U postgres -d skills_review_sha_fe0b81c5 -f src/test/sql/review_skill_motor_independent.sql`: exit 0, `ROLLBACK`. NOTICEs: simulador ATK/DEF, prontidão, rotação, MP, `heal/buff/debuff/cc`, resistência; snapshot da luta ativa e XP; ACL do simulador; `BOSS10_RESOLVED_AFTER_16` com HP 230/0 e etapa 11; ouro único no retry; 24 batalhas offline com build congelada/caps/cursor; `HOLDING_STABLE` em duas mortes; `DRAW_320_LIVING` sem prêmio/recuo; golpe canônico resistente a loadout forjado; +20 MATK→+10 ataque, dano maior e gear inválido ignorado; `advance` da luta atual não liquida antes do relógio e ID stale é rejeitado. Este probe não reaproveita as asserções do autor.

[Certo] Corrida independente com bloqueio explícito de `adventure_state FOR UPDATE` por três segundos e dois processos `psql` concorrentes: holder exit 0, chamadas exit 0/0 com créditos de ouro `4` e `0`. Consulta posterior exit 0 retornou `1|4|1|2` para número de recibos de ouro, soma, first clear da etapa 1 e etapa atual. Isso prova serialização desse caso reduzido; não esgota todas as interleavings.

[Certo] Benchmark distinto do autor: 24 chamadas ao simulador com ataque mínimo, defesa alta, HP alto e inimigo com HP alto produziram 320 eventos cada, 2.335.512 bytes JSON somados, `psql` exit 0, 1.719,9 ms de parede incluindo cliente local. A duração simulada máxima é 512 segundos. No SHA final, `limits.interval_minutes` deriva de `ends_at-started_at` da batalha atual, ou da última batalha quando a atual não fornece uma timeline válida; `0.25` minuto é apenas o fallback sem timeline válida. `next_at` usa `ends_at` real para o próximo refetch.

[Certo] Errata verificada no banco `skills_review_sha_fe0b81c5`: reexecução integral de `psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 55621 -U postgres -d skills_review_sha_fe0b81c5 -f src/test/sql/review_skill_motor_independent.sql`, exit 0 e `ROLLBACK`. O novo probe chamou `sync_auto_adventure` como `authenticated` e comparou `limits.interval_minutes * 60` com `EXTRACT(EPOCH FROM (battle.ends_at-battle.started_at))` do mesmo payload, admitindo até 0,003 segundo pelo arredondamento a quatro casas decimais. NOTICE: `independent authenticated limit/timeline PASS: limit_seconds=4.8000, timeline_seconds=4.800000`.

[Certo] Teste negativo no SQL do SHA final: no banco `skills_review_acl_ctxbbbae3`, concedi `EXECUTE` de `adventure_battle_payload` a `anon` antes da migration; ela parou na guarda com `adventure ownership, ACL or shape drift`, exit 3, e a coluna `engine_version` permaneceu ausente (contagem 0). RPC pública como `anon` e como `authenticated` sem `auth.uid` foram rejeitadas, exit 1 em cada comando. O wrapper invoker conserva `EXECUTE` de `authenticated` no core own-user em `app_private`, como no baseline; a segurança econômica depende dos checks internos de identidade/locks. Os helpers genéricos novos negam `EXECUTE` a clientes.

[Certo] Reexecutei os três testes TS do autor (`AutoAdventurePayload`, `AutoAdventureSync`, `AutoAdventureAdvanceCache`): Vitest exit 0, 3 arquivos/10 testes. `tsc -p tsconfig.app.json --noEmit` exit 2 com 44 diagnósticos globais e zero nos três arquivos TS alterados; mesma quantidade da base relatada pelo coordenador. `git show --check --oneline HEAD` exit 0. Esses testes TS são suíte de autoria reexecutada, não prova independente de interface em navegador.

## Veredito final

[Certo] **PASS LOCAL do MOTOR em `fe0b81c5`**: nenhum achado crítico remanescente nos cenários independentes acima. O Bug Tracker conserva o registro histórico do timeout; a atualização opcional com a correção ficou centralizada no coordenador.

[Certo] Limites de produto aceitos nesta rodada: passivos/variantes da árvore e efeitos secundários de queimadura, congelamento, sangramento, área e sinergia não entram no motor automático; a UI integrada deve dizer isso sem remover os nós. `utility` permanece não executável. O catálogo vivo, a migration de classe posterior e a elegibilidade efetiva da classe Ferreiro foram verificados por outros responsáveis; esta revisão reproduziu apenas a fixture reduzida e a ponte de classe no código, não um deploy integrado.

[Certo] Não houve browser, leitor de tela, escrita no Primary, deploy, merge nem prova de PostgREST remoto nesta revisão. Os bancos de revisão no cluster compartilhado 55621 ficaram preservados; o cluster do coordenador não foi parado nem alterado fora dos bancos exclusivos criados aqui.
