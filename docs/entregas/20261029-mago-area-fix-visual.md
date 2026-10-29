# Correção visual da cena de horda e do pet

**Base recebida:** `Scaffx/rpg-hordas-continuas-20261028`, HEAD `addddcb7a1d0e7a1d919107dd632a75a01bbc22d`, PR 77 draft, com WIP de outras frentes preservado. Escopo deste worker: `AdventureScene.tsx` somente no markup de recurso/âncora, `adventureScene.css`, `adventurePetCompanion.css` e uma asserção focada em `AdventureMageArea.test.tsx`. Nenhum commit, push, deploy, navegador, SQL, Auth, contrato, SVG, motor ou dependência foi alterado aqui.

## P2: HP/MP dentro da cena

- **Antes:** captura fornecida `work/mago-area-20261029/nova-pet-dog.png`, viewport 305 px / cena 265 px: o nome e `255/358 HP` do herói quebravam em várias linhas, enquanto MP e o HP do primeiro inimigo se misturavam visualmente. CSS anterior usava nome com até duas linhas e valor sem limite de largura dentro das quatro colunas.
- **Depois no código:** cada cartão da horda usa uma coluna própria para nome em uma linha com reticências, valor completo e barra. Valor numérico e unidade são elementos distintos, permitindo que `HP`/`MP` passem à linha seguinte só se a largura realmente faltar, sem cortar ou compactar os números. O nome completo continua em `title`; o `role="meter"` mantém `aria-label`, mínimo, máximo e valor completos. O herói continua com HP e MP, e cada inimigo continua com MP quando `max_mp > 0`.
- **Geometria a confirmar no navegador:** 305, 320, 390 e 1280 px, com atenção a valores de três ou mais dígitos e a inimigos com mana. jsdom não mede quebra de linha nem colisão.

## P2: companhia junto ao sprite

- **Antes:** o pet da horda era filho direto da coluna do ator, com `left:calc(100% - 22px)`. Na cena desktop de 1120 px, a medição comunicada pelo coordenador foi herói `x=146,75..296,75`, pet `x=330,27..378,27`, diferença de 132,5 px entre centros. Dragão/wyrm se deslocavam no máximo 8 px em torno do próprio pet.
- **Depois no código:** `adventure-horde-hero-visual` tem a mesma caixa de dimensão do sprite e é estável entre ações. A track com chave e o pet são irmãos nessa caixa; o pet permanece ancorado a `50% + clamp(0px, 2vw, 22px)` do sprite. Dragão/wyrm ficam no pé até 89% do ciclo de 15 s, percorrem um arco responsivo ao redor da silhueta (`x` até 36–100 px, `y` até 30–75 px) e retornam ao mesmo ponto no fim. O gesto de latido/cauda do cachorro segue em 15 s. Pausa, derrota e preferência por movimento reduzido interrompem as animações; o DOM do pet continua fora da track com chave. A insígnia de bônus acompanha o pet durante a volta, pois a transformação agora está no elemento raiz do pet.
- **Geometria a confirmar no navegador:** distância real ao herói em 305/390/1280 px, contenção da volta na borda de 305 px, clareza dos cartões durante a volta e retorno ao pé. A posição final e a trajetória não foram medidas por este worker no browser.

## Verificações locais

- `vitest run src/test/AdventurePetCompanion.test.tsx src/test/AdventureMageArea.test.tsx`: 2 arquivos, 14 testes passaram. O teste de cena confere números de MP, siglas de recurso, âncora irmã da track e persistência do nó do pet entre ações.
- `eslint src/components/adventure/AdventureScene.tsx src/test/AdventureMageArea.test.tsx`: passou sem saída.
- `git diff --check -- src/components/adventure/AdventureScene.tsx src/components/adventure/adventureScene.css`: código 0, sem erro de whitespace; Git informou somente conversão LF/CRLF futura. Os arquivos novos continuam não rastreados no WIP recebido.

SHA-256 dos arquivos finais após normalizar CRLF/CR para LF e codificar em UTF-8:

| Arquivo | SHA-256 LF |
| --- | --- |
| `src/components/adventure/AdventureScene.tsx` | `ce41766ab4d3aed5140a3e4d3cf44a704a01809a43d7cdb4cebc94913056980c` |
| `src/components/adventure/adventureScene.css` | `c1579faeaca3bb554ec31d0ee7a82cabe8e7fb261385719503e82142c02f61df` |
| `src/components/adventure/adventurePetCompanion.css` | `c7002c313ec5b7827e57e4205a6df9c0176511cdd45667b7e538e8be89a1f2f2` |
| `src/test/AdventureMageArea.test.tsx` | `94ffd0f119cec924175d1e21a8d541a794833437b9d56dcbba53e42b9abc8e2c` |

**Limite:** testes de DOM e inspeção de CSS não comprovam geometria, animação, Auth, PostgREST, aplicação remota ou produção. O coordenador fará a verificação visual real e a suíte/build de integração.
