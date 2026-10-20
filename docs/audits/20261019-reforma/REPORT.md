# Revisão independente da reforma automática — 19/10/2026

## Corte, decisão e autoridade

**Fonte examinada:** `ba5f6e235e5f25db9c4d781a6b278f8455bd08c4` contra `1f49463efbf964ea94160353016af021f3e7c03e`. O relatório e os probes desta pasta são o único acréscimo desta revisão; não houve correção de produto. Contrato: `docs/REFORMA_AUTOMATICA_20261019.md`, inclusive a distinção entre requisitos humanos e calibração inicial 2/1/0,2 da coordenação. Li o diff de 117 arquivos, os 11 SQL novos e o WIP anterior de `730e7d2d381a3bd6bc895be5e1ff2739b9d81701` contra `1928e729...`; não usei as conclusões dos autores como prova.

**Veredicto do produto no SHA acima: REPROVADO para promoção.** Há reprodução independente em PostgreSQL 17 de efeitos de uma rotina que continuam após seu undo: um bônus de fluxo aumenta o XP de uma rotina posterior, inspiração continua disponível e HP máximo continua aumentado. O XP, ouro e recibo de atributos da rotina são revertidos nos cenários testados, mas o contrato exige reconciliar também os efeitos derivados. Nenhuma publicação, migração remota, merge ou homologação ocorreu. Uma correção posterior exige novo SHA e nova revisão.

| Critério | Resultado no corte | Evidência e limite |
| --- | --- | --- |
| Checklist somente estado; conclusão paga uma vez; undo de XP/ouro/atributos | **PASS parcial** | Suites SQL e provas RPC locais; três efeitos derivados falham no undo. |
| Cotas por dia agendado 4 altas/8 médias, baixas ilimitadas; semana flexível e únicas em datas distintas | **PASS parcial** | Migrações e suites de agenda/cotas em fixture PG17 passaram; nenhum ataque exaustivo de editar/apagar/recriar nem dados históricos reais foi feito. Multiplicadores 2/1/0,2 são calibração, não exigência numérica humana. |
| Aventura automática, boss nas etapas 10/20, ouro/loot sem XP, derrota e retomada | **PASS parcial** | RPC pública local e duas sessões cobrem etapas 9/10/11/19/20, derrota e concorrência. Não há sessão de produto publicado nem relógio offline de 24 h/limites diários exercitados com conta real. |
| Autoria de economia; RLS/ACL e `SET ROLE` | **PASS parcial** | `authenticated` não alterou XP/ouro/itens por DML nos probes locais; `anon` sem execução da RPC de aventura. Snapshot read-only de Primary confirma estado anterior, não rollout das migrações. Não inferir `attacl` remoto apenas de `information_schema.column_privileges`. |
| Migrações aditivas e rollout sobre estado vivo | **BLOQUEADO** | 11/11 migraram na fixture e A6 rejeitou drift; não foram aplicadas a Primary. Preflight de hashes/assinaturas e plano de rollback precisam ser executados no ambiente alvo no momento do rollout. |
| Interface, tradução e acessibilidade | **PASS parcial** | 252 testes e build passam; texto acessível do menu e promessa de XP co-op não acompanham idioma/contrato vivo. Sem teste humano de leitor de tela. |
| Produto/API publicado | **BLOQUEADO** | Apenas snapshots read-only de definições, ACL e Edge v33. Nenhum fluxo autenticado fim a fim ou ataque remoto executado. |

## Achados priorizados

### P1 — Undo deixa bônus de XP concedido por rotina desfeita

**Fonte:** `supabase/migrations/20261019193625_progressao_reversao_checklist.sql:552-556,762-764` concede `_grant_flow_xp_buff`; a função viva capturada em `work/sprint-20261019/live-health-functions.json` (22:03:32 UTC; também em `live-extra-functions.json`) insere um `user_buffs` ativo com 48 h. A definição final de `undo_mission` em `supabase/migrations/20261019210221_attribute_award_receipts.sql:484-583` retira os recibos econômicos e de atributos, mas não identifica/reverte esse buff. O helper real foi colocado, só durante transação local, sobre a fixture reduzida para evitar o stub neutro da fixture.

**Cenário/prova:** `audit_flow_buff.sql` como `authenticated`: rotina criativa média paga 25 XP; undo tira 25; buff ativo permanece; outra rotina média paga 30 XP, contra 25 sem bônus. `psql -X -v ON_ERROR_STOP=1 -f ...` termina **3 intencional**, `AUDIT_FLOW_BUFF_REMAINS`; a transação abortada é revertida. Há aumento econômico futuro causado exclusivamente por uma rotina anulada. **Correção esperada:** recibo/proveniência para buff de missão e reconciliação idempotente no undo, preservando buffs anteriores/independentes e lidando com buff já consumido; teste de conclusão→undo→outra rotina com a função real.

### P1 — Undo conserva efeitos de inspiração e HP máximo

**Fonte:** `20261019193625_progressao_reversao_checklist.sql:555-565,749-763` aciona inspiração social e `_apply_mission_health_effects`; `20261019210221_attribute_award_receipts.sql:484-583` não desfaz esses lançamentos. A função viva de saúde, MD5 de corpo `ec7b2cbdc6035c3b129ef400c6f20bb9`, acrescenta HP/MP máximos. A captura read-only de triggers de 22:04:12 UTC não lista `sync_health_on_profile_level_change` anexado a `profiles`; portanto não há base para atribuir o HP residual a esse trigger.

**Cenários/prova:** `audit_derived_effects.sql` faz rotina social baixa com `presenca_inspiradora`: `inspired_available=true` após concluir e após undo, embora `total_xp=0`; saída **3 intencional**, `AUDIT_DERIVED_EFFECT_REMAINS`. `audit_health_undo.sql` usa o helper de saúde vivo em transação sobre a fixture (que recebe apenas as colunas MP ausentes): rotina física baixa com `corpo_de_ferro` passa HP máximo de 100 para 102; após undo HP máximo continua 102 e XP é 0; saída **3 intencional**, `AUDIT_HEALTH_EFFECT_REMAINS`. **Correção esperada:** recibos de efeitos por conclusão, inversão condicional e idempotente no undo, respeitando consumo e mudanças posteriores de saúde/inspiração; testar versões diárias, semanais e únicas. Não reduzir HP/MP ou apagar inspiração preexistente sem proveniência.

**Indício complementar, fora da reprodução independente acima:** `live-talent-level-trigger.json` captura o trigger vivo `sync_talent_points_on_level_change_trigger` em `profiles`: a função soma pontos quando o nível sobe e apenas preserva pontos quando desce. A frente A12 comunicou reprodução própria `XP 399 / nível 4 / pontos 0` → concluir média `XP 424 / nível 5 / pontos 1` → undo `XP 399 / nível 4 / pontos 1`; seu script e saída não foram executados por esta revisão. Tratar reversão de ponto de talento como gate adicional do próximo SHA, sem atribuí-la à prova local desta pasta.

### P2 — Ao gastar ouro legítimo, undo da rotina fica indisponível

**Fonte:** `20261019210221_attribute_award_receipts.sql:491-494` exige que o saldo corrente contenha todo o ouro da conclusão antes de qualquer reversão. `audit_spend_undo_redo.sql` conclui uma rotina baixa (2 ouro), compra legalmente um item cujo preço drena o saldo a zero e recebe `Saldo de ouro insuficiente para desfazer`; o estado permanece inteiro. Um segundo ramo deixa saldo suficiente após uma vitória automática e então undo/redo funciona sem ganho líquido: ouro final 4 e XP 5, saída **0** com `ROLLBACK`.

**Impacto/decisão:** a regra humana pede undo total, mas a economia precisa de política explícita quando a recompensa já foi gasta. Não é prova de farm ou duplicação. **Correção esperada:** definir e testar débito/compensação ou política de impedimento visível antes do gasto; manter inventário e ouro íntegros em rollback, sem fabricar saldo.

### P2 — Cadeia histórica co-op diverge da Primary e pode reintroduzir XP em replay

**Fonte histórica, não comportamento vivo demonstrado:** `supabase/migrations/20260503050000_social_search_coop_missions.sql:145-188` define `complete_co_op_mission(uuid)` que paga XP direto, lê `xp_claimed` antes de trava e não exige recibo de rotina; SHA256 do arquivo `dfb7f262711b3f9fac8e5971246fc771cbbd3b9a4be042cdb542093e3898dbab`. `20260811001000_coop_meta_e_prazo.sql:19-29,41-101` acrescenta meta/prazo à criação sem atualizar a função de conclusão; SHA256 `19694d8c52fdcd4a77e49fbd744096a44f8482edceb10db0ca6ef95c9e27265`. Busca das migrações deste repositório encontrou apenas a definição histórica de conclusão; as 11 migrações novas não a substituem. O teste `audit_coop_no_routine.sql` em DB descartável composto com **essas duas migrações históricas adicionais** e as 11 da reforma conclui meta 7 sem rotina e recebe XP 25, saída **3 intencional**. `audit_coop_concurrency.mjs` com duas sessões obtém duas respostas de sucesso, XP 50 e duas atividades, saída **1 intencional** com limpeza.

**Contraprova viva:** `work/sprint-20261019/live-coop-functions.json`, Primary read-only em 21:59:36 UTC, mostra `complete_co_op_mission(uuid)` de corpo MD5 `c0df6625c41b5d9e90ab681f111f889c` com `activity_log.xp_gained=0` e sem `UPDATE profiles`; `create_co_op_mission` vivo tem 3 argumentos, sem meta. `authenticated` e `anon` possuem EXECUTE, mas o corpo requer `auth.uid()`. Portanto **não afirmo XP 25/50 nem bypass de rotina na Primary atual**. O risco é replay/reset a partir do histórico ou migração futura que sobrescreva a definição viva. **Correção esperada:** reconciliar migração corretiva aditiva e contrato co-op com a definição viva antes de qualquer replay; preservar eventual semântica legítima de co-op somente quando comprovada como rotina. Nenhuma exploração remota foi feita.

### P2 — Interface co-op promete crédito que a RPC viva não concede

`src/pages/SocialPage.tsx:239,265` mostra `mission.xp_per_player` e anuncia sucesso de XP após `completeMission.mutate`, mas a definição viva acima registra XP zero. A divergência antecede esta reforma, mas contraria o contrato de só anunciar crédito confirmado por RPC e fica visível no produto após a integração. **Correção esperada:** usar resultado autoritativo e copy compatível com o estado vivo; não anunciar XP por um sucesso booleano.

### P3 — Rótulos acessíveis do menu móvel ficam em português em outros idiomas

`src/components/ui/sidebar.tsx:186-188` fixa `SheetTitle` e `SheetDescription` em português; o app oferece EN/ES/RU/ZH. O foco volta ao acionador e o diálogo agora tem nome/descrição, mas leitor de tela nos outros idiomas receberá copy em português. **Correção esperada:** chaves traduzidas para os cinco locales e teste de idioma do nome acessível.

## Provas positivas e execução independente

Todas as provas SQL abaixo rodaram em PostgreSQL **17 local descartável**, porta `55543`, DBs `integration_audit_*`, com `auth.uid()` simulado pelo JWT de sessão e `SET LOCAL ROLE authenticated`. A fixture de `supabase/tests/progressao_live_fixture.sql` é reduzida; inclui helpers neutros para fluxo/saúde, que os probes negativos substituem com corpos capturados da Primary somente dentro de transações. Isto **não é API Supabase nem produção**. Os códigos 3/1 indicados como negativos são o resultado esperado de assertions que mostram falha do produto; não são testes verdes.

| Execução | Saída | Resultado observado |
| --- | ---: | --- |
| `node scripts/replay_reforma_sql_local.mjs integration_audit_f3fd9912_clean 55543` após fixture | 0 | 11/11 migrações aplicadas com hashes LF da tabela abaixo. |
| `psql -X -h 127.0.0.1 -p 55543 -U postgres -d integration_audit_f3fd9912_clean -v ON_ERROR_STOP=1 -f docs/audits/20261019-reforma/audit_public_contract.sql` | 0 | Etapas 9 normal, 10 boss, 11 normal, 19 normal, 20 boss; etapa final 21, ouro 100→136, XP/atributos 0; derrota na 100 e retomada após equipamento, etapa 101. `anon` não executa RPC; DML econômico negado a `authenticated`. `ROLLBACK`. |
| `node docs/audits/20261019-reforma/audit_adventure_concurrency.mjs integration_audit_f3fd9912_clean 55543` | 0 | Duas sessões para mesmo usuário: só uma etapa, uma entrada de ouro, saldo 104, etapa 2; fixtures apagadas. |
| `psql ... -f docs/audits/20261019-reforma/audit_flow_buff.sql` | 3, esperado como achado | Fluxo de XP residual: próximo XP 30 após undo. |
| `psql ... -f docs/audits/20261019-reforma/audit_derived_effects.sql` | 3, esperado como achado | Inspiração residual e XP 0 após undo. |
| `psql ... -f docs/audits/20261019-reforma/audit_health_undo.sql` | 3, esperado como achado | HP máximo 102 após undo e XP 0. |
| `psql ... -f docs/audits/20261019-reforma/audit_spend_undo_redo.sql` | 0 | Bloqueio íntegro com saldo 0; ciclo possível sem saldo negativo após outra fonte legítima de ouro. `ROLLBACK`. |
| `psql ... -f docs/audits/20261019-reforma/audit_coop_no_routine.sql` no DB com duas migrações históricas adicionais | 3, esperado como achado histórico | Meta 7, nenhuma rotina, XP 25. |
| `node docs/audits/20261019-reforma/audit_coop_concurrency.mjs integration_audit_coop_f3fd9912 55543` | 1, esperado como achado histórico | Duas conclusões, XP 50; limpeza executada. |
| `psql -X -v ON_ERROR_STOP=1 -1 -f audit_a6_semantic_drift.sql -f <A6>` no DB pré-A6 | 3, esperado | Troca `=`→`>` no helper causa `WEEKLY_MILESTONE_RPC_DRIFT`; transação reverte. |
| Mesmo comando com `audit_a6_stray_cr.sql` em outro DB pré-A6 | 3, esperado | CR isolado é rejeitado; CRLF de transporte normal é aceito no replay limpo. |
| `psql -X -v ON_ERROR_STOP=1 -f supabase/tests/20261019_integracao_assert.sql` e suites `progressao_reversao.sql`, `progressao_security.sql`, `20261019_agenda_conclusao.sql`, `20261019_attribute_award_receipts.sql`, `20261019_weekly_target_milestone.sql`, `priority_caps_corrective_rpc.sql` | 0 cada | Suites autorais rerodadas na composição local; elas não cobrem os três resíduos acima. |
| `npm run test -- --run` | 0 | 36 arquivos, 252 testes. |
| `npm run build` | 0 | Build com avisos de Browserslist, bundle grande e `??` em `PortalEventPage.tsx`. |
| `npx tsc --noEmit -p tsconfig.app.json --pretty false` | 2 | 53 diagnósticos locais; referência de 55 anteriores foi informada, sem log independente pareado para atribuir deltas. |
| `npx tsc --noEmit -p tsconfig.node.json --pretty false`; `git diff --check 1f49463efbf964ea94160353016af021f3e7c03e HEAD` | 0, 0 | Config Node e whitespace. |

O script `inventory_authorship.sql` foi invocado também sobre a composição já inicializada e saiu 3 ao recriar `auth`; é **erro de montagem do harness**, não resultado do produto, e não entra nas linhas verdes. `node_modules` já existia/linkava checkout principal; não reproduzi `npm ci` nesta worktree. Nenhuma suite de autor homologa comportamento por si só.

Na leitura do caminho novo, `src/components/AppLayout.tsx:63` inicia `useAutoAdventure({ background: true })` sob o shell autenticado; `src/hooks/useAutoAdventure.ts:13-24` chama `sync_auto_adventure` sem parâmetros de XP, ouro ou resultado, usando a mesma chave de consulta da arena. O tipo gerado em `src/integrations/supabase/types.ts:3084` registra `Args: never`. A função SQL final trava `adventure_state` em `20261019205224_boss_auto_entitlements.sql:147-162`, limita tempo a 24 h/48 confrontos, escolhe boss com `stage % 10` em `:239-247`, limita 120 ouro/2 itens por dia em `:260-261` e encerra o lote após derrota em `:306`. A prova de duas sessões sustenta idempotência para um confronto; os demais limites foram inspecionados no código e não receberam stress completo.

### Hashes do replay local LF

O runner normalizou apenas CRLF de checkout para LF antes de executar; os hashes abaixo vinculam os SQL testados, não o estado da Primary.

| Migração `supabase/migrations/` | SHA256 LF |
| --- | --- |
| `20261019193625_progressao_reversao_checklist.sql` | `2c6af5af0cfa9569c87a3748d03b3430fe90a56c4ea962ce0e1917ff93e50445` |
| `20261019194052_auto_adventure.sql` | `d02a7ba2f0eb39108c20aee23e775fc174a5b637e0c07d4d1f9941c84491d6a3` |
| `20261019200215_mission_priority_daily_caps.sql` | `d436d6b5822e41ce554bf82ee2918b3fefe992058256d69ba523e547f74208ea` |
| `20261019204003_close_forged_xp_buff_and_npc_undo.sql` | `ea949b299e9b872bcd26d1949a2de2c7ee5a28b3d46d772ea3c8786e4189c8d3` |
| `20261019204951_mission_priority_paid_cap_lock_order.sql` | `3562859ef81048797c075e4d769d1752a6d6a0bf5114ff7f326e415210eea9a9` |
| `20261019205224_boss_auto_entitlements.sql` | `1064fd0ff8a949839f23f2400c0ebcb7c2554f4e0811ed774af27f6f08d3eaf0` |
| `20261019205347_guard_mission_completion_schedule_and_undo_after_paid_cap.sql` | `cd0858c23bd12f75820430e6b5c78c16a39de97b3846cb1e93cbb54c26b08207` |
| `20261019210026_inventory_authorship.sql` | `3df342d304bbf4d70f2dc5d1a11c47cbd46a20334f2896546d18448d5c47840b` |
| `20261019210221_attribute_award_receipts.sql` | `93d694789ebae1a2007798b2243950010d32b1de8d083a93b4977512a2d9597d` |
| `20261019211310_auto_adventure_reachable_catalog.sql` | `be47c71f1d7df305ef493be2fc6b115ec50071881caeca8c9f699e1b9873bfdb` |
| `20261019212523_restore_unpaid_weekly_milestone_after_target_edit.sql` | `1bcceaedeceb7e194f4b84e73660ba0bef85cb518908fc3ea9a6753ffffe0f44` |

## Estado vivo e limites do rollout

Snapshots read-only externos a este commit, sob `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/sprint-20261019/`: `live-db-snapshot.json`, `live-authority-schema-lean.json` (20:52:50 UTC), `live-preflight-final.json` (21:54:15 UTC), `live-coop-functions.json`, `live-health-functions.json`, `live-health-triggers.json`, `live-talent-level-trigger.json`, `live-edge-processar-turno.json`. Eles são fotografias, não verificação de migração aplicada. A checagem local de `SET ROLE` e ACL não cobre toda closure de roles futura; a Primary capturada tem PG17.6, `anon`/`authenticated` sem BYPASSRLS, PKs/UNIQUE não deferrable nas tabelas econômicas consultadas. Antes de rollout, repetir preflight read-only de assinaturas, hash dos corpos, constraints exatas (`condeferrable`, `indimmediate`, colunas PK), `attacl`/proacl, role membership/`SET ROLE`, RLS e dependências; não presumir que migração histórica representa função viva.

Edge: `live-edge-processar-turno.json` mostra v33 `ACTIVE`, `verify_jwt=true`, `files[0].content` SHA256 `c010dd703c9ebf3676252141d8893333856b38971b7b2debd6e5844851220c01`, igual a `supabase/releases/20261019/processar_turno/published-v33.ts`. A proposta `index.ts` tem SHA256 `6943cd24afe689cf8fb6f4b39f9a29eeb546cedfd773c38f0f2755c3cc44feba` e é a v33 menos 145 linhas de recompensa; o handler canônico `supabase/functions/processar_turno/index.ts` tem SHA256 `8ab683ecc8b6f146c4c8beac87908e5f05377f6e7820c60aa16b47938cc1c21e`. Testes de mock não substituem deploy nem chamada autenticada ao endpoint. Sem escrita remota.

Para acessibilidade, testes automatizados cobriram título/descrição do menu e retorno de foco, mas não leitura real em leitor de tela. Para economia, o probe de duas abas não cobre janela offline de 24 horas inteira, teto de 120 ouro/2 itens por virada de dia de São Paulo, todos os modos de loot, nem clock manipulado. As rotinas diárias/semanais/únicas, edição e reativação tiveram suites locais; não houve fuzzing completo de criar→concluir→editar→apagar→recriar nem migração em dados reais. O WIP prévio permaneceu no checkout; nenhuma limpeza ou rebase foi feita.

## Teardown e entrega

Os probes SQL desta pasta usam `BEGIN`/`ROLLBACK` ou erro intencional que aborta a transação; os probes de concorrência apagam usuários sintéticos no `finally`. Consultas finais retornaram **0** usuários `audit-%@example.invalid` nos DBs de composição principal e co-op. O cluster temporário PG17 em `%TEMP%/rpg-audit-f3fd9912-pg17`, porta 55543, foi **parado** com `pg_ctl stop -m fast` (exit 0; `pg_ctl status` seguinte: `no server running`, exit 3); diretório e logs locais foram preservados para rechecagem, sem dados da Primary. Não houve push, deploy, merge, escrita remota, alteração de implementação nem aprovação de correção própria. Próximo gate: corrigir efeitos derivados em outro SHA, repetir probes independentes, fechar a divergência co-op por migração aditiva segura e validar preflight/rollout com estado vivo.
