# Revisão independente do frontend: mago AoE e pet

**Escopo congelado:** `Scaffx/rpg-hordas-continuas-20261028`, HEAD `addddcb7a1d0e7a1d919107dd632a75a01bbc22d`, PR 77 draft. Os 12 arquivos do manifesto `freeze-frontend.json` conferiram `SHA-256` após normalização LF antes e depois da revisão (12/12). Esta revisão não alterou produto, SQL, Auth, dependências ou arquivos de outros donos.

## Achados acionáveis

### P2 — HUD perde legibilidade na largura observada de 305 px

- **Arquivo/linha:** `src/components/adventure/adventureScene.css:116-125`, `:180-186`; barras renderizadas em `src/components/adventure/AdventureScene.tsx:279-308`.
- **Cenário/evidência:** na imagem `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/mago-area-20261029/nova-pet-dog.png` fornecida pelo coordenador, a cena estreita mantém herói e três inimigos visíveis, mas o cartão de HP do herói quebra nome e valor em várias linhas; o cartão de MP e o HP do primeiro inimigo ficam sobrepostos na mesma faixa visual. O cartão do primeiro inimigo e os valores ficam difíceis de distinguir.
- **Limite:** imagem de demonstração com pet ilustrativo, não sessão autenticada nem prova de `battle.pet` real. Não medi caixas DOM; o coordenador está conferindo larguras 390/1280. Revalidar a legibilidade nesses tamanhos e em 305 px antes de escolher o ajuste CSS.

### P2 — Posição e gesto do pet divergem da apresentação pedida

- **Arquivo/linha:** `src/components/adventure/adventurePetCompanion.css:3-12`, `:44-50`, `:102-108`; posição no ramo horda em `src/components/adventure/AdventureScene.tsx:284-290`.
- **Cenário/evidência:** o coordenador mediu no navegador desktop (viewport 1265 px, cena 1120 px) SVG do herói em `x=146,75..296,75` e pet em `x=330,27..378,27`: o centro do pet fica **132,5 px à direita** do centro do herói. O `left:calc(100% - 22px)` usa a largura da coluna do ator; assim a distância ao sprite cresce no desktop. O gesto de dragão/wyrm de 15 s usa `translate(8px,-2px)` no máximo em torno do próprio pet, em vez de dar a volta ao redor do herói conforme o requisito transmitido pelo coordenador.
- **Limite/encaminhamento:** a geometria é medição do coordenador, conferida aqui contra o CSS, não medição independente deste worker. Posicionar a âncora em relação ao sprite/centro visual do herói e dar ao gesto do dragão uma trajetória responsiva contida na cena, mantendo o pai estável e a animação puramente cosmética.

## Evidência positiva e validade dos testes

- O probe novo `src/test/MageAreaReviewProbe.test.tsx` passa os oito JSON PG17 (`meteor`, `nova`, `tornado`, `single`, `two-survivors`, `boss`, `horde`, `control`) por `parseAdventureSnapshot` e `projectAdventureSceneFrame`, conferindo HP/MP e estado por evento, slots ordenados, `hits` e soma do dano. Renderiza os eventos reais de Meteoro (um cast, três impactos, danos 34/6/6), Nova com dois sobreviventes (slots 1/2) e controle hostil de dano zero sem número de dano.
- `meteor`, `two-survivors` e `horde` têm o mesmo ID de encontro e representam fases do mesmo combate; não os contei como três provas independentes. `boss` usa um slot; `single` mantém um alvo; `tornado` tem três `hits`. O parser aceita suporte com arrays vazios e payload v4 anterior sem `hits` nos testes existentes.
- `src/test/AdventureMageArea.test.tsx:88-101` muda o inimigo do slot 1 para **5/15 HP** e altera `enemies_hp` antes de afirmar quatro ações simultâneas. Logo, esse inimigo está vivo no mock; o teste é coerente para renderização sintética, mas não comprova que o motor PG17 emitiu quatro ações naquela sequência. O fixture real de Meteoro contém dois ataques inimigos antes do cast.
- O pet cosmético vem de `frame.pet`, projetado de `battle.pet` (`src/lib/adventureSceneProjector.ts:68`), fica fora das tracks com chave de ação (`AdventureScene.tsx:284-290`) e não executa ataque nem bônus local. `null` e tipos desconhecidos não desenham pet. O loadout salva IDs base e apenas mostra os nomes de variantes aprendidas; os três rótulos locais coincidem com o catálogo SQL atual (`20260606005000_mage_skill_tree.sql:77,85,93`), e o SQL resolve a variante a partir do nó aprendido.
- Ao remontar o fixture `meteor` com o evento de 600 ms ainda ativo, o DOM recria as três camadas, mas o estilo `--horde-elapsed:-600ms` é preservado antes e depois (`AdventureScene.tsx:319-331`, teste no probe). `adventureScene.css:156` usa esse valor como atraso negativo, portanto a recriação dos nós **não prova** reinício visual do efeito. Não recomendo deduplicação global com base apenas na contagem DOM; isso poderia suprimir efeitos simultâneos legítimos. A continuidade visual precisa de observação no navegador se ainda for dúvida.
- Testes focados finais: **4 arquivos, 27 testes passaram** (`MageAreaReviewProbe`, `AdventureMageArea`, `AdventurePetCompanion`, `CombatLoadoutMageArea`). Não rodei suíte completa nem build, que são responsabilidade do coordenador.

## Limites

Os JSON são saídas da fixture PG17 local. O probe em jsdom confirma parser, projector e estrutura DOM; não comprova PostgREST, Auth, browser real, geometria CSS, animação visual sincronizada, aplicação remota ou produção. Não avaliei SQL além do contrato necessário para distinguir defeito de consumidor de shape ainda em correção pelo dono do motor.
