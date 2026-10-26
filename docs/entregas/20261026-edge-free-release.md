# Edge gratuito: release candidate local em 2026-10-26

Base Git examinada: `32c27d396519150f00ddbb8106aa62d1b08fb951`. Os três arquivos LIVE fornecidos no handoff foram arquivados em `supabase/releases/20261026-free-access/*.live.ts`, com finais de linha LF canônicos e uma quebra de linha final. O manifesto registra hashes SHA-256 dessas fontes normalizadas, bases do patch, arquivos finais e metadados `verify_jwt`; `verify-release.mjs` recompõe os diffs permitidos e falha se houver drift. A coordenação comparou o conteúdo ao retorno original do conector: `processar_turno` e `ai-chat` são idênticos em bytes; `generate-npc-challenges` difere apenas por CRLF convertido em LF e quebra final. Nenhum deploy, alteração no banco, push, commit ou uso de browser foi feito por este worker.

## Decisão de base e comportamento

| Função | LIVE recebida | Base efetiva do patch | Resultado |
| --- | --- | --- | --- |
| `processar_turno` | v34, `verify_jwt=true`, SHA-256 `6943cd24afe689cf8fb6f4b39f9a29eeb546cedfd773c38f0f2755c3cc44feba` | LIVE v34 exata | Apenas `PADDLE_ENVIRONMENT`, helper/chamada `has_active_subscription` e resposta `PAYWALL_LOCKED`/402 removidos. Nenhuma rota de recompensa, `boss_battles` ou saque semanal introduzida. |
| `ai-chat` | v19, `verify_jwt=true`, SHA-256 `1fb468f03786d95bb4450399db964ccd7d0fe88cf70cec0e9a09a11ea403dfd2` | Git HEAD, que é idêntico à LIVE v19 em bytes | Gate removido. 402 do provedor vira 503 com mensagem genérica, sem corpo de erro do provedor na resposta. `complete_mission(p_mission_id)` e consulta de missão por usuário preservados. |
| `generate-npc-challenges` | v9, `verify_jwt=false`, SHA-256 `050744ec5f239cb97d6a1d5f4bb23510b14432ea58cadea0935968c958b118ee` | Git HEAD, SHA-256 `4ef41093ddf5c7f240aef9a112df9bb97e4d9b088eb53381db8ad6fc1801fa2a` | Gate removido e ausência de usuário confirmado responde 401. Contrato `weekToken -> challenges`, consulta por `user_id` e fallback por falha da IA preservados. |

O arquivo LIVE v9 de `generate-npc-challenges` tem contrato de **chat** (`messages -> content`) e chama diretamente `add_xp_to_user` e `add_gold_to_user` em `complete_mission`. Copiá-lo para a função corrente quebraria `NpcPage`, que envia `weekToken` e espera `challenges`, além de reabrir uma via direta de progressão. Por decisão explícita do coordenador, a função final usa a base segura do HEAD. A diferença maior entre LIVE v9 e o candidato final é intencional e está isolada no manifesto. A LIVE v9 é evidência histórica arquivada, não fonte de execução deste release.

## Provas locais

- `node supabase/releases/20261026-free-access/verify-release.mjs`: **PASS** nos três hashes LIVE, hashes das bases/finais, igualdade com os arquivos correntes e diff seletivo por base. Em `processar_turno`, o verificador rejeita referências a `add_xp_to_user`, `add_gold_to_user`, históricos de XP/ouro, `boss_battles` e saque semanal; para chat/geração NPC rejeita crédito direto de XP/ouro.
- `node_modules/.bin/vitest.cmd run src/test/freeAccessApi.test.ts src/test/legacyCombatRelease.test.ts`: **20/20 PASS**. Cobre 401 sem Bearer/usuário confirmado; chat autenticado sem RPC de assinatura, 429 e 503 do provedor, conclusão de rotina por RPC; desafios existentes e fallback com escopo do usuário; combate de outro usuário e skill sem posse; release histórico de 20261019 sem modificá-lo.
- O teste de `weekToken='2099-09-09'` confirma que a função aceita semana arbitrária, porém o caminho executado só insere metadados em `npc_weekly_challenges` com `user_id` confirmado; nenhuma RPC de XP/ouro é chamada. Isto **não** constitui uma quota de custo da IA nem torna esses metadados recibos protegidos.
- `node_modules/.bin/eslint.cmd src/test/freeAccessApi.test.ts` e `git diff --check` dos arquivos sob ownership: **PASS**.

## Limites para integração e publicação

`generate-npc-challenges` não tem quota própria por usuário e aceita `weekToken` fornecido pelo cliente; semanas arbitrárias podem forçar novas gerações e consumo de IA. `ai-chat` limita oito etapas por pedido e repassa 429, mas não limita o número de pedidos. Não foi inventado limite de pagamento ou cobrança. As linhas de `npc_weekly_challenges` carregam `xp_reward`/`gold_reward` como metadados; no código examinado desta função não são créditos. A tela mantém a conclusão de desafios NPC desativada, e migrações locais anteriores dão ao usuário escrita nas próprias linhas da tabela. Se essa funcionalidade for reaberta, a recompensa exigirá recibo e validação server-side independentes.

O teste é local com mocks; não comprova versão atualmente publicada, Auth remoto, ACL/RLS aplicados, gateway nem limite externo. Antes de qualquer publicação, comparar novamente versão, SHA-256 do corpo executável e `verify_jwt` de cada função com o manifesto. A metadata de deploy deve permanecer `true`, `true`, `false` respectivamente. O release histórico `supabase/releases/20261019/processar_turno` permaneceu intacto. Qualquer drift LIVE requer nova comparação, especialmente na função de combate.
