# Motor servidor de hordas contínuas — 28/10/2026

## Estado e escopo

[Certo] Base Git `d787af6499dfed0a0ea75f7431d57294d633a634`, branch `Scaffx/rpg-hordas-continuas-20261028`. Migration criada com `npx --no-install supabase@2.121.0 migration new adventure_horde_continuous`: `supabase/migrations/20261028214109_adventure_horde_continuous.sql`, SHA-256 LF final `6C49188113014ECC3E61C1566F6588E20515BC99CE9C6C0DF2045712453E98DE`. Não houve commit, push, merge, deploy ou DDL remoto. Outros workers alteraram UI/parser nesta mesma árvore; este relatório cobre somente migration, contrato tipado, testes SQL e fixtures de QA.

## Fonte viva e preflight

[Certo] A fonte viva do projeto `jfnospjxdkelxlhcwuia` foi lida por SELECT via Supabase MCP, sem consulta de dados de jogadores. As sete definições completas, normalizadas para LF, estão em [20261028-hordas-live-sources](./20261028-hordas-live-sources/metadata.json). O MD5 LF de cada arquivo salvo coincide com `pg_get_functiondef`; o manifesto registra assinatura, owner, ACL, `SECURITY DEFINER`, volatilidade e o CHECK `engine_version='v3'`. A migration recusa drift de corpo, owner, ACL efetiva, `search_path`, overload e CHECK antes de qualquer mudança. O objeto de tabela mantém owner `postgres`, RLS ligado e ACL privada.

## Contrato v4

[Certo] Encontro normal inicia **três criaturas reais simultâneas** dos três slots do catálogo do bioma. Boss em 10, 20, 30 etc. continua **um único chefe**. O motor congela `enemies[]` por encontro em `rules_snapshot`, com slot, nome, ícone, resistências, HP/MP e ID local. `events[]` inclui `actor_slot`, `target_slot`, `enemies_hp[]` e `enemies_mp[]` em ordem fixa de slots. Morte preserva o slot e impede ação futura. `enemy_hp` singular é a soma do HP restante; vitória exige essa soma zerada. `enemy_mp` singular espelha o MP do ator inimigo ou do alvo do herói no evento; consumidores de horda usam o array por slot. [Contrato TypeScript](../../src/lib/adventureHordeContract.ts).

[Certo] O próximo evento é sempre o menor horário entre os relógios dos combatentes vivos. Herói inicia em 1,5 s e age a cada 2,8 s; inimigos da horda iniciam em 0,8/1,2/1,7 s e agem a cada 2,9/3,4/3,8 s. Dois inimigos podem atingir o herói antes da primeira ação dele. Skill equipada pelo herói consome seu MP e expira por horário: `(cooldown+1) × 2,8 s`. A estrutura do simulador também mantém MP/cooldown por inimigo, mas o catálogo persistido só tem nome, ícone e resistências; portanto inimigos publicados usam ataque básico, `max_mp=0` e nenhuma skill inventada. O snapshot do herói continua vindo de classe, atributos, equipamento, loadout alocado e pet elegível. Resistência é aplicada no alvo específico.

[Certo] CC pausa apenas a próxima ação do alvo até seu relógio seguinte (2,9/3,4/3,8 s); os outros inimigos continuam. Buff protege um hit recebido; debuff de vulnerabilidade afeta somente o alvo por 5,6 s. Sustentação do pet é aplicada na ação do herói, sem multiplicar a regeneração pelos três relógios inimigos. O relógio de 15 minutos encerra empate com `end_reason='event_limit'` em v4. Os quatro relógios geram no máximo 1.134 ações em 900 s; o teto defensivo de 1.200 fica além desse máximo. Eventos são acumulados em `jsonb[]` e convertidos uma vez ao final. Batalhas v3 em curso preservam a linha do tempo e liquidam pelo contrato anterior, inclusive `turn_limit`.

## Economia e calibração inicial

[Certo] O HP total normal é 102, próximo aos 100 do v3: 34 por criatura. Cada inimigo usa o poder de etapa existente, mas o dano base é dividido por 3 antes do piso de 1; a soma inicial do DPS fica próxima à de um inimigo anterior. Boss permanece com 150 HP e fórmula de poder anterior. Uma horda inteira gera **uma** batalha, um resultado, um ledger de ouro, no máximo um drop direto e no máximo um recibo de baú; chefes mantêm uma janela de material/receita. A fórmula de ouro existente usa duração real do encontro, com teto 48 por vitória; não se paga por criatura. Nenhuma função v4 atualiza XP, nível ou atributos permanentes.

Comparação local dos mesmos snapshots, motor v3 singular versus v4, com personagens artificiais:

| Cenário | v3 duração | v4 duração | Ouro/encontro v3/v4 | Ouro/hora de combate v3 → v4 |
| --- | ---: | ---: | ---: | ---: |
| Mago nível 20, etapa 1 | 8,0 s | 9,9 s | 1/1 | 450,0 → 363,6 |
| Guerreiro nível 100, etapa 1 | 1,6 s | 7,1 s | 1/1 | 2250,0 → 507,0 |
| Mago nível 40, chefe 10 | 11,2 s | 9,9 s | 2/2 | 642,9 → 727,3 |

[Certo] A coluna por hora é apenas `ouro do encontro / duração × 3600`, sem pausa, derrota, recuo, janela de item ou progressão de etapas; serve para detectar triplicação grosseira, não para projetar economia de produção. A horda prolonga especialmente o combate de herói acima do nível da etapa por exigir três alvos; esse balanceamento é inicial e precisa de observação após integração.

## Verificação PostgreSQL 17

[Certo] Cluster isolado PostgreSQL **17.9**, porta `55928`, dados/logs preservados em `C:/Users/Murillo/AppData/Local/Temp/rpg-hordas-20261028-2205`. A preparação reproduziu a cadeia reduzida de aventura/economia, os cinco migrations reais de 22/10 e o patch de pets de 26/10, mais a ACL viva dos dois wrappers públicos ausente no fixture antigo. Hashes LF de `sync`, `simulate_v3` e payload coincidiram com a captura viva antes da migration. Banco da primeira rodada: `hordes_final2`; clones `hordes_drift_*` mantêm ensaios negativos. Para a correção do cap, `hordes_cap_pet` foi clonado de `hordes_drift` antes da migration e recebeu o candidato final com preflight aprovado, exit 0. O banco `hordes_final2` preserva o limite anterior de 192 para reprodução negativa.

| Prova | Resultado |
| --- | --- |
| Replay composto e migrations predecessoras | exit 0; `COMPOSED_CHAIN_PASS` |
| Migration v4 na base fiel ao preflight | exit 0 |
| `assert.sql` via wrapper público | exit 0: três slots normais, boss singular, dois ataques inimigos antes do herói, MP/cooldown por ator, CC/buff/debuff, resistência, vitória total, morte parcial, empate pelo relógio, XP/nível/atributo intactos, ledger/baú/receita únicos, ACL, sem Auth, cross-identity e rejeição atômica |
| `retreat.sql`, `offline.sql`, `advance.sql`, `draw.sql` | exit 0 em cada no candidato final: derrota recua e entra em holding sem ouro; catchup cria confrontos sem recibos duplicados; avanço em holding é único; empate v4 gera `event_limit` sem ouro aos 1.134 eventos/899,8 s |
| `legacy.sql` | exit 0 no candidato final: simulação de batalha v3 inacabada termina uma vez; a próxima usa v4 |
| `legacy_before.sql` → migration → `legacy_after.sql` em clone próprio | exit 0/0/0: batalha v3 **realmente criada antes da migration** conserva eventos, liquida uma vez e somente a próxima usa v4 |
| `concurrency_a.sql` + `concurrency_b.sql` em duas sessões, depois `concurrency_assert.sql` | exit 0/0/0 no candidato final: um recibo e um ledger, sem XP duplicado |
| Drift de ACL, corpo e owner em três clones | migration exit 3 com `HORDE_SOURCE_OR_ACL_DRIFT` em cada; `drift_assert.sql` exit 0 confirma ausência de alteração parcial |
| Regressão defensiva `defensive_victory.sql` | Baseline 192: exit 3 esperado, chefe interrompido em 273,1 s; candidato final: exit 0, chefe 150 HP vencido em 418,7 s/295 eventos e horda 3×34 HP em 284,3 s/266 eventos; ambos com herói vivo e dano 1 por golpe |
| `defensive_settlement.sql` via wrapper público | exit 0: timeline defensiva de 295 eventos criada no servidor e vencida; liquidação repetida gera uma vitória, um ledger de ouro e nenhum XP |
| `pet_wrapper.sql` | exit 0: três pets reais elegíveis selecionados via RPC autenticado, `effective_stats` e HP/MP no snapshot, regen HP/MP e `mp_cost` medidos contra o mesmo snapshot sem sustain, troca de pet sem mutação da batalha, XP e ouro ausentes |
| `benchmark.sql` | exit 0; 30 amostras: horda real p95 0,772 ms/máx 5,360 ms; boss p95 0,512/máx 0,690 ms; relógio inteiro de 15 min p95 61,431/máx 62,184 ms |
| `catchup_benchmark.sql` | exit 0; 30 usuários artificiais, conciliação de 45 s por wrapper autenticado: p95 5,623 ms/máx 15,221 ms, abaixo de 250 ms na máquina local |

[Certo] Logs individuais estão em `.../logs/final2-*.log`, `.../logs/hordes_drift_*.log` e `.../logs/cap-pet-*.log`. Os testes de SQL ficam em [supabase/tests/horde_20261028](../../supabase/tests/horde_20261028/). Dois payloads de batalha produzidos pelo PG17, sem dados pessoais, estão em [horde.json](../qa/hordes/horde.json) e [boss.json](../qa/hordes/boss.json), copiados também para `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/hordas-20261028/fixtures/` para o preview do coordenador.

[Certo] `eslint src/lib/adventureHordeContract.ts` saiu 0. `tsc --noEmit -p tsconfig.app.json` saiu 2 com 67 diagnósticos globais; nenhum menciona o contrato tipado nem os arquivos de aventura alterados na integração nesta captura. Não houve comparação atual com um typecheck do SHA congelado. Log: `.../logs/tsc-app.log`. `git diff --check` saiu 0, com avisos de conversão LF/CRLF em arquivos de UI de outros workers. `supabase/.temp/cli-latest`, atualizado pela invocação da CLI, foi restaurado ao valor inicial.

[Certo] Teardown final, após a correção: `pg_ctl ... stop -m fast -w` exit 0; `pg_isready -h 127.0.0.1 -p 55928` exit 2; zero listeners TCP nessa porta. O cluster anterior de desenvolvimento na porta 55927 também havia sido desligado (exit 0/2). Dados e logs foram preservados nos dois diretórios de execução.

## Limites e integração

[Provável] O pior caso local e a conciliação medida ficaram abaixo do orçamento externo de 250 ms por chamada, mas CPU/latência de Supabase Nano, custos dos triggers e múltiplos encontros de catchup podem exceder esse valor; medir no ambiente integrado antes de promover. A preparação local é um fixture reduzido e não prova PostgREST, sessão autenticada no navegador, esquema completo em produção nem aplicação remota. Após este handoff, o parser compartilhado passou a reconhecer `event_limit`; a integração completa e o navegador continuam sob verificação do coordenador. Nenhuma alteração de NPC/PvP foi feita. Fonte Git e SHA-256 LF acima ficam congelados para revisão; qualquer nova edição da migration exige novo hash e preflight.
