# Baús: aberturas permanentes, sorteio e Loja do Tempo

Base `9a00224` no worktree compartilhado PR77. Entrega somente local: migration
`20261031044207_chest_parallel_loot_time_shop.sql`, criada por
`npx --no-install supabase migration new chest_parallel_loot_time_shop`.
Nenhum commit, push, deploy ou SQL remoto foi executado.

## Contrato do servidor

- `get_adventure_chests()` mantém `slots_total=4`, `occupied`, `chests`,
  `server_now`, `next_eligible_at`, `overflow`, `recent_overflow`,
  `recent_claims`; acrescenta `openings_cap`, `openings_active`,
  `unlocks:{second,third,fourth,fourth_available}`,
  `prices_gold:{second:6000,third:18000}`,
  `price_cash:{currency:"BRL",amount_minor:990}` e `loot_table`.
- Cada chest v2 retorna `loot_version=2` e `loot_rules` congelado com
  `gold_min`, `gold_max`, `potions_min`, `potions_max`, `scrap`, `essence`,
  `equipment_chance_bps`, `equipment_rarity_bps`. `range` é um alias de
  `loot_rules`; `minimum` mostra o piso de ouro/poções e materiais fixos,
  sem revelar o equipamento ou o prêmio exato antes do resgate. As quatro
  chaves de raridade de equipamento sempre existem, inclusive quando valem 0.
- `buy_adventure_chest_opening(p_target_cap integer,p_request_id uuid)`
  compra somente a sequência 1→2 por 6000 ouro e 2→3 por 18000 ouro.
  Resposta: `{ok,replayed,request_id,target_cap,openings_cap,gold_spent,gold}`.
  Perfil, saldo, direito permanente, recibo único e `gold_history` são
  atualizados na mesma transação. Preços são configuráveis em tabela privada.
- `get_adventure_chest_opening_receipt(p_request_id uuid)` retorna
  `{found:false}` ou
  `{found:true,ok:true,replayed:true,request_id,target_cap,openings_cap,gold_spent,gold,purchased_at}`.
  Resolve resposta de compra perdida sem nova mutação.
- `start_adventure_chest(uuid)` serializa pelo perfil e conta as aberturas
  ativas contra o direito permanente. Um baú já em abertura retorna replay;
  o quarto é negado sem recibo de compra avulsa. `claim_adventure_chest(uuid)`
  mantém relógio do servidor, propriedade, pagamento atômico e replay do
  recibo congelado. Baús adquiridos em v1 preservam ouro, sucata, essência,
  poções, equipamento e tempos originais.

Os preços de 6000/18000 ouro são configuração inicial, equivalentes a
5×/15× o item de entrada de 1200 ouro da Loja do Tempo. Recalibrar com dados
reais de ganhos antes de publicar.

## Sorteio de novos baús

Chance de raridade por oportunidade normal: comum 72%, raro 20%, épico 7%,
lendário 1%. Chefes conservam o piso raro preexistente: 92% raro, 7% épico,
1% lendário. A chance de equipamento é independente; após ela, a raridade
do equipamento usa a distribuição condicional abaixo. Todas as quantidades
rolam dentro do intervalo inclusivo e ficam gravadas na instância/recibo.

| Baú | Ouro | Poções | Sucata | Essência | Chance de equipamento | Incomum / raro / épico / lendário se equipamento |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Comum | 30–60 | 0–1 | 2 | 0 | 5% | 100% / 0 / 0 / 0 |
| Raro | 90–150 | 1–2 | 5 | 1 | 15% | 60% / 40% / 0 / 0 |
| Épico | 220–380 | 2–3 | 12 | 3 | 35% | 30% / 40% / 30% / 0 |
| Lendário | 600–1000 | 3–5 | 30 | 8 | 60% | 20% / 25% / 35% / 20% |

O equipamento vem somente das ofertas gerais curadas ou da lista explícita
de equipamentos de rotina não exclusivos. O filtro revalida categoria,
classe/nível, `boss_drop_level IS NULL`, ausência de receita, requisito e
efeito especial. Sorteio de uma raridade sem item elegível produz **nenhum
equipamento**; não remapeia para item de chefe. Sem poção elegível, a
quantidade efetiva é zero. Ouro, materiais e poções/equipamento elegíveis
são congelados pelo servidor; XP e atributos não são concedidos. Excesso
da fila de quatro recebe ouro/material e conversão em sucata, com recibo.

## Compra avulsa em dinheiro

O quarto desbloqueio é permanente, preço **R$ 9,90** (`BRL`, 990 centavos).
`public.grant_adventure_chest_cash_receipt(p_user_id uuid,
p_transaction_id text,p_event_id text,p_price_id text,p_amount_minor integer,
p_currency text,p_environment text)` aceita apenas `service_role`, preço
Paddle `live` exato configurado, `transaction.completed` validado pelo
backend, `BRL/990` e transação/evento únicos. Responde
`{ok,replayed,cash_unlocked,openings_cap,transaction_id}`. O banco não
aceita prova enviada por cliente, doação ou Pix. A configuração privada
começa `enabled=false` e sem `price_id`; portanto o quarto permanece
indisponível até checkout/webhook de compra única autenticado, associação
segura ao usuário e preço real configurado. O webhook Paddle atual só trata
assinaturas e não pode conceder esse direito.

## Loja do Tempo

A migration atualiza apenas os 15 efeitos pagos conhecidos, após exigir
exatamente uma linha por efeito e preço atual menor. O RPC vigente
`buy_shop_item` debita `shop_items.cost_percent`; o teste chamou o RPC e
verificou débito e `gold_history`. A tabela privada
`app_private.time_shop_price_tiers` mantém valores explícitos e sincroniza
alterações para o catálogo. Ofertas de equipamento/pet e a gratuidade
preexistente de `estado_fluxo_xp` não são alteradas.

| Efeito | Ouro | Efeito | Ouro | Efeito | Ouro |
| --- | ---: | --- | ---: | --- | ---: |
| `tv_session` | 1200 | `gaming` | 1600 | `extra_time` | 1800 |
| `free_meal` | 2200 | `social` | 2500 | `revive` | 3000 |
| `rest` | 3500 | `shield` | 4000 | `double_xp` | 4500 |
| `adrenalina` | 4500 | `foco_profundo` | 5000 | `attr_boost` | 5500 |
| `boss_buff` | 6000 | `auto_complete` | 6500 | `streak_protector` | 8000 |

## Evidência PostgreSQL 17 local

`supabase/tests/20261031_chests_pg17.ps1` iniciou cluster isolado na porta
`55791`; diretório e logs preservados em
`C:/Users/Murillo/AppData/Local/Temp/rpg-chests-20261031-20261031-020627`.
Verificou 28 hashes LF do fixture composto anterior, reproduziu fontes
legadas de aventura, Receitas `20261022022416`, Economia `20261022022614`
e Baús `20261022022726` (todos exit 0), então aplicou esta migration
(exit 0). Asserts exit 0: v1 congelado e claim, v2 e item lendário do pool
seguro, sorteios/limites, compra 2/3, replay/lookup, saldo insuficiente
atômico, quatro aberturas só com recibo cash simulado, ACL e preço real da
Loja do Tempo. A configuração cash de teste foi revertida.

Clones de preflight com grant indevido a `anon` ou hash de função alterado
rejeitaram a migration (`exit 3`, nenhuma tabela nova). Duas sessões sob
cap 1: primeiro início `exit 0`, segundo `CHEST_OPENING_CAP`/`exit 3`,
apenas uma abertura. Duas sessões comprando o mesmo request: primeira
resposta nova e segunda replay, ambas `exit 0`, um recibo, um débito,
saldo 94000 após preço 6000. Duas sessões resgatando o mesmo baú v2:
primeira resposta nova e segunda replay, um recibo, um crédito e uma peça
lendária no inventário. `pg_ctl stop -m fast -w` saiu 0;
`pg_isready` retornou 2, sem listener local.

SHA-256 com conteúdo UTF-8 e LF canônico:

| Fonte | Hash |
| --- | --- |
| Migration nova | `bf122f6e1a5526312374c9787f68a53e3606f719f5bb025157c851386ccf4416` |
| `20261031_chests_pg17.ps1` | `11cd148c8254aa2b460a4aff592e50fde2cb30212c9a656f2e7af5aa1660eed0` |
| `20261031_chests_catalog_fixture.sql` | `4b30b1935bf5f78414d9dc0911ed4b3de7e53a2a197a18e4e55b51f544db8e75` |
| `20261031_chests_assert.sql` | `16810c564705971176f1b035c0f53874058cb1998ce358cd6241289229169260` |
| `20261031_chests_preflight.ps1` | `5798b0fa3d94d506b419b296c3d8ed35126d484f46c925bd3443e8e784f50ef7` |
| `20261031_chests_concurrency.ps1` | `ccfa560058a987128d46b0a04efa4bed32416108edb17dbed219343fcefacaab` |

O fixture composto é reduzido: não aplica integralmente todas as migrations
posteriores de horda/pets/missões, nem demonstra PostgREST, sessão
autenticada real, catálogo/preços no banco implantado, checkout Paddle ou
compatibilidade de produção. Os hashes das seis funções antigas de baú
foram fornecidos pela leitura remota do coordenador em 31/10 e são
comparados no preflight; uma divergência bloqueia a aplicação. Falta
confirmar a compatibilidade integral do esquema implantado, validar o webhook de
compra única contra o provedor e repetir QA autenticado antes de qualquer promoção.

Na revisão independente final, a coordenação encontrou default ACL herdada
que permitia TRUNCATE em tabelas novas apesar do REVOKE direto. O agente de
pagamento reproduziu o problema em PG17 (instalação exit 0 e privilégio
efetivo presente) e acrescentou postflight das nove tabelas e dos RPCs
antes do COMMIT. O clone negativo passou a recusar a instalação com exit 3
e sem tabela parcial; os replays positivos de baús e cash passaram. O hash
da migration nesta tabela já corresponde a essa fonte final. Evidências
complementares e diretórios de logs estão em `20261031-cash.md`.

Leitura remota do coordenador em 31/10 confirmou 16 efeitos únicos no
catálogo ativo: 15 pagos com os IDs da tabela acima e `estado_fluxo_xp` a
zero. Os IDs `full_rest`, `shield_24h`, `xp_boost`, `boss_debuff` aparecem
em fontes antigas, mas não existem no catálogo implantado; o fixture desta
entrega usa os IDs ativos. `anon` e `authenticated` não herdam
`service_role` ou `postgres`; os defaults de funções `public` concedem
`EXECUTE` diretamente, então a migration revoga e verifica o ACL efetivo.
