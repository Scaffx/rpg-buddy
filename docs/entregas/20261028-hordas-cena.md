# Cena de hordas contínuas — 28/10/2026

## Diagnóstico

- Evidência de viewport 1280×720 comunicada pela coordenação: cena começa em y=653,5 e tem 430 px; teaser de eventos e resumo ficam acima. A posição reduz a visibilidade inicial, mas não prova falha global de animação. A coordenação observou movimento após scroll em batalha publicada (`enemy-lunge` e `cast`, sem `adventure-still`). A validação publicada é externa a esta entrega local.
- Antes desta mudança, `AdventureScene` tinha um inimigo, um HP/MP inimigo e uma ação escalar. Eventos próximos de três atores não podiam coexistir visualmente.
- `AutoAdventure` só autorizava o efeito do último evento dentro de 1.350 ms. Reconciliação pendente substitui a cena por um aviso; pausa e preferência por movimento reduzido afetam apenas a apresentação. Nenhuma dessas observações, isolada, identifica a causa única da percepção de pausa.

## Mudança nesta frente

- `BossPage` mostra a aventura antes do teaser mundial. O teaser continua na aba de aventura, depois do bloco de aventura.
- `AdventureSceneFrame.enemies` aceita os inimigos v4 com IDs e recursos por slot; `actions` aceita eventos visíveis simultâneos com `elapsedMs` individual. O caminho singular v3 e o chefe singular continuam com a cena antiga.
- A cena de horda coloca herói e até três criaturas lado a lado sobre um único cenário, sem cartões de ator. HP/MP ficam acima de cada sprite; os inimigos têm pequeno escalonamento vertical. No celular, os quatro atores continuam na mesma linha, com barras compactas e nomes em até duas linhas. Os cinco reinos canônicos preservam o cenário. O estado de morte usa somente HP recebido, sem deduzir dano ou resultado.
- Movimento ambiente tem duração distinta por slot; ataque e cast reagem ao ator confirmado. Efeitos e reações de dano usam IDs e alvos dos eventos. A idade do evento limita a animação, e IDs vistos como pausados, reduzidos ou antigos não recomeçam ao retomar. A idade inicial fica fixa por ID no sprite e no VFX: atualizações de `elapsedMs` do mesmo evento não aceleram a animação que o browser já executa. O VFX dos filhos recebe esse deslocamento negativo, somado aos atrasos locais de partículas; o contêiner sozinho não transmitia `animation-delay`.
- A seleção da cena usa a presença de `enemies`: o chefe v4 singular também recebe texto contínuo e HP/MP do slot confirmado. A cena legada permanece para payload sem lista de inimigos.
- Os IDs indexados pelo projetor (`batalha-índice`) são consumidos por marca d'água por batalha. Há cache limitado das oito batalhas recentes para evitar replay em alternâncias temporárias; IDs não indexados só ficam retidos enquanto aparecem na janela atual. Esse limite depende de o tempo e os índices de eventos avançarem dentro da batalha, como no projetor atual.
- Textos de controle na horda evitam referências a turnos. O legado mantém sua cópia histórica.

## Interface com a integração

O parser/caller fornece `enemies` com HP/MP projetados apenas até `serverTime`; a cena não lê snapshots finais nem atualiza recursos por conta própria. Cada item de `actions` contém os campos de `AdventureSceneAction` mais `elapsedMs`, `actorSlot` e `targetSlot`; IDs estáveis de batalha+índice distinguem eventos próximos. `action` continua sendo o último evento visível para leitura acessível e para o legado. O motor e o parser pertencem a outras frentes; esta entrega não os valida no servidor.

## Verificação local

- `npx vitest run src/test/AdventureHordeScene.test.tsx src/test/AdventureSceneEffects.test.tsx src/test/AdventureDamageReaction.test.tsx src/test/adventureScene.test.tsx src/test/EnemyAnimationCoverage.test.tsx`: exit 0, 39 testes após o QA. Cobrem alvos e atores simultâneos, recursos por criatura, morte por HP confirmado, eventos antigos, pausa, movimento reduzido, IDs de ator/alvo inválidos, chefe v4 singular, cópia legada, idade inicial de 800 ms mantida após atualização para 1.000 ms, novo ID, atrasos de partículas, cache limitado e cinco reinos. O teste da cena também projeta `docs/qa/hordes/horde.json` e `boss.json`, gerados na verificação PG17, para conferir atores e recursos confirmados.
- `npx vitest run src/test/AutoAdventureHorde.test.ts`: exit 0, 3 testes da frente de integração sobre projeção de eventos e recursos; é verificação local do parser, não do servidor.
- `npm run build`: exit 0. Aviso existente de tamanho de bundle; sem erro de build.
- `git diff --check`: exit 0.
- `npx tsc --noEmit -p tsconfig.app.json`: falhas globais fora dos arquivos desta frente, inclusive `BossPage` nas linhas 35 e 39. Não apareceu diagnóstico em `AdventureScene`.
- Browser responsivo em `localhost:5190/qa-hordas` e `?mobile=1`, além do fluxo autenticado, ficam para a coordenação que controla CUA. Testes de componentes e as fixtures PG17 não demonstram validação visual humana nem resposta do servidor em produção.

## Limite de layout

A frente de integração reposicionou o resumo de período ausente para depois do card da cena durante esta entrega; essa alteração está fora da minha ownership. O aviso de catchup pendente continua substituindo a cena enquanto o servidor reconcilia o período. A posição e a legibilidade finais em browser responsivo ainda precisam de verificação pela coordenação.
