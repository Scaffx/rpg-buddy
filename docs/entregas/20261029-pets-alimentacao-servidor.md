# Pets: alimentação e cuidado no servidor — entrega local PG17

**[Certo]** O clone local passou; isso ainda não autoriza DDL em Primary. A cadeia de horda e poções e o esquema publicado precisam de preflight próprio antes de qualquer rollout.

## Fonte e propriedade

- Checkout: `rpg-auth-foco-20261026`; branch `Scaffx/rpg-hordas-continuas-20261028`; HEAD observado `c13d5ab3da2af18987ca2f08cd5793d4f8a10c00`.
- Migração nova: `supabase/migrations/20261029120000_pet_food_and_care.sql`, criada pela CLI e renomeada ao horário de dispatch. LF SHA256 congelado: `BEBAB5937A459EB1D24589C8E14D5AF5AAD207ED52FE82619D62C91B52876927`.
- Testes novos: `supabase/tests/pet_care_20261029/`. Nenhuma migração anterior, TS de produto, remoto, commit, push ou deploy foi alterado por este front.
- Reproduzir: `& supabase/tests/pet_care_20261029/verify-local.ps1 -Port <porta_livre> -RunDirectory <diretorio_novo>`. O script exige fonte LF exata, executa PG17 em cluster isolado e para a instância em `finally`.

## Contrato entregue

- Treze SKUs explícitos, incluindo `skeleton_pup`; 25 ouro por unidade, lote 1 a 30, estoque empilhável. Preço, item e posse são resolvidos pelo servidor. `skeleton_pup` recebe cuidado e alimento, mas não ganha bônus de aventura inexistente no catálogo atual.
- `get_pet_food_catalog()` retorna somente espécies próprias como array `{pet_type,item_id,name,unit_price,owned,quantity}`. `buy_pet_food(text,integer,uuid)` retorna `{ok,replayed,request_id,pet_type,quantity,unit_price,total,gold,stock,created_at}`. `get_pet_food_purchase_receipt(uuid)` devolve o recibo pelo mesmo UUID ou `{found:false,request_id}`. Ausência do recibo após falha de transporte não prova que a transação em voo terminou; a UI deve manter a incerteza e o UUID.
- Compra usa `profiles` como primeiro lock por conta, assenta vencimentos antes de adicionar o lote, revalida posse, bloqueia saldo, debita ouro, registra `gold_history`, incrementa pilha e grava recibo na mesma transação. Repetição idêntica devolve recibo; reutilização de UUID com espécie/quantidade diferente falha. Sem compra automática.
- Um pet próprio com estoque correspondente consome uma unidade em cada vencimento de 24 horas. A liquidação calcula o número de dias aritmeticamente e gera recibos apenas para unidades consumidas; vencimentos sem estoque avançam o cursor. Compra tardia pode registrar no máximo uma refeição imediata por pet faminto e nunca cria refeições em datas passadas. Todos os pets próprios entram na liquidação, mesmo desmarcados para batalha.
- `interact_pet_care(uuid,text,uuid)` aceita `care` e `play`, compartilhando intervalo de 12 horas e máximo de duas ações efetivas na janela móvel de 24 horas. `get_pet_care_state()` assenta vencimentos e retorna `{server_now,pets:[{companion_id,pet_type,name,stock,last_feed_at,next_feed_at,last_care_at,next_care_at,participation}]}`. Não há XP, nível, ouro ou afinidade por alimentar/cuidar.
- Potência em cada eixo: `max(0.50,1-0.50*max(0,h-24)/48)`, com `h` em horas desde a última refeição/cuidado confirmado; participação é o mínimo dos eixos. Baseline de pets existentes é o instante de instalação, e a aquisição futura usa relógio do servidor. Isso evita punição retroativa. O pet permanece presente na luta.
- `sync_auto_adventure` efetivo foi recomposto a partir da definição local **após horda, área do mago e poções**; a simulação v4 com poções permanece. O servidor assenta até cada `v_start`, consulta recibos históricos com `event_at <= v_start`, grava `participation`, `care_as_of`, `effective_bonus` e `effective_sustain` em `rules_snapshot.pet`, aplica o percentual efetivo ao atributo e envia sustain efetivo ao simulador. Replays usam o snapshot imutável. O helper de liquidação é chamado por início de batalha, não por inimigo ou evento; índice `(user_id,next_feed_at)` evita atualizar pet sem refeição vencida.
- Em combate, os campos canônicos são `battle.pet.effective_bonus.pct`, `battle.pet.effective_sustain.pct`, `battle.pet.participation` e `battle.pet.effective_stats`; `battle.pet.bonus` e `battle.pet.sustain` continuam nominais para catálogo/compatibilidade. O payload público `battle.pet` vem de `rules_snapshot.pet`. A UI deve anunciar o efeito efetivo do snapshot e não recalcular a partir do catálogo ou do pet atualmente selecionado.
- O consumo genérico de inventário rejeita SKUs de comida antes do lock do item. Funções públicas novas têm `EXECUTE` somente para `authenticated`; tabelas privadas têm RLS e revogação. O preflight confere fonte LF, owner, volatilidade, definer, `search_path`, ACL efetiva, overloads, privilégios de tabelas/colunas, trigger de proteção e `pg_default_acl`.

## Evidência executada

**[Certo]** O run íntegro foi em PostgreSQL 17.9, porta `55944`, banco positivo `pet_positive`. Logs brutos e manifesto: `C:/Users/Murillo/AppData/Local/Temp/rpg-pet-care-final3-20261029/logs/`; dados preservados em `../data/`. O manifesto contém hashes LF dos quatro predecessores e da captura local `consume_inventory_item` (`5C9F1DB8D14194FACB636582A692BD1DB4635AE3571D8E32B3739AC4E17CB705`). O script-base de economia confirmou 28 fontes e o clone de outubro até `20261022032246` antes dos quatro predecessores.

| Prova | Resultado bruto |
|---|---|
| Migração positiva, baseline de pet anterior ao rollout, compra/recibo, 24/48/72 h, falta de estoque, compra tardia, limite 30, saldo insuficiente | `pet_positive-migration.log`, `pet_positive-baseline.sql.log`, `pet_positive-functional.sql.log`: exit 0 e notices `PET_CARE_EXISTING_BASELINE_PASS`, `PET_CARE_FUNCTIONAL_PASS` |
| Snapshot v4, porcentagem de atributo e sustain, troca/cuidado/compra tardia, XP | `pet_positive-battle.sql.log`: exit 0, `PET_CARE_BATTLE_PASS` |
| Identidade, posse alheia, ACL/RLS, overloads | `pet_positive-acl.sql.log`: exit 0, `PET_CARE_AUTH_OWNERSHIP_PASS` |
| Duas sessões para mesmo UUID de compra, mesmo UUID de cuidado e liquidação concorrente | `concurrent_{buy,care,feed}.sql-{a,b}.stdout.log` e `pet_positive-concurrency_assert.sql.log`: seis exits 0, um débito de 175, um cuidado efetivo e dois recibos de refeição |
| Regressão da cadeia existente de poções HP/MP/offline e pet v4 | `pet_positive-retained-wrapper.sql.log`, `pet_positive-retained-wrapper_mp_offline.sql.log`, `pet_positive-retained-pet_wrapper.sql.log`: exits 0, notices `AUTO_POTIONS_*_PASS`, `PET_WRAPPER_PASS`, `PET_SNAPSHOT_IMMUTABLE_PASS` |
| Amostra de custo de catch-up da cadeia v4, 30 contas sem pets, 45 s de backlog | `pet_positive-catchup-benchmark.log`: exit 0, p95 `6.939 ms`, máximo `22.799 ms`, limite do teste `<250 ms` |
| Drift de corpo, ACL, overload, default ACL e membership herdado | Cinco `pet_drift_*-reject-*.log`: exit 3 por guard esperado; cinco `atomic-*.log`: `t` para ausência de tabela nova; membership restaurado com exit 0 |
| Teardown | `pg_ctl stop -m fast -w`: exit 0; `pg_isready`: exit 2, sem listener na porta 55944 |

## Limites e saída segura

- **[Certo]** O fixture reduzido não tem `public.complete_mission(uuid,date)` exigida pela migração lexical `20261029054922_mission_d1_server_start_and_weekly_close.sql`; a aplicação dela falhou antes de DDL no ensaio exploratório. Ela não foi forçada, modificada ou simulada no run íntegro. A função de aventura/poções efetiva usada aqui é a de `20261029043726`; a migração de missões é independente dessas definições neste checkout, mas a cadeia lexical completa ainda precisa de prova em fixture adequada.
- **[Certo]** O replay econômico reduzido não habilitava RLS em `gold_history`, embora o esquema fonte da tabela o faça; o harness habilitou apenas essa propriedade antes do preflight. O consumidor genérico veio de captura local somente leitura, hash de definição LF `758fca4a260de7aea24758c03b9ffafd`. Essas diferenças estão registradas em logs, não escondidas como evidência de Primary.
- **[Certo]** O limite de 4096 recibos de refeições em uma liquidação aborta atomicamente um caso extremo de estoque e ausência, sem custo não limitado. A amostra de custo cobre apenas 45 s de backlog e contas sem pets; ainda faltam p95 com múltiplos pets vencidos, lote de 256 lutas, casos de 1200 eventos e navegador autenticado/PostgREST. Os preços, lote e curva de potência são defaults de balanceamento do contrato, ainda sujeitos a validação de produto.
- **[Certo]** Não houve consulta nem escrita no banco remoto/Primary durante o incidente/restart. Antes de produção, verificar fonte atual, ACL efetiva e `pg_default_acl` em Primary por leitura autorizada, executar a cadeia completa em clone compatível, medir custo de catch-up, depois decidir rollout. Qualquer drift deve parar a migração sem adaptação textual oportunista.

Para revisão independente, o cluster preservado está parado. Reabrir explicitamente com `C:/Program Files/PostgreSQL/17/bin/pg_ctl.exe -D C:/Users/Murillo/AppData/Local/Temp/rpg-pet-care-final3-20261029/data -l C:/Users/Murillo/AppData/Local/Temp/rpg-pet-care-final3-20261029/logs/server-review.log -o "-h 127.0.0.1 -p 55944" start -w`; consultar `pet_positive` ou `pet_source` pré-target; ao sair, `stop -m fast -w` e confirmar `pg_isready=2`.
