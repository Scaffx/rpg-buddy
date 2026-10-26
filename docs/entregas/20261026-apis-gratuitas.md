# APIs gratuitas: handoff local em 2026-10-26

Base examinada: `32c27d396519150f00ddbb8106aa62d1b08fb951`. Escopo exclusivo deste worker: `ai-chat`, `generate-npc-challenges`, `processar_turno` e `src/test/freeAccessApi.test.ts`. Os demais diffs do checkout pertencem a outros agentes.

## Alterações

| API | Gate removido | Controles preservados |
| --- | --- | --- |
| `supabase/functions/ai-chat/index.ts` | `PADDLE_ENVIRONMENT`, `has_active_subscription`, `PAYWALL_LOCKED` e resposta 402 por assinatura | Bearer + `auth.getUser`, cliente com JWT/RLS, limite de 3 missões NPC por semana, máximo de 8 etapas de IA por pedido, 429 do provedor, conclusão de rotina via RPC `complete_mission` com `mission_id` após consulta filtrada por usuário. |
| `supabase/functions/generate-npc-challenges/index.ts` | Mesmos componentes do gate e 402 por assinatura | Bearer + `auth.getUser` (agora responde 401 para usuário não confirmado), consultas por `user_id`, reaproveitamento de desafios existentes para `weekToken`, fallback se a IA falhar. |
| `supabase/functions/processar_turno/index.ts` | Mesmos componentes do gate e 402 por assinatura | Bearer + `auth.getUser`, resolução de pet/skill por posse no banco, MP real, dono do combate em `personagem_id`, validação de turno; nenhuma alteração na distribuição de XP. |

O `402` recebido **do provedor** em `ai-chat` agora vira `503` com mensagem genérica de indisponibilidade e log apenas do status. Isso impede que o cliente o trate como cobrança do usuário e evita expor o corpo do provedor. Em `generate-npc-challenges`, a falha do provedor continua acionando o fallback local.

## SQL encontrado, somente leitura

Estas são referências **do repositório**, não confirmação do schema aplicado em produção:

- `supabase/migrations/20260427120000_security_fixes.sql:142-172`: última definição localizada de `public.has_active_subscription(uuid, text)`, com leitura de `public.subscriptions` por status, período e ambiente. O trecho concede `EXECUTE` a `authenticated`; não há gate SQL adicional encontrado nas APIs sob escopo.
- `supabase/migrations/20260430200000_auto_trial.sql:47-51`: trigger de perfil que chama `grant_trial_subscription`.
- `supabase/migrations/20260728090000_serialize_trial_grant.sql:19-77`: versões posteriores de `grant_trial_subscription` e `ensure_trial_subscription` continuam criando registros de trial. O root precisa confirmar definição, trigger, chamadas e dados **live** antes de qualquer plano de retirada; nenhuma migration ou DDL foi feita aqui.
- `supabase/migrations/20260429121500_npc_weekly_ai_challenges.sql:31-37`: a tabela de desafios permite `INSERT`, `UPDATE` e `DELETE` ao próprio usuário por RLS. A Edge Function gera metadados de `xp_reward`/`gold_reward`, sem creditar XP/ouro neste caminho; convém ao root inspecionar o uso live desses dados antes de tratá-los como recibos autoritativos.

## Provas locais

| Cenário | Resultado |
| --- | --- |
| Sem Bearer nas três APIs; Bearer sem usuário confirmado | 401, sem chamada ao provedor ou leitura de tabelas. |
| Usuário autenticado sem RPC de assinatura em `ai-chat` | Resposta 200; JWT encaminhado ao cliente Supabase. |
| Conclusão de missão via IA | Busca `missions` por ID **e** `user_id`; única RPC observada: `complete_mission({p_mission_id})`. |
| Provedor de IA retorna 429 / 402 | 429 preservado; 402 convertido em 503 operacional no chat. |
| Desafios existentes / falha de créditos do provedor | Consulta filtrada por `user_id` e semana; fallback gravado com o `user_id` confirmado. |
| Combate de outro usuário / skill declarada sem posse | 403 / 400, sem RPC de assinatura e sem escrita no combate. |

`node_modules/.bin/vitest.cmd run src/test/freeAccessApi.test.ts src/test/legacyCombatRelease.test.ts`: **exit 0**, 20 testes aprovados (13 novos, 7 legados). `node_modules/.bin/eslint.cmd src/test/freeAccessApi.test.ts`: **exit 0**. `git diff --check` nos arquivos sob escopo: **exit 0**. `node_modules/.bin/tsc.cmd --noEmit -p tsconfig.app.json`: **exit 1**, com diagnósticos em arquivos fora desta entrega (por exemplo `CombatArena.tsx`, `ReportsPanel.tsx`, hooks e páginas); nenhum diagnóstico citou os arquivos editados. Não foi feito baseline isolado da base congelada para esses erros globais.

`src/test/legacyCombatRelease.test.ts:53` ainda espera `has_active_subscription` no **artefato histórico** de release `supabase/releases/20261019/processar_turno/index.ts`. Ele passou sem mudanças. O owner root deve manter esse contrato se o arquivo continuar validando o release congelado; para cobrir a função corrente, usar `freeAccessApi.test.ts` ou um teste próprio, sem alterar o hash histórico.

## Pendências para integração

- **Custo de IA:** as funções não têm quota própria por usuário. `ai-chat` limita a 8 etapas por pedido e repassa 429 do provedor, mas isso não limita quantidade de pedidos; `generate-npc-challenges` aceita `weekToken` do cliente, permitindo gerar semanas arbitrárias. A retirada do paywall aumenta exposição a custo. Não havia orçamento de produto a preservar ou limite existente a remover nestes arquivos.
- **Fallback NPC:** o catálogo fallback atual tem 12 desafios porque não contém templates de Midas (`generate-npc-challenges/index.ts:124-146`); o teste registra o comportamento existente. Não foi expandido nesta mudança de acesso.
- **Ambiente:** sem acesso remoto, banco, deploy, push ou browser. O teste prova o código local com mocks de Auth, Supabase e provedor; não prova Auth, ACL/RLS, rate limit de gateway nem versão publicada.
