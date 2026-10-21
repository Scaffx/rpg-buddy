# Motor de habilidades da aventura contínua — 21/10/2026

## Escopo e fronteira

[Certo] Base: `9a8033829c3f6dea546b4709e569958c0a046e61`, worktree `rpg-continuo-motor-20261020`. Migration nova gerada por `npx --no-install supabase migration new continuous_adventure_skill_stats_engine` (CLI 2.121.0): `20261021142812_continuous_adventure_skill_stats_engine.sql`, SHA-256 `54068E68C03C9E771E6290B0E7E81A111785C6C497227A3341D6551F36A607F5`. Nenhuma migration histórica foi editada. Primary `jfnospjxdkelxlhcwuia` via `link_6abe70536ca4819193b60c2d9ba7d54a` foi consultado somente para leitura; não houve aplicação remota, deploy, push ou merge.

[Certo] O motor anterior somava equipamento em `hero_power`, mas o dano da timeline era binário por limiar de poder, a habilidade só aparecia no terceiro evento e não havia MP, resistência ou efeitos reais de suporte. A função v3 usa ataque, defesa, HP, MP, habilidade e resistência em cada evento. Ela mantém a autoridade do servidor sobre usuário, relógio, resultado e economia. Nenhum parâmetro de economia, XP, vitória, estágio ou tempo vem do cliente.

## Contrato confirmado para CENA e HUB

[Certo] Campos novos opcionais para batalhas antigas: `battle.hero_attack`, `hero_defense`, `hero_max_mp`, `hero_mp`, `engine_version`, `enemy_resistances`, `end_reason`; `events[].hero_mp`, `mp_cost`, `skill_type`, `healing`, `raw_damage`, `damage_multiplier`, `effect_note`. `battle.status` passa a aceitar `draw`; `last_result` e `encounters` recebem `status` e `end_reason` opcionais; `catchup.draws` é opcional e o hook soma esse delta. `event.effect` continua exclusivamente `physical|arcane|fire|ice|lightning|nature|light` para VFX. `kind` continua `attack|skill`. Um `draw` tem `end_reason=turn_limit`, ambos vivos, etapa preservada, zero prêmio e zero recuo.

[Certo] `limits.interval_minutes` agora reflete `(ends_at-started_at)/60` da batalha atual, ou da última se não houver batalha atual; `0.25` só é fallback sem timeline. O relógio/refetch deve continuar usando `next_at`, que já representa o fim real da batalha, e a UI não deve prometer cadência fixa de 15 segundos. O teste público compara `limits.interval_minutes` ao intervalo da batalha retornada no mesmo RPC.

[Certo] O snapshot da luta guarda `engine_version=v3`, ataque/defesa/MP máximos, habilidades canônicas ordenadas, resistências da criatura e `rules_snapshot` com versão/fórmula/elemento padrão. Cada luta começa com MP cheio; gasto e cooldown são aplicados dentro da timeline, em ordem de prioridade/rotação, e sem habilidade pronta e pagável sai ataque básico de custo zero. MP nunca fica negativo. Lutas já iniciadas e catch-up antigo reutilizam o snapshot anterior, inclusive timelines v2 sem mana; nenhuma luta encerrada é recalculada com build atual.

[Certo] ATK usa classe, atributos e bônus válidos de equipamento, inclusive `ATKgear + floor(MATKgear/2)` conforme `computeSoloCombatStats`. DEF reduz cada ataque inimigo; HPbonus aumenta HP máximo e MPbonus aumenta MP máximo. Nível e atributos vêm do servidor. Equipamento exige propriedade, quantidade positiva, nível suficiente e sintonização quando aplicável. O ataque básico usa o elemento de arma equipada válida; o elemento não é inferido do bioma. A Asa de brasa, entrada exata do catálogo em bioma 3/slot 1, tem `resistances={"fire":0.5}`. As demais entradas começam com `{}`; afinidades futuras exigem metadados por criatura e prova própria.

[Certo] O JSON editável `profiles.combat_skill_loadout` seleciona apenas IDs e ordem. Nome, poder por rank, custo, cooldown, tipo e elemento vêm de nó alocado da árvore permitida ou de habilidade de arma equipada válida. Requisitos de elemento e tipo devem estar na **mesma** arma válida. `strike=true` é criado apenas para os IDs publicados `gt_furtivo`, `a_vetor` e `ferreiro_t1_pancada_atordoante`; esses golpes causam dano além de vulnerabilidade/atordoamento, mesmo se o perfil falsificar `strike=false`. `n_cura` restaura HP faltante; `n_escudo` reduz o próximo **um** golpe inimigo, sem causar dano, mesmo se o perfil falsificar `strike=true`. O catálogo Primary consultado em 21/10 tinha estes cinco nós não-dano e nenhuma `weapon_skill` não-dano. Novos nós não-dano exigem revisão explícita da semântica canônica antes de prometer suporte.

[Certo] Há efeitos mecânicos reais para `dano`, `heal`, `buff` (proteção), `debuff` (vulnerabilidade) e `cc` (perda de uma ação). O tipo `utility` não existe nesses cinco nós equipáveis publicados e não é executado pelo motor. Efeitos secundários descritos em outros nós de dano, como burn, freeze, área, múltiplos alvos ou sinergias, **não** são executados por esta migration; a UI deve mostrar a regra automática efetiva e não anunciar essas extensões como aplicadas.

[Certo] A etapa fica em `holding` após a primeira derrota real e não recua repetidamente por derrotas subsequentes sem avanço humano. Vitória normal em `holding` continua na etapa; `advance_auto_adventure` só atua sobre a batalha atual e segue o gate de relógio existente. Boss em cada décima etapa, janela de 30 minutos, teto de 120 ouro/2 itens, recibos e locks permanecem no core. Combate não acrescenta XP, nível ou atributos permanentes.

## Preflight e ordem

[Certo] O bloco inicial recusa drift antes de DDL: `md5(pg_get_functiondef(...))` dos cinco RPCs vivos (sync privado/público, payload e advance privado/público), assinaturas, owner `postgres`, `search_path`, `SECURITY DEFINER` do core privado versus wrappers públicos invoker, EXECUTE de `anon`/`authenticated`, ACL/RLS das tabelas privadas, shape prévia, hash do catálogo inimigo e constraint de status. A função de simulação e o helper de árvore são privados e sem EXECUTE para `anon`/`authenticated`; o wrapper público permanece invoker. A migration deve entrar depois de `20261020040128_continuous_adventure_battle_engine.sql` e antes do helper de classe `20261021145143` de outro worker.

[Certo] A migration de classe posterior pode fornecer `app_private.hero_class_key(uuid)` e `app_private.has_hero_class(uuid)` para liberar uma classe validada de onboarding. O runtime só as usa quando ambas existem; até lá conserva o gate estrito de `current_class_id`. O teste de integração local criou stubs privados com os mesmos nomes/assinaturas para provar a ponte, sem alegar validação da migration separada ou do schema remoto pós-integração.

## Evidência local reproduzível

[Certo] Cluster isolado PostgreSQL 17 em `%TEMP%\rpg_motor_skills_task_2cc05f3d82af`, porta `55591`, log `postgres.log`. Preparação: `initdb`, `pg_ctl start` e `createdb motor_final14`, todos exit 0. Em `motor_final14`, executar com `psql -X -v ON_ERROR_STOP=1 -q -h 127.0.0.1 -p 55591 -U postgres -d motor_final14 -f <arquivo>` na ordem abaixo; os 16 comandos deram exit 0 e seus outputs estão em `final14-<basename>.out` no mesmo diretório temporário:

1. `src/test/sql/auto_adventure_fixture.sql`
2. `supabase/migrations/20261019194052_auto_adventure.sql`
3. `src/test/sql/boss_auto_fixture.sql`
4. `supabase/migrations/20261019205224_boss_auto_entitlements.sql`
5. `supabase/migrations/20261019211310_auto_adventure_reachable_catalog.sql`
6. `src/test/sql/continuous_adventure_fixture.sql`
7. `supabase/migrations/20261020040128_continuous_adventure_battle_engine.sql`
8. `src/test/sql/adventure_skill_motor_fixture.sql`
9. `src/test/sql/adventure_skill_motor_legacy_setup.sql`
10. `supabase/migrations/20261021142812_continuous_adventure_skill_stats_engine.sql`
11. `src/test/sql/adventure_skill_motor_legacy_assert.sql`
12. `src/test/sql/adventure_skill_motor_assert.sql`
13. `src/test/sql/adventure_skill_motor_state_assert.sql`
14. `src/test/sql/adventure_skill_motor_clock_assert.sql`
15. `src/test/sql/adventure_skill_motor_draw_assert.sql`
16. `src/test/sql/adventure_skill_motor_canonical_assert.sql`

[Certo] Os asserts cobrem A/B de ATK, MATK, DEF com diferença de dois pontos, HP e MP com mesmo inimigo, mana/custo/cooldown/ordem, ataque sem mana, efeitos, escudo de um golpe, elemental fire 0,5, arma elementar, ownership e metadados forjados, XP zero, 30min/120/2, boss10 vencido após mais de 16 eventos com HP restante e entitlement, draw vivo em 320 eventos sem prêmio/recuo, segunda morte em holding sem cascata, gate de relógio do advance, snapshot v2 e offline v3. Os fixtures reproduzem as colunas/ACLs relevantes e um recorte de catálogo; não são dump integral de Primary.

[Certo] Corrida sobre o SQL final: banco `motor_race6` com os oito arquivos de preparação acima, a migration e `adventure_skill_motor_concurrent_setup.sql`, todos exit 0. Dois processos `psql -f adventure_skill_motor_concurrent_call.sql` em paralelo deram exit 0/0; `adventure_skill_motor_concurrent_assert.sql` exit 0 confirma uma primeira vitória, um único crédito de quatro ouro e uma única batalha ativa. Logs `race6-*.out` preservados. Em `motor_drift2`, mudança local de `search_path` do sync privado seguida da migration deu exit **3 esperado** com `adventure source drift`; a coluna `engine_version` continuou ausente (contagem 0). Logs `drift2-*.out` preservados. O preflight permaneceu idêntico após o ajuste final de `limits.interval_minutes`.

[Certo] `adventure_skill_motor_benchmark.sql` em `motor_final14` executou 24 simulações de empate com 320 eventos: exit 0, 1.729,548 ms no total, 98.312 bytes JSON por timeline e 2.359.488 bytes somados. Uma batalha real de 320 eventos no mesmo fixture produziu payload de 101.450 bytes. Log `final14-benchmark.out`. Contexto: PostgreSQL 17 local na porta loopback do Windows 11 Pro, Intel i5-14600KF (20 processadores lógicos), 31,8 GiB RAM, outros processos do IDE ativos; é medição local, não SLA remoto. A duração de uma timeline máxima no relógio do jogo é 512 s; `draw` é fallback para ciclos sem desfecho, não um limite de oito ataques no primeiro boss.

[Certo] `npx --no-install vitest run src/test/AutoAdventurePayload.test.ts src/test/AutoAdventureAdvanceCache.test.tsx src/test/AutoAdventureSync.test.tsx`: exit 0, 3 arquivos/10 testes. `npm run build`: exit 0. `npx --no-install tsc -p tsconfig.app.json --noEmit`: exit 2, 44 diagnósticos em arquivos não alterados, zero nos três arquivos TS alterados; log `tsc-app-final2.log`. `git diff --check`: exit 0. `node_modules` permaneceu junction para `C:\Users\Murillo\Desktop\RPG-Buddy\rpg-buddy\node_modules`; não houve install/ci nem remoção.

## Limites de aceite

[Certo] A verificação acima é local com fixture reduzido. Não prova aplicação da migration no Primary, comportamento do PostgREST/gateway autenticado no remoto, browser/screen reader, nem a integração com as migrations de classe/reset e com a UI dos outros workers. Antes de publicar, root deve confrontar novamente hashes/ACL/schema vivo, aplicar a ordem lexical correta e disponibilizar o cliente que entende `draw` e os campos v3. Nenhuma publicação foi feita por este worker.

[Certo] O cluster e todos os bancos/logs temporários foram preservados. `pg_ctl -D <diretório> stop -m fast -w` deu exit 0; `pg_isready -h 127.0.0.1 -p 55591` deu exit 2 (`no response`). Não há listener local do teste ativo.
