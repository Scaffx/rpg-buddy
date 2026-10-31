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
| Coordenação | root | diagnóstico autenticado, preview e validação final | candidato local validado; rollout integrado pendente |

## Diagnóstico autenticado da animação publicada

Conta de teste em https://lifeonrpg.vercel.app/boss, viewport 1280x720: antes de rolar, a cena começa em y=653,5 e termina em1083,5 (altura430). Quase todos os personagens ficam abaixo da área visível; teaser de eventos futuros e resumo ocupam o topo.

Após rolar, observações DOM mostraram status fighting, adventure-still=false, ação enemy-lunge com translateX(-289,526px), e outra amostra cast com translateX(11,516px). Isso confirma animação ativa nesta sessão. Não comprova ausência global nem que layout seja a única causa. Catchup.pending também substitui temporariamente a cena na implementação anterior.

Evidências externas no workspace do chat: work/hordas-20261028/published-scene-baseline.json e aventura-publicada-visivel.png. Nenhum token ou senha foi copiado entre origens.

## Limites de validação

PG17 e preview local não provam PostgREST, dados completos de produção nem horda autenticada publicada. Batalhas já em curso precisam continuar no contrato legado até terminar; o cliente deve aceitar payload antigo e novo. Antes de rollout, validar source/hash/owner/ACL do alvo novamente e separar release de frontend de migration. Nenhuma publicação de hordas foi feita nesta etapa de diagnóstico.

## Validação consolidada do candidato

- Suíte completa após os fixes de sessão e navegação: 83 arquivos e 560 testes passaram, exit 0. Build com variáveis públicas do projeto no processo: exit 0. Nenhuma instalação ou alteração de dependências.
- TypeScript explícito: 44 diagnósticos globais preexistentes, zero nos módulos novos/alterados desta frente. ESLint do core/cena/testes finais: exit 0. CombatLoadout conserva 24 no-explicit-any já existentes em HEAD; os trechos novos não adicionam diagnóstico.
- Revisão fria do core identificou dois P1 e cinco P2; foram corrigidos com 48 testes focados. A revisão da cena identificou um P1 no Clérigo, corrigido em CSS limitado à horda e validado em browser. A revisão final de core e motor identificou corrida de consulta A→B→A, motivo do empate no histórico e documentação econômica divergente; o fix passou 35 testes focados e o wrapper público no clone PG17. A revisão independente do delta exigiu cobrir nova sessão com remount real: esse caso e o refetch stale posterior foram reproduzidos antes do ajuste e passaram depois com 30 testes focados. A coordenação conferiu os deltas finais e repetiu a suíte completa e o refresh autenticado.
- Regressão de cap reproduzida: limite 192 impedia o chefe de 150 HP com dano mínimo 1. Candidato usa acumulador jsonb[] e limite 1200, acima das 1134 ações possíveis em 15 min. PG17 confirmou vitórias defensivas de chefe e horda, pets elegíveis e sustain, snapshots imutáveis, recibos, legado e concorrência. Simulação longa local: p95 61,431 ms, máximo 62,184 ms; catchup p95 5,623 ms, máximo 15,221 ms. Não representa CPU do Supabase Nano.
- Conta de teste autenticada no aplicativo local com servidor atualmente publicado: aventura abriu sem erro, cena visível em y303, cast e HP/MP ativos, pausa apenas visual e navegação Habilidades→Loadout→Aventura. Loadout exibiu recarga automática em segundos; nenhum loadout, rotina, equipamento ou pet foi salvo/alterado para forçar cenário. XP continuou69 e nível1; ouro seguiu o combate atual do servidor.
- Preview usa os JSONs produzidos pelo PG17 com o projetor real; não é uma conta autenticada rodando v4 em produção. Três HPs, ações simultâneas e chefe singular foram inspecionados. Em área iframe de390px, combatentes e recursos ficaram visíveis sem sobreposição aparente; isso não é teste em dispositivo físico.
- Clérigo conferido no navegador com fixtures explicitamente ilustrativas: fonte13%, alvos38%/63%/87% e cura própria13%, conforme slots. Esses fixtures só validam apresentação.
- Evidências externas: test-final.txt, build-final.txt, tsc-final.txt, lint-final.txt, conta-teste-candidato-final.png, conta-teste-loadout-segundos.png, horda-previa-pg17.png e cleric-target-proof.json em work/hordas-20261028 do workspace do chat.
- Fonte viva revalidada somente por SELECT: sync MD5 LF1641aa39afd52bcddae1998819c4b330 e payload19652de586465e476978672744f83fd5, ambos sem CR. Não houve migration, merge ou deploy remoto nesta frente.

## Renovação real na conta de teste

No candidato local, um controle de QA externo ao repositório chamou `supabase.auth.refreshSession()` e confirmou a nova sessão por `getUser(access_token)`, sem expor tokens na interface, logs ou evidências. Antes da renovação, a pausa visual foi marcada. Após a confirmação, a URL continuou `/boss`, a etapa 11 e o marcador `Retomar animação` continuaram presentes, com HP mudando e sem retorno à tela de autenticação. Nível 1 e 69 XP foram preservados. A pausa foi desmarcada ao terminar.

Evidências iniciais: `conta-teste-refresh-preservado.png` e `.txt` no diretório externo `work/hordas-20261028`. O teste real foi repetido após o último fix do hook (hash LF `a86ed8ce74c9718976c3173502b56ad29c95ac708685af5f8f811d23741bc213`), com o mesmo resultado; evidências finais `conta-teste-refresh-final.png` e `.txt`. Esse teste usa Auth e servidor publicado reais, mas a aventura do servidor continua v3: não substitui o teste v4 via PostgREST antes de rollout. O controle QA não integra o build/PR.

## Entrega revisável

PR #77: https://github.com/Scaffx/rpg-buddy/pull/77, em rascunho. Migração candidata SHA-256 LF `858c6600d4ec72fb45a833b1cc6b9cc20013497baa5c48f4782219e75e72a39b`. Não houve alteração remota de banco, merge ou promoção em produção. O push gera prévia automática de frontend na Vercel: o check do commit inicial `59148d5` terminou com sucesso; isso não aplica a migração v4. O próximo gate é testar v4 com sessão autenticada em ambiente integrado e medir seu custo antes de rollout.

O servidor QA em `http://127.0.0.1:5190/qa-hordas` fica intencionalmente aberto para a prévia do usuário, sem HMR, em terminal próprio `term_d96aae17-46dc-45f6-b38f-7f01d9c4401d`. Todos os clusters PG17 desta frente foram desligados; dados e logs preservados.

## Resultado por tarefa supervisionada

Todos os resultados abaixo são locais. Uma revisão concluída com achados não equivale a aprovação do produto. Evidências e limites detalhados permanecem nos relatórios vinculados.

| Task Orca | Resultado | Evidência e pendência |
| --- | --- | --- |
| task_a82fabd27dfc | motor entregue | [motor](20261028-hordas-motor.md): PG17, wrappers, legado, concorrência; cap corrigido na tarefa posterior |
| task_ad152b09b135 | cena entregue | [cena](20261028-hordas-cena.md): testes, build; ajustes posteriores de palco/idade |
| task_c05e60fa1cbd | integração entregue | [integração](20261028-hordas-integracao.md): parser/projetor e fixtures reais; revisão posterior do relógio/cache |
| task_fce3c17fa184 | QA da cena corrigido | [cena](20261028-hordas-cena.md): chefe singular, palco lateral e cache limitado; browser conferido pela coordenação |
| task_5b8685a4e1ac | revisão entregue com 2 P1 e 5 P2 | [revisão core](20261028-hordas-revisao-core.md); tratados por task_c3178aec50a9 |
| task_c3178aec50a9 | sete achados corrigidos | [fix core](20261028-hordas-fix-core.md): 48 testes focados |
| task_478247a0f1cb | cap defensivo e pets corrigidos | [motor](20261028-hordas-motor.md): vitória defensiva, pets, benchmark e teardown PG17 |
| task_8087be394dec | revisão entregue com 1 P1 | [revisão cena](20261028-hordas-revisao-cena.md): alvo do Clérigo; tratado por task_d19ab40b3dbf |
| task_2a57b052712d | loadout em segundos entregue | [loadout](20261028-hordas-loadout.md): seis testes/build e conferência autenticada; baseline de lint preservada |
| task_d19ab40b3dbf | Clérigo corrigido | [fix Clérigo](20261028-hordas-fix-clerico.md): 11 testes; fonte/alvos conferidos no navegador |
| task_8aded148eed8 | revisão entregue com 1 P1 e 2 P2 | [revisão final](20261028-hordas-revisao-final.md): QueryObserver, PG17 e concorrência; tratados por task_4833524deac1 |
| task_4833524deac1 | três achados corrigidos | [fix final](20261028-hordas-fix-final.md): 35 testes focados, preflight/migração e wrapper PG17; clone desligado |
| task_9afd5b3790c1 | revisão do delta entregue com gate de nova sessão | [revisão delta](20261028-hordas-revisao-delta.md): dois P2 fechados; A→B→A protegido; exige teste integrado da nova sessão da mesma conta |
| task_a93cc6a939a1 | nova sessão corrigida | [fix sessão](20261028-hordas-fix-sessao.md): reprodução com AuthProvider + AuthContinuityBoundary reais e endpoints mockados, RPC única e resumo limpo; terminal reutilizado pelo próximo Task |
| task_6a3c2e5ce8de | refetch stale posterior corrigido | [remount stale](20261028-hordas-remount-stale.md): teste falhou antes e passou depois, sem duplicar a RPC inicial; mesmo processo do Task anterior |

Além das evidências por tarefa, a coordenação executou a suíte completa final (560 testes/83 arquivos), build e lint dos arquivos do último fix. O TypeScript explícito continua com os mesmos 44 diagnósticos globais; não é um check global verde. Evidências externas finais: `test-release-candidate.txt`, `build-release-candidate.txt`, `tsc-release-candidate.txt`, `lint-release-candidate.txt`. A renovação autenticada e a prévia não substituem o gate v4 integrado descrito acima.

Os 15 Tasks têm outcome `succeeded`; isso descreve a entrega de cada escopo, inclusive pareceres com achados posteriormente corrigidos. Os 14 recursos de worker foram liberados. O Task de sessão transferiu seu terminal ao follow-up, que foi liberado com confirmação `closed_agent_terminal`; o registro anterior aparece `retained` sem recurso próprio por causa dessa reutilização. A enumeração final de terminais `reclaimable` retornou vazia; não há editor de produto pendente nesta frente. O shell QA mantido para a prévia é um recurso separado da coordenação.
