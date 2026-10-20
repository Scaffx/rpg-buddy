# Contrato do motor de aventura contínua — 20/10/2026

## Autoridade e política

[Certo] A migration aditiva `20261020040128_continuous_adventure_battle_engine.sql` parte de `c60476a45302b12df44b972536726471ae3ce6f3` e substitui somente `app_private.sync_auto_adventure()`, preservando o wrapper público sem argumentos. O novo `public.advance_auto_adventure(p_battle_id uuid)` aceita apenas o ID da batalha corrente do usuário autenticado. Usuário, relógio, dano, vitória, etapa e recompensas são sempre calculados no servidor. Nenhum endpoint aceita um estágio, resultado ou prêmio enviado pela cena.

[Certo] Derrota recua automaticamente para `max(1, etapa-1)` e coloca o estado em `holding`. O motor continua lutando nessa etapa inclusive no catch-up offline. Vitórias em `holding` permanecem na mesma etapa; outra derrota recua mais uma etapa, sem ultrapassar o mínimo 1. `advance_auto_adventure` sinaliza intenção de avançar durante a batalha atual em `holding`. Se essa batalha vencer, o servidor move para a próxima etapa e volta a `progressing`; se perder, recua e continua em `holding`. IDs antigos, de outro usuário, pedidos duplicados e pedidos fora de `holding` são rejeitados. A ação não refaz recompensas passadas.

[Certo] `sync_auto_adventure()` e `advance_auto_adventure(...)` retornam o mesmo snapshot. O contrato relevante à UI é:

```ts
type AdventureSnapshot = {
  stage: number;
  mode: 'progressing' | 'holding';
  advance_pending: boolean;
  battle: AdventureBattle | null;
  last_battle: AdventureBattle | null;
  server_now: string;
  next_at: string;
  catchup: {
    battles: number; from_stage: number | null; to_stage: number | null;
    wins: number; defeats: number; retreats: number;
    gold: number; items: string[]; defeated: boolean; pending: boolean;
  };
  encounters: AdventureEncounter[];
  last_result: AdventureEncounter | null;
  boss: { stage: number; id: string; name: string; icon: string | null };
  boss_wins_credited: number;
  gold_today: number; loot_today: number; reward_day: string;
  limits: {
    interval_minutes: 0.25; reward_interval_minutes: 30;
    offline_hours: 24; gold_per_day: 120; items_per_day: 2;
  };
};
type AdventureBattle = {
  id: string; stage: number; attempt: number;
  kind: 'normal' | 'boss'; status: 'fighting' | 'won' | 'defeated';
  biome: 'forest' | 'aquatic' | 'ruins' | 'volcanic';
  hero_class: string; replay: boolean;
  started_at: string; ends_at: string;
  hero_power: number; enemy_power: number;
  hero_max_hp: number; enemy_max_hp: number;
  hero_hp: number; enemy_hp: number;
  enemy_name: string; enemy_icon: string | null; boss_id: string | null;
  events: AdventureAttack[];
};
type AdventureAttack = {
  at: string; actor: 'hero' | 'enemy'; kind: 'attack' | 'skill';
  damage: number; hero_hp: number; enemy_hp: number;
  skill_id: string | null; skill_name: string | null;
  effect: 'physical' | 'arcane' | 'fire' | 'ice' | 'lightning' | 'nature' | 'light';
};
```

[Certo] `battle.hero_hp` e `enemy_hp` são os pontos após o último evento ocorrido até `server_now`, nunca o fim futuro da luta. A cena revela `events` quando seu `at` cruza o relógio servidor mais o tempo decorrido localmente. `battle.status='fighting'` normalmente é a batalha atual; `last_battle` guarda a última luta encerrada com `status='won'|'defeated'` e sua timeline real, mesmo após começar a batalha seguinte. A derrota também aparece em `encounters` e no resumo. `next_at` aponta para o fim da luta atual. `limits.interval_minutes=0.25` permanece positivo para consumidores antigos que o dividem; o motor não usa esse campo para cadenciar recompensas.

[Certo] `useAutoAdventure()` compartilha a query `['auto-adventure', user.id]` entre o shell e a cena. `data.catchup` é o delta de cada RPC. O hook também fornece `summary`, a soma em cache por usuário dos deltas já recebidos, inclusive após `pending=false`, e `acknowledgeSummary()` para limpar depois de exibir. `useAdvanceAutoAdventure().mutate({battleId: data.battle.id})` atualiza o snapshot. `data.advance_pending=true` desabilita novo pedido de avanço.

## Combate, biomas e economia

[Certo] Cada batalha contém até dez golpes alternados a 1,6 s, com duração aproximada de 14,4 s em vitória ou 16 s em derrota. O resultado determinístico usa nível, atributos treinados, classe e equipamentos válidos do servidor; nenhum desses valores é alterado pelo combate. `hero_class` fica congelada na batalha. Os ataques básicos de mago/clérigo usam `arcane`; outros básicos usam `physical`. Uma skill de dano só aparece se seu ID do loadout corresponder a nó alocado da árvore Aprendiz/Novato/classe atual ou a habilidade da arma realmente equipada e sintonizada quando necessário. Nome, elemento e poder vêm do catálogo. Skills válidas rotacionam na ordem do loadout entre lutas e seu dano extra é aplicado no evento. Skills de cura, buff ou controle não aparecem como mecânica aplicada. Pets não entram no cálculo nem multiplicam XP, ouro ou itens.

[Certo] Boss surge a cada dez etapas, usando o catálogo não mundial de `public.bosses`; a primeira vitória mantém o recibo em `adventure_encounters` e o desbloqueio de `boss_battles`. Há três inimigos normais por bioma: floresta, aquático, ruínas e vulcânico. O bioma usa blocos de dez etapas, e o nome/ícone do inimigo vêm do catálogo privado. `encounters` mostra as últimas lutas encerradas, inclusive farm e derrota; a tabela pública guarda as primeiras vitórias, enquanto recibos individuais de batalha permanecem privados.

[Certo] Uma vitória, inclusive em `holding`, pode receber até 4 ouro normal ou 12 ouro de boss em um slot de 30 minutos. O slot é ancorado no horário do servidor e conserva 120 ouro/2 itens por dia de São Paulo. O item comum aparece em boss ou no sétimo slot elegível, inclusive durante farm em uma etapa sem múltiplo de sete. Lutas sem slot continuam visíveis e pagam zero. Uma derrota paga zero. O ID de batalha e o lock do estado impedem liquidação dupla; o crédito de boss e a primeira vitória da etapa não são repetidos no farm. XP, nível e atributos permanentes continuam exclusivos das rotinas.

[Certo] O catch-up processa no máximo 24 batalhas por chamada, até 24 horas de atraso, sem parar na primeira derrota. Uma batalha já iniciada pode terminar ao voltar; novas lutas usam o último snapshot validado de poder, classe e skills anterior à ausência, sem dar retroativamente uma build alterada depois. `catchup.pending=true` indica que outra chamada é necessária. Apenas as 128 timelines de batalha mais recentes por usuário ficam na tabela privada; recibos públicos de primeira vitória, `gold_history`, inventário e `boss_battles` não são podados. Um ID podado jamais se torna válido para `advance`.

## Segurança e verificação

[Certo] O preflight compara as definições revisadas de 20261019 e confere owner, assinatura, retorno, `search_path`, modo `SECURITY DEFINER`/invoker e ACL efetiva dos RPCs, além de owner/CREATE do schema privado e EXECUTE dos helpers de boss. A ordem de lock permanece estado, encontro, boss, saldo/histórico e inventário. `app_private.adventure_battles` e catálogo não oferecem escrita a `anon` ou `authenticated`.

[Certo] Fixture local PostgreSQL 17, migrations anteriores e nova migration foram aplicadas com `ON_ERROR_STOP=1`; `continuous_adventure_assert.sql` cobre auth/anon, perfil ausente, idempotência, skill validada e VFX, rotação, sem XP/nível/atributo, boss 10/20, caps, virada do dia, recuo mínimo 1, timeline da derrota, continuidade offline, farm, loot alcançável, retenção, ID stale/outro usuário/duplicado e `advance`. A sequência reproduzível usa `src/test/sql/auto_adventure_fixture.sql`, `20261019194052_auto_adventure.sql`, `src/test/sql/boss_auto_fixture.sql`, `20261019205224_boss_auto_entitlements.sql`, `20261019211310_auto_adventure_reachable_catalog.sql`, `src/test/sql/continuous_adventure_fixture.sql`, a migration nova e `src/test/sql/continuous_adventure_assert.sql`, nessa ordem, com `psql -X -v ON_ERROR_STOP=1 -q -f <arquivo>`. A rodada final passou com exit 0 em todos os oito arquivos no banco isolado `continuo_motor_final_ctx7e_5`.

[Certo] `vitest run src/test/AutoAdventurePayload.test.ts src/test/AutoAdventureSync.test.tsx` passou (7/7, exit 0), inclusive recompensa retornada por `advance`, próxima sync delta zero, resumo persistente e invalidação de saldo/inventário sem shell; `npm run build` passou (exit 0). `tsc --noEmit -p tsconfig.app.json --pretty false` terminou exit 2 com 53 diagnósticos preexistentes, nenhum nos arquivos deste motor. `git diff --check` passou (exit 0). Dois `psql` simultâneos executando `continuous_adventure_concurrent_call.sql` após `continuous_adventure_concurrent_setup.sql` terminaram exit 0/0, com um recibo da etapa, 104 ouro no saldo inicial de 100 e uma batalha ativa. Em banco separado, grant indevido de EXECUTE a `anon` antes da migration provocou a rejeição esperada de preflight (`psql` exit 3). O `npm ci` da baseline é conhecido por falhar e não foi repetido. Os testes usam schema reduzido local; não houve deploy nem escrita no Supabase remoto.

[Certo] O Primary `jfnospjxdkelxlhcwuia` foi consultado somente em leitura para colunas, PK, owner, ACL e hashes antes da migration. O projeto remoto não recebeu esta migration. O cluster PostgreSQL local e logs estão preservados em `%TEMP%\rpg_continuo_motor_ctx7e248`, porta 55439; `pg_ctl stop -m fast -w` terminou exit 0, sem apagar dados. O `node_modules` deste worktree permanece um junction para o `node_modules` do checkout original; não houve `npm install`/`npm ci` sobre ele nem remoção do junction, e o checkout original e seu WIP foram preservados.
