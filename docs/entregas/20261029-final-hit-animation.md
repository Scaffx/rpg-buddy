# Golpe final na cena da horda — 2026-10-29

## Escopo e causa

- Checkout `Scaffx/rpg-hordas-continuas-20261028`, base `addddcb7a1d0e7a1d919107dd632a75a01bbc22d`. O checkout já tinha WIP de outras frentes; nenhum arquivo alheio foi revertido.
- Reprodução: `docs/qa/mage-area/tornado.json`, motor `v4_horde`. O terceiro evento é o cast `Tornado` (`m_raio_var`), confirmado após 1,5 s, com 102 de dano e HP `[0,0,0]`. Aos 800 ms seguintes, o projector ainda fornece o evento e sua idade real, mas `AdventureScene.tsx` descartava `action` e `visualActions` quando `status` mudava de `fighting` para `victory`.
- A mesma condição cortava o último golpe confirmado em `defeated` e `draw`. Não havia falha no relógio, HP ou recompensa do motor.

## Correção

- `src/components/adventure/AdventureScene.tsx:351-368`: estados terminais aceitam apenas o último evento confirmado, com idade finita entre 0 e 1199 ms. Os filtros existentes de ator, alvo, pausa, movimento reduzido e consumo continuam ativos. `transition` continua sem ação. O readout terminal segue a mesma janela; após 1200 ms some por conta própria.
- `src/components/adventure/AdventureScene.tsx:229-231,287,314`: o offset negativo da animação permanece ligado à idade do evento. A track do herói derrotado e a dos inimigos com HP zero ficam estáticas; o impacto e o dano do golpe final ainda podem aparecer como filhos. O pet não foi alterado.
- `src/lib/autoAdventurePayload.ts:49,189-195,305,355-356`, `src/lib/adventureSceneProjector.ts:31` e `src/components/adventure/AdventureScene.tsx:30,109-117`: ampliação coordenada de ownership para `mp_restored` opcional. O parser exige inteiro positivo seguro, limitado pelo MP máximo e pelo MP do herói após o evento quando esses valores existem. O projector propaga `mpRestored`; o readout mostra `+X MP` sem `−0 MP`, dano zero, cura de HP ou rótulo `Cura` para poção MP. Eventos antigos sem o campo continuam válidos. Nenhum contrato SQL foi modificado.

## Evidência e saídas

- `src/test/AdventureFinalHit.test.tsx`: 15 casos com fixture Tornado real para vitória em +800 ms, offset `-800ms`, três impactos nos alvos mortos, ausência de ataques antigos no terminal, expiração em +1201 ms, derrota/empate pelo último evento inimigo, evento futuro não projetado, pausa/movimento reduzido sem replay, e parse → projector → readout de poção MP com valores inválidos rejeitados.
- `npx vitest run src/test/AdventureFinalHit.test.tsx src/test/AdventureHordeScene.test.tsx src/test/AdventureMageArea.test.tsx src/test/AdventureDamageReaction.test.tsx src/test/AutoAdventurePayload.test.ts`: exit 0, **5 arquivos / 52 testes aprovados**. A suíte existente `AdventureHordeScene` cobre consumo limitado do cache em batalhas longas.
- `npx eslint src/components/adventure/AdventureScene.tsx src/lib/adventureSceneProjector.ts src/lib/autoAdventurePayload.ts src/test/AdventureFinalHit.test.tsx`: exit 0.
- `npx tsc --noEmit --pretty false`: exit 0. `git diff --check`: exit 0; apenas avisos de conversão LF/CRLF do Git no checkout.

Nota da coordenação: esse comando TypeScript usa o tsconfig raiz com referências e não comprova a verificação do aplicativo. A verificação válida usa `-p tsconfig.app.json`, comparada à dívida anterior de 44 erros fora dos arquivos tocados; resultado integrado será registrado no relatório de coordenação. Não interpretar o exit 0 acima como aplicativo inteiro sem erros de tipo.

## Identidade dos arquivos verificados (SHA-256)

| Arquivo | SHA-256 |
| --- | --- |
| `src/components/adventure/AdventureScene.tsx` | `6DBF6996D4DD49EC9EF931CD75ACED12FBAA323F118CE0EFD2B36B5668FFA6C3` |
| `src/lib/adventureSceneProjector.ts` | `A0B8CE14F0C5119D3D03AC3C7DFD10EECDDDF05A7A9CB3602D4458AFBB15EF3C` |
| `src/lib/autoAdventurePayload.ts` | `88D2C42182A06D298D0BF2C940D60B7C3359B74F743A10BFA8547EB4A06FB87B` |
| `src/test/AdventureFinalHit.test.tsx` | `C86918B0B0359324CF7FF21F4E3541A4894F124847D3F21AA02D87DEDA502A00` |
| `docs/qa/mage-area/tornado.json` | `93C8EA93347B7781A87F1633929B1B13643AF93D99D0875BA5DB3A2E42B0E996` |

## Limites

- Os testes rodam em jsdom: verificam evento confirmado, DOM, atributos e offset CSS, mas não medem a animação renderizada em navegador, relógio de parede, acessibilidade assistiva ou API autenticada. O coordenador mantém a QA de navegador e o registro no Bug Tracker.
- A fixture Tornado registra `battle.status=fighting`; o teste projeta o mesmo evento confirmado com `status=victory` para reproduzir o instante de fechamento. A poção MP do teste é um evento sintético conforme o contrato SQL em WIP; não prova execução PG17/live.
- Sem commit, push, merge, deploy ou alteração remota por esta frente.
