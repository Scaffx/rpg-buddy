# Mago em área e companheiro de cena — 29/10/2026

## Escopo confirmado

Manter o estilo desenhado atual. Herói e inimigos continuam com relógios independentes, permitindo movimentos e golpes sobrepostos. Começar pelo mago; preparar o contrato de múltiplos alvos para expansões posteriores do guerreiro e arqueira.

O catálogo já marca `m_fogo_var` (Meteoro), `m_gelo_var` (Nova Gélida) e `m_raio_var` (Tornado) com `effect.aoe=true`. Usar essas variantes apenas quando aprendidas e vinculadas à habilidade base equipada. Bola de Fogo, Dardo Arcano, Lança de Gelo e Singularidade conservam alvo único. Não criar Nevasca ou Chuva de Tempestade sem catálogo/desbloqueio.

Pet confirmado no snapshot da batalha aparece junto ao herói, com movimentos cosméticos discretos. Ele não ataca. O indicador mostra o bônus passivo real; o relógio da animação não concede cura, dano ou outro bônus. A próxima seleção de pet não pode substituir o pet de uma luta já iniciada.

## Inventário e ownership

Checkout isolado `C:/Users/Murillo/orca/workspaces/rpg-buddy/rpg-auth-foco-20261026`, branch `Scaffx/rpg-hordas-continuas-20261028`, base `addddcb7a1d0e7a1d919107dd632a75a01bbc22d`. Inicialmente limpo. PR #77 permanece rascunho aberto, base remota `d787af6499dfed0a0ea75f7431d57294d633a634`; nenhum rollout v4 foi presumido.

Orca runtime `ff1581aa-7bd1-4361-b502-9581bd57d2ae`, Run `run_4c4d2fc95698`. Três launches confirmaram `gpt-6-sol` / `xhigh` efetivos.

| Task | Dispatch | Dono dos arquivos | Estado inicial |
| --- | --- | --- | --- |
| task_55911743ea8a | ctx_ea3bef15efa1 | migration corretiva, SQLs e fixtures PG17 | em execução |
| task_adc7b245a993 | ctx_8ae619449fb7 | contrato/parser/projetor, cena, efeitos do mago, integração e rótulo do loadout | em execução |
| task_3c5b9a84aa8d | ctx_efe2d458aad5 | novo AdventurePetCompanion, CSS próprio e testes | em execução |
| coordenação | root | preview externo, QA de navegador, consolidação e PR | em execução |

Os workers não podem editar Auth, consumir inventário no cliente, instalar dependências, publicar ou fazer SQL remoto. A migration entregue em 28/10 permanece intacta; o motor gera uma corretiva com preflight.

## Contrato coordenado

Campos aditivos nos novos eventos do herói v4: `target_slots: number[]` e `hits: {target_slot, damage, raw_damage, damage_multiplier}[]`. Mesma ordem, slots válidos e únicos. `damage` é a soma dos danos efetivos e `target_slot` conserva o primeiro alvo. AoE pode atingir um, dois ou três sobreviventes no mesmo evento e timestamp. Custo de mana, rotação, recarga e sustain ocorrem uma vez por conjuração. Resistência/vulnerabilidade e HP são calculados por alvo.

Novos eventos inimigos omitem esses campos; cura/buff próprios do herói usam arrays vazios, dano zero e alvo singular nulo. Controle/debuff hostil pode registrar alvo com dano zero. Payloads v3/v4 antigos continuam válidos sem os campos.

`AdventurePetCompanion` recebe apenas `AdventurePetSnapshot | null | undefined`, `still` e `heroDefeated`. Não busca seleção, não acessa storage e não aplica bônus. Tipo desconhecido ou ausência de pet não cria sprite fictício. Pausa visual, movimento reduzido e derrota mantêm apresentação estática.

## Poções e limites da entrega

Regra confirmada pelo usuário: HP estritamente abaixo de 25%, MP estritamente abaixo de 20%, no máximo uma poção de cada tipo por luta. Uso automático opt-in, inicialmente desligado. Sem ressurreição, sem gatilho de MP quando o máximo for zero e sem consumo se não houver estoque suportado. O servidor congela a política por batalha, controla estoque/recibos e informa reserva futura separada do uso já ocorrido. O cliente apenas apresenta o resultado confirmado. Nenhuma alteração permanente de HP/MP, XP, nível ou atributos é autorizada por esse consumo.

Task `task_25f487b1e8ec`, Dispatch `ctx_0c83fcccf23d`, terminal `term_f10373d6-19b7-46ab-b602-536b30bdb283`: worker Sol/xhigh implementa migration corretiva própria, fixtures e testes de estoque/concorrência, hook e painel próprios e integração em AutoAdventure. Não pode editar a migration AoE entregue, contratos anteriores, Auth ou a cena/CSS de outro dono. APIs escolhidas: `get_adventure_auto_potions_state()` e `set_adventure_auto_potions_enabled(boolean)`. Consumo offline precisa ser atômico e idempotente; reserva não pode permitir gastar o mesmo item por outra rota.

O usuário autorizou continuar sem sua presença e deixar decisões realmente dependentes dele para o final. Isso não elimina o teste autenticado exigido antes da publicação em produção.

## Revisões intermediárias

Revisão de frontend `task_b2c8bf3bac6f` / `ctx_7f86c65cf78b`: parser/projetor e fixtures reais PG17 validados, com dois P2 visuais encaminhados. O suposto replay em remount foi retirado após conferir o offset negativo preservado; não adicionar deduplicação global para esse caso.

Correção visual `task_2317a29f193c` / `ctx_0aa4e10fbdcb`: HUD estreito com números completos e âncora estável do pet junto ao sprite, com arco de dragão responsivo. Worker concluído e liberado; geometria real em navegador fica com a coordenação.

Revisão independente SQL `task_4202d56099f0` / `ctx_1b473e7df768`: sem bloqueantes no AoE congelado; simulate, wrapper e probe novo passaram no clone PG17 `mage_chain_final`. Clone encerrado, porta 55934 sem listener, worker liberado. Não confundir a base intermediária `mage_chain2` com o corpo final. Revisor não repetiu a cadeia completa nem a concorrência já executadas pelo builder.

## QA de navegador em andamento

Prévia externa `http://127.0.0.1:5190/qa-hordas`: usa a cena real e respostas públicas PG17 locais. Opções de pet são explicitamente ilustrativas e não concedem companheiros nem recalculam atributos. A opção de congelar efeitos é só do harness externo, para inspecionar frames com offset real sem depender do instante de captura.

HUD medido em viewports 305/320/390 e 1280 px. Com scrollbar, os três primeiros conteúdos têm 290/305/375 px. Cena correspondente 250/265/335 px; no desktop, 1120 px. Os quatro grupos de recursos ficam em colunas separadas, números completos e nomes em uma linha. Em 320 px, grupo do herói tem altura 65,56 px e cada grupo inimigo 31,78 px; não há colisão entre eles. O harness tem 11 px de overflow próprio no viewport 305 devido ao seletor, sem extrapolação da cena.

Desktop: caixa estável do herói `x=154,25`, largura 150; pet em repouso `x=251,25`, largura 48, diferença de 46 px entre centros. Antes eram 132,5 px. Dragão usa ciclo CSS de 15 s. Pausa produz `animation-name:none` no pet e em seu elemento de movimento; despausar não recupera os ataques já consumidos. Teste de DOM do componente cobre identidade estável entre ações.

Confirmados no navegador: Meteoro/Nova em slots 0/1/2, uma redução de MP, marcas individuais; Nova posterior somente nos sobreviventes 1/2, sem novo dano no slot morto; Bola de Fogo sem variante com uma marca e um dano; movimentos sobrepostos do herói e dos três inimigos. Mostruário dos 12 pets inspecionado visualmente. Capturas preservadas em `work/mago-area-20261029` no workspace externo.

Durante o Tornado, detectada regressão de apresentação do golpe final: `frame.status=victory` suprime VFX mesmo que o evento tenha apenas 800 ms. Busca no Bug Tracker sem match relevante; registro [LifeonRPG: vitória corta a animação do golpe final na horda](https://app.notion.com/p/408812ac94d881b29abee5244fb9071a?pvs=204). Task `task_4f913f1d014f` / Dispatch `ctx_69be94edfbcb`, Sol/xhigh, possui somente o gate de status/readout da Scene e testes novos; correção deve preservar janela/offset/pausa e nunca alterar o estado do motor.

Conta de teste autenticada no frontend local contra backend vivo v3: `duher.`, Mago, nível 1 e XP 69/320. Aventura carregou com recursos e eventos; nenhuma missão ou compra foi feita. Companheiro permanece bloqueado até nível 3. Portanto essa conta não comprova pet equipado nem variante AoE liberada; não alterar XP ou desbloqueios para fabricar essa validação.

### Validações posteriores e integração de estoque

O golpe final foi corrigido e conferido no navegador: Tornado em `victory`, evento +800 ms, conserva os três impactos, três inimigos mortos e zero movimentos de ataque inimigo. Em +2000 ms, efeitos e readout desaparecem. Worker `task_4f913f1d014f` concluído e liberado; [relatório](20261029-final-hit-animation.md). O registro do Bug Tracker foi atualizado como resolvido no candidato local, explicitamente ainda não publicado.

Poções HP/MP passaram pelo parser e projector reais na prévia usando snapshots completos `docs/qa/auto-potions/hp.json` e `mp.json`. No evento HP, vida 56/130 e `+30 HP curado`; no evento MP, mana 24/64 e `+20 MP`, sem dano ou cura de HP no readout. O painel separado usa `public-fixture.json` e identifica claramente respostas locais de conta sintética, com alternância entre reserva antes do evento e uso depois do evento, sem callback de escrita.

Renovação real da sessão pela UI local: SDK renovou e `getUser(token)` confirmou; URL `/boss`, uma cena presente e `Retomar animação` com `aria-pressed=true` permaneceram. Em seguida a animação foi retomada. Painel de poções no backend vivo v3 mostra indisponibilidade com switch desabilitado; não trava nem substitui a aventura. Captura `account-session-pause-preserved.png` no diretório externo de evidências. Essa sessão valida compatibilidade do candidato com v3, não execução das novas migrations no serviço autenticado.

Revisão de poções `task_97aa993d9997` / `ctx_ae2ee0ae785b` encontrou, antes do freeze: recibos apagados na poda de timelines, preflight incompleto para permissões efetivas/overloads novos, linha de inventário com quantidade zero após a última poção e oito erros novos de TypeScript no hook/testes. Tudo encaminhado ao builder para correção e repetição dos checks. A checagem da coordenação `tsc -p tsconfig.app.json --noEmit` confirmou 52 erros nesse estado intermediário, contra 44 anteriores; não confundir `tsc --noEmit` da configuração raiz com verificação do aplicativo.

Integração necessária com a dungeon antiga: seu `usePotion` aplicava cura antes do RPC, podendo mostrar benefício mesmo quando a aventura reservasse a última unidade. Busca no Bug Tracker sem match; registro [Dungeon aplica cura antes de confirmar o consumo](https://app.notion.com/p/408812ac94d881548513e40d4c6317c0?pvs=204). Task `task_1beded6f8756` / Dispatch `ctx_a178af41cb55`, Sol/xhigh, possui somente DungeonArena/usePotion/callsites e testes próprios. Proposta aceita: confirmação de `{ok:true,item_id,effect,preserved}` antes de efeito/sucesso, trava única manual/auto/HP/MP e proteção contra identidade/sala/fase/vida/montagem alteradas. Sem refatorar o motor legado inteiro.

Poções foram entregues com SHA-256 LF `dcc1a66a08024a54641cb676982e3a2316a5b8fcd59ca1b1150236b06ad7786c`; builder concluído e liberado, clone 55933 parado. Revisão independente concluída e liberada, clone próprio 55936 parado. O revisor aplicou AoE→poções, repetiu sete SQLs positivos, histórico, snapshots imutáveis, drift de overload/ACL herdada e disputa com a definição **real** de `consume_inventory_item` capturada por SELECT somente leitura (MD5 LF `758fca4a260de7aea24758c03b9ffafd`). As duas ordens de concorrência tiveram A/B/asserção 0/0/0. O surrogate DELETE do builder não foi contado como prova desse RPC real. Fontes/testes/limites detalhados no [parecer](20261029-auto-potions-review.md).

Decisão de ACL: manter a permissão efetiva do papel privilegiado `service_role` nos dois novos RPCs públicos, resultante do default ACL público vivo. Isso foi reproduzido em clone próprio: `anon` sem EXECUTE, `authenticated` e `service_role` com EXECUTE; ambos os corpos exigem `auth.uid()` e escopo próprio. Não declarar que só authenticated recebe EXECUTE no alvo. Os novos objetos privados não têm default global/app_private capturado. Não houve alteração remota de permissões, nem exposição demonstrada a usuário comum. O postflight no ambiente integrado continua obrigatório.

A correção inicial da DungeonArena passou em 10 testes de montagem. A revisão da coordenação encontrou um delta restante: o SDK instalado transforma falhas de transporte em `{error, status:0}` e não necessariamente rejeita a Promise, mas o código tratava todo `error` como rejeição SQL confirmada. Task `task_f34fb708b506` / Dispatch `ctx_702c46c76721`, Sol/xhigh, possui somente esse classificador/catch, testes e acréscimo ao relatório da dungeon. Deve reconhecer transporte/resultado desconhecido como incerto, desligar o automático sem cura e impedir segundo RPC automático; rejeição SQL comprovada mantém retry manual.

## Fechamento local

O delta da dungeon foi concluído: somente HTTP 400 + SQLSTATE P0001 é uma rejeição comprovada do RPC atual. Transporte retornado pelo SDK, gateway e payload inválido mantêm resultado incerto, sem cura, com automático desligado e estoque atualizado. Os 13 testes de montagem da arena passaram; o registro no Bug Tracker foi marcado resolvido **no candidato**, sem afirmar publicação. A coordenação revisou o classificador e a implementação instalada do SDK.

Validação integrada da coordenação após congelar todo o produto:

| Check | Resultado |
| --- | --- |
| `npm test -- --reporter=dot` | exit 0; **620 testes / 90 arquivos** |
| `npm run build` com configuração pública VITE do projeto | exit 0; avisos anteriores de tamanho de chunk/Browserslist |
| `tsc --noEmit -p tsconfig.app.json --pretty false` | exit 2; **44 erros anteriores**, mesmas identidades arquivo/linha/código do baseline, zero novos |
| ESLint de todos os TS/TSX alterados e novos | exit 1 somente por dívida anterior: CombatLoadout 24 erros; DungeonArena 3 erros/4 avisos; demais arquivos sem diagnósticos |
| ESLint do HEAD inicial pelos mesmos caminhos | CombatLoadout 24 erros; DungeonArena 8 erros/4 avisos; o rename de usePotion removeu cinco falsos positivos existentes |
| `git diff --check` | exit 0 |
| Conta de teste, fonte final de aventura | sessão renovada e confirmada, `/boss` e pausa preservados, depois pausa retomada; indisponibilidade dos novos RPCs tratada sem travar o v3 |

Logs e capturas ficam no diretório externo `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/mago-area-20261029`. O fingerprint final de produto/testes/migrations está preservado em `freeze-final.json` nesse diretório. Nenhum token de sessão real foi extraído para esta entrega.

### Contabilidade Orca

Todos os launches abaixo confirmaram Sol/xhigh efetivos. Cada Task teve `worker_done` com sucesso e terminal liberado; a consulta final de reclaimable retornou vazio, com 11 releases. Resultados referem-se aos escopos locais; os gates de serviço integrado abaixo não foram eliminados.

| Task / Dispatch | Resultado e evidência |
| --- | --- |
| `task_55911743ea8a` / `ctx_ea3bef15efa1` | motor AoE entregue; cadeia, wrappers, drift, concorrência e snapshots PG17; [relatório](20261029-mago-area-motor.md) |
| `task_adc7b245a993` / `ctx_8ae619449fb7` | contrato, parser, projector, cenas e loadout integrados; testes focados e build; [relatório](20261029-mago-area-cena.md) |
| `task_3c5b9a84aa8d` / `ctx_efe2d458aad5` | doze pets cosméticos e gesto CSS; teste de snapshot/pausa; [relatório](20261029-pet-companion.md) |
| `task_b2c8bf3bac6f` / `ctx_7f86c65cf78b` | revisão frontend/fixtures e dois P2 visuais encaminhados; [parecer](20261029-mago-area-revisao-frontend.md) |
| `task_4202d56099f0` / `ctx_1b473e7df768` | revisão independente AoE, três provas PG17 e teardown; [parecer](20261029-mago-area-revisao-motor.md) |
| `task_2317a29f193c` / `ctx_0aa4e10fbdcb` | HUD estreito e âncora/volta do pet corrigidos; 14 testes e geometria conferida pela coordenação; [relatório](20261029-mago-area-fix-visual.md) |
| `task_25f487b1e8ec` / `ctx_0c83fcccf23d` | poções/estoque/recibos/UI entregues com cadeia, negativos, rollback e concorrência; [relatório](20261029-auto-potions.md) |
| `task_4f913f1d014f` / `ctx_69be94edfbcb` | golpe final e readout MP corrigidos, 52 testes focados e QA de navegador; [relatório](20261029-final-hit-animation.md) |
| `task_97aa993d9997` / `ctx_ae2ee0ae785b` | revisão independente do inventário, RPC vivo transplantado só no clone, duas ordens de corrida e defaults de ACL; [parecer](20261029-auto-potions-review.md) |
| `task_1beded6f8756` / `ctx_a178af41cb55` | dungeon exige recibo antes da cura, contexto/espera protegidos, dez testes iniciais; [relatório](20261029-dungeon-potion-confirmation.md) |
| `task_f34fb708b506` / `ctx_702c46c76721` | classificação de transporte corrigida; 13 testes finais sem retry automático; [mesmo relatório](20261029-dungeon-potion-confirmation.md) |

O checkout primário segue em `1928e729e44cd207cc0c23360342081049813459`, com os mesmos 24 registros de WIP, sem edição por esta frente. Clusters PostgreSQL foram encerrados com dados/logs preservados; nenhum listener permaneceu entre 55930 e 55940. A aba temporária da conta foi fechada depois de retomar a animação. A prévia externa foi marcada como entrega, sem viewport temporário, com Nova Gélida e dragão ilustrativo em reprodução. O servidor QA `term_d96aae17-46dc-45f6-b38f-7f01d9c4401d`, porta 5190, fica intencionalmente disponível para a revisão visual do usuário.

### Gates restantes antes de produção

PR #77 permanece rascunho. O alvo publicado está em v3, sem os novos RPCs; nenhum SQL remoto de escrita, merge ou promoção de produção ocorreu nesta etapa. A publicação automática de preview frontend não aplica as migrations.

É necessário aplicar a cadeia imutável em ambiente integrado com preflight/postflight aprovado, testar GoTrue/PostgREST e o combate v4/AoE/poções com sessão autenticada e medir custo no Supabase Nano antes do rollout. A conta atual, nível 1, não autoriza provar pet equipado ou variante de classe aprendida; não alterar XP, rotinas ou desbloqueios para fabricar a prova. A integração de dungeon cooperativa também precisa ser exercitada com as condições reais de acesso. Essas pendências ficam registradas para o próximo gate, sem exigir que o usuário acompanhe o trabalho local durante a noite.

Testes PostgreSQL locais, fixtures e preview não comprovam PostgREST nem v4 autenticado publicado. Conservar o gate de teste integrado antes de produção. Nenhum merge, SQL remoto ou promoção em produção integra esta etapa.
