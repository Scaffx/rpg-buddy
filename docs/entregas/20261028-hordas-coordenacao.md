# Hordas contínuas — coordenação de 28/10/2026

## Escopo confirmado pelo usuário

- Combate automático em tempo contínuo, sem alternância de turnos. Ataques/conjurações usam relógios e recargas próprios.
- Um herói enfrenta três inimigos reais simultâneos nos encontros normais. HP e alvo por criatura; não apenas três desenhos para um HP.
- Um chefe a cada dez etapas da aventura; reinos normal, deserto, água, gelo e fogo em ciclo.
- XP, nível e atributos permanentes continuam exclusivamente nas rotinas. Ouro/itens continuam confirmados pelo servidor, por encontro, sem triplicar recompensas por exibir três criaturas.
- Continuar offline com resumo. Preservar recuo, holding, pets, equipamentos, resistências e recebimentos idempotentes.
- NPCs em história e PvP são extensões futuras; esta entrega não os implementa.

## Inventário e divisão no Orca

Base: d787af6499dfed0a0ea75f7431d57294d633a634 (origin/main), checkout isolado rpg-auth-foco-20261026, branch Scaffx/rpg-hordas-continuas-20261028. Checkout estava limpo antes desta frente; os 24 arquivos WIP do diretório primário não são desta tarefa.

Run run_9cf646edf4bc; os três launches confirmaram gpt-6-sol e xhigh efetivos.

| Frente | Dispatch | Responsabilidade | Evidência final |
| --- | --- | --- | --- |
| Motor | ctx_8c70b3ab3e42 + ctx_a8bd22cd3f18 | contrato, migration, cap defensivo e pets em PG17 real | concluído localmente |
| Cena | ctx_54fd1826405f + ctx_2a137c1393e5 + ctx_fb0877fcd45b | palco, VFX/dano, idade, cache limitado e alvo do Clérigo | concluído localmente |
| Integração | ctx_14af89acc0e9 + ctx_d69e5f23823d | parser, relógio monotônico, catchup e isolamento por conta | concluído localmente |
| Coordenação | root | diagnóstico autenticado, preview e validação final | revisão final em curso |

## Diagnóstico autenticado da animação publicada

Conta de teste em https://lifeonrpg.vercel.app/boss, viewport 1280x720: antes de rolar, a cena começa em y=653,5 e termina em1083,5 (altura430). Quase todos os personagens ficam abaixo da área visível; teaser de eventos futuros e resumo ocupam o topo.

Após rolar, observações DOM mostraram status fighting, adventure-still=false, ação enemy-lunge com translateX(-289,526px), e outra amostra cast com translateX(11,516px). Isso confirma animação ativa nesta sessão. Não comprova ausência global nem que layout seja a única causa. Catchup.pending também substitui temporariamente a cena na implementação anterior.

Evidências externas no workspace do chat: work/hordas-20261028/published-scene-baseline.json e aventura-publicada-visivel.png. Nenhum token ou senha foi copiado entre origens.

## Limites de validação

PG17 e preview local não provam PostgREST, dados completos de produção nem horda autenticada publicada. Batalhas já em curso precisam continuar no contrato legado até terminar; o cliente deve aceitar payload antigo e novo. Antes de rollout, validar source/hash/owner/ACL do alvo novamente e separar release de frontend de migration. Nenhuma publicação de hordas foi feita nesta etapa de diagnóstico.

## Validação consolidada do candidato

- Suíte completa: 81 arquivos e 555 testes passaram, exit 0. Build com variáveis públicas do projeto no processo: exit 0. Nenhuma instalação ou alteração de dependências.
- TypeScript explícito: 44 diagnósticos globais preexistentes, zero nos módulos novos/alterados desta frente. ESLint do core/cena/testes finais: exit 0. CombatLoadout conserva 24 no-explicit-any já existentes em HEAD; os trechos novos não adicionam diagnóstico.
- Revisão fria do core identificou dois P1 e cinco P2; foram corrigidos com 48 testes focados. A revisão da cena identificou um P1 no Clérigo, corrigido em CSS limitado à horda e validado em browser. O parecer final independente de core e motor está em execução.
- Regressão de cap reproduzida: limite192 impedia o chefe150HP com dano mínimo1. Candidato usa acumulador jsonb[] e limite1200, acima das1134ações possíveis em15min. PG17 confirmou vitórias defensivas de chefe e horda, pets elegíveis e sustain, snapshots imutáveis, recibos, legado e concorrência. Simulação longa local: p95 61,431ms, máximo62,184ms; catchup p95 5,623ms, máximo15,221ms. Não representa CPU do Supabase Nano.
- Conta de teste autenticada no aplicativo local com servidor atualmente publicado: aventura abriu sem erro, cena visível em y303, cast e HP/MP ativos, pausa apenas visual e navegação Habilidades→Loadout→Aventura. Loadout exibiu recarga automática em segundos; nenhum loadout, rotina, equipamento ou pet foi salvo/alterado para forçar cenário. XP continuou69 e nível1; ouro seguiu o combate atual do servidor.
- Preview usa os JSONs produzidos pelo PG17 com o projetor real; não é uma conta autenticada rodando v4 em produção. Três HPs, ações simultâneas e chefe singular foram inspecionados. Em área iframe de390px, combatentes e recursos ficaram visíveis sem sobreposição aparente; isso não é teste em dispositivo físico.
- Clérigo conferido no navegador com fixtures explicitamente ilustrativas: fonte13%, alvos38%/63%/87% e cura própria13%, conforme slots. Esses fixtures só validam apresentação.
- Evidências externas: test-final.txt, build-final.txt, tsc-final.txt, lint-final.txt, conta-teste-candidato-final.png, conta-teste-loadout-segundos.png, horda-previa-pg17.png e cleric-target-proof.json em work/hordas-20261028 do workspace do chat.
- Fonte viva revalidada somente por SELECT: sync MD5 LF1641aa39afd52bcddae1998819c4b330 e payload19652de586465e476978672744f83fd5, ambos sem CR. Não houve migration, merge ou deploy remoto nesta frente.
