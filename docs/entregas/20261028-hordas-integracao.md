# Integração frontend da aventura de hordas — 28/10/2026

Base observada: `d787af6499dfed0a0ea75f7431d57294d633a634`, branch `Scaffx/rpg-hordas-continuas-20261028`. Entrega local sem commit, push ou deploy.

## Diagnóstico do consumer

- `AutoAdventure` usava um único inimigo, último evento da timeline e um HP/MP inimigo. Eventos próximos de três atores não podiam aparecer juntos.
- `catchup.pending` substituía toda a cena por um aviso, inclusive quando uma batalha atual ainda podia ser mostrada. O resumo ficava antes do card da cena. `BossPage` também mantinha um teaser acima da aventura; a frente da cena moveu esse teaser.
- A coordenação observou animações legadas após scroll no browser publicado. A posição abaixo da dobra e a substituição durante recuperação ajudam a explicar a percepção de ausência, sem provar falha do servidor.

## Contrato e projeção

- `src/lib/autoAdventurePayload.ts` preserva campos v4 `enemies`, `actor_slot`, `target_slot`, `enemies_hp` e `enemies_mp` com validação de slots, IDs, comprimento dos vetores e limites de HP/MP. Payloads 1v1 v3 continuam aceitos.
- `src/lib/adventureSceneProjector.ts` exporta `projectAdventureSceneFrame(battle, serverTime, status)` para o consumer, testes e preview da coordenação. Ordena eventos por tempo e posição original, usa apenas `at <= serverTime` e mantém IDs estáveis `battle.id + índice`. Cada inimigo começa com `max_hp/max_mp`; HP/MP do snapshot final entram apenas quando constam de um evento confirmado. `actions` reúne eventos confirmados dos últimos 1350 ms; `action` conserva o último evento visível para leitura e legado.
- `AutoAdventure` usa o projetor e o relógio recebido do servidor. Cena de horda recebe alvos por slot e ações simultâneas, e o texto lista os inimigos recebidos. Pausa visual e preferência de movimento reduzido ficam na cena; não alteram tempo ou resultado. Habilidades, mana, cooldown e pet vêm do payload autoritativo; a integração não calcula golpes, XP, ouro ou loot.
- Durante catchup, uma batalha atual com `started_at <= serverTime < ends_at` mantém a cena. Batalha histórica expirada mostra o aviso de sincronização; o resumo fica abaixo do card. Uma derrota v4 antiga não é reproduzida ao fim de uma recuperação longa.
- O hook expõe `accountId` e associa resposta do avanço à conta que iniciou a mutação. Uma resposta tardia após troca de conta não popula o cache da conta nova. Estado visual de derrota, transição, resumo e avanço é limpo na troca.

## Invariantes preservados

- Chefes nas etapas 10/20/30, recuo e permanência (`holding`), avanço pela batalha corrente e XP exclusivo de rotina permanecem server authoritative. Não há controle de turnos, gasto de recursos nem prêmio simulado no cliente.
- O caminho singular v3 e o chefe singular usam a cena 1v1 compatível. Eventos futuros não revelam HP, MP, morte ou ação antes do horário recebido.

## Verificação local

- `npx vitest run` nos arquivos `AutoAdventureHorde`, `AutoAdventureHordeComponent`, `AutoAdventureAccountSwitch` e quatro suítes existentes de AutoAdventure: 36 testes focados, exit 0. Cobrem três HPs/MPs e IDs, alvo, morte, ações concorrentes, evento atrasado/antigo, futuro oculto, pausa, catchup, conta, avanço e payload antigo.
- `npx vitest run src/test/AutoAdventureHordeFixture.test.ts`: 2 testes, exit 0. Os JSONs `docs/qa/hordes/horde.json` e `boss.json`, exportados pela frente de motor de PG17, atravessaram o parser e projetor reais: três inimigos, alvo de habilidade com mana e chefe singular. A primeira tentativa falhou por resolução do caminho do fixture no runner; o teste foi corrigido e repetido com sucesso.
- `npx eslint` nos arquivos tocados desta frente: exit 0.
- `npm run build`: exit 0. Vite avisou sobre chunk grande e base Browserslist antiga, sem erro.
- `npx tsc --noEmit -p tsconfig.app.json`: exit 1 por diagnósticos globais preexistentes; filtro dos arquivos desta frente não retornou diagnóstico. `git diff --check`: exit 0.

## Limites e integração pendente

- Os testes de componente usam payload simulado; o teste de fixture lê JSONs exportados da execução PG17 local da outra frente. A coordenação fará preview/browser e revisão do fluxo completo. Nenhuma dessas evidências demonstra compatibilidade em produção.
- No SQL em construção, IDs `stage-slot` se repetem entre tentativas e inimigos têm `max_mp=0/skill=NULL`. Foi pedido ao dono do motor confirmar a identidade por batalha e a cobertura de casts inimigos. O cliente não inventa mana ou habilidades ausentes.
