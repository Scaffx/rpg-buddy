# Bestiário inicial: redesenho dos 20 bosses

Base de trabalho: `d23e5de6722aa60266d6b6c469328e0403722943`. Escopo: `BossesEarlySprites.tsx` e uma regra de apresentação em `bossesEarly.css`. Nenhum ID, catálogo, tipo, motivo de VFX, economia ou evento de combate foi alterado.

## Elenco e decisão de silhueta

| Nível | Boss | Marca visual |
| --- | --- | --- |
| 1 | Goblin Feroz | Orelhas em gancho, topete, gibão costurado e adaga serrilhada. |
| 2 | Lobo Cinzento | Quatro patas, juba em pontas de pelo, orelhas altas e focinho comprido. |
| 3 | Orc Selvagem | Tronco largo, moicano, presas assimétricas e machado pesado. |
| 4 | Aranha Gigante | Oito pernas dobradas, abdômen listrado e presas pareadas. |
| 5 | Dragão Jovem | Duas asas articuladas, cauda curvada, chifres e focinho. |
| 6 | Esqueleto Campeão | Elmo com crista, costelas visíveis, escudo e espada. |
| 7 | Feiticeira das Sombras | Chapéu curvado, cabelo, vestido em camadas e cajado com orbe. |
| 8 | Centauro Ferido | Corpo equino de quatro patas, torso humano, faixa na perna e lança. |
| 9 | Golem de Pedra | Blocos de tamanhos desiguais, braços maciços, rachaduras e musgo. |
| 10 | Fênix Renascente | Asas de penas abertas, crista, bico e três caudas longas. |
| 11 | Salamandra das Chamas | Corpo baixo de lagarto, cauda curva, patas e crista de fogo. |
| 12 | Sereia da Geleira | Rosto e cabelo humano, cauda escamada bifurcada e coroa de gelo. |
| 13 | Minotauro do Labirinto | Chifres largos, focinho bovino, ombros fortes e escudo com labirinto. |
| 14 | Sphinx do Deserto | Corpo felino, asas de penas e rosto com adorno faraônico. |
| 15 | Titã da Antiga Floresta | Tronco, pés de raízes, braços de madeira e copa ramificada. |
| 16 | Guerreiro Imortal | Armadura completa, elmo com pluma, escudo longo e espada. |
| 17 | Rancor Sombrio | Máscara oca, manto flutuante rasgado e mãos espectrais. |
| 18 | Manticora Venenosa | Corpo leonino, asas distintas e cauda curvada com ferrão. |
| 19 | Lorde Daemon | Chifres recurvos, asas de morcego, armadura e tridente. |
| 20 | Leviatã Primitivo | Corpo serpentiforme enrolado, barbatanas, barbilhões e mandíbula. |

As figuras usam caminhos estáticos em uma grade interna de 64 unidades, com contorno escuro arredondado e base, sombra e luz por material principal. O `viewBox="0 0 32 32"`, `data-enemy-key`, retorno `null` para chave desconhecida e a classe `bossesEarly-sprite__body` permanecem. A regra `image-rendering: pixelated` foi removida apenas do sprite para preservar curvas na ampliação; as regras de VFX não foram tocadas.

## Verificação local

| Verificação | Resultado |
| --- | --- |
| `npx --no-install vitest run src/test/EnemyAnimationCoverage.test.tsx` | exit 0; 8 testes passaram. |
| `npx --no-install eslint src/components/adventure/enemies/BossesEarlySprites.tsx` | exit 0. |
| `git diff --check` | exit 0. |
| React SSR + Sharp | 20 sprites renderizados em `contact-early.png`, sem navegador. |

Folha de contato: `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/bestiario-visual-20261021/contact-early.png`. Inspeção visual local das imagens em aproximadamente 132 px e 66 px por sprite mostrou as silhuetas e a separação entre personagens; isso não é validação em navegador, leitura humana no jogo nem teste de leitor de tela. Os avisos de Browserslist e React Router no Vitest não foram falhas.

## Segunda passada de acabamento orgânico

Base desta passada: `f84835c6fff93aa6f88d5980d46cdd9cb7a8fda9`. A revisão visual de integração reprovou o acabamento da primeira folha: animais e monstros tinham excesso de triângulos, e a fênix ainda parecia uma dobradura. O desenho anterior e sua verificação acima ficam como registro histórico, não como aprovação do acabamento final.

Refinei as 20 figuras no mesmo arquivo de sprites. Lobo, aranha, dragão, fênix, salamandra, sereia, minotauro, esfinge, manticora e leviatã receberam corpos e rostos mais curvos; a aranha ganhou abdômen oval, cabeça redonda, olhos múltiplos e pernas dobradas em curvas. A fênix ganhou postura de ave, corpo arredondado, asas abertas em camadas curvas, bico pequeno, olhos com brilho e caudas de pluma. Goblin, orc, centauro, feiticeira, guerreiro e daemon receberam expressão mais legível. Osso, armadura e pedra conservaram facetas próprias do material; silhuetas, paletas e acessórios ainda diferenciam cada boss.

O contrato segue com `viewBox="0 0 32 32"`, desenho estático na grade interna de 64 unidades, origem à direita para o espelhamento da cena, classe animada `bossesEarly-sprite__body`, retorno `null` para chave desconhecida e nenhum ID SVG. Nenhum arquivo de VFX, dados, IDs, combate ou CSS foi alterado nesta passada.

| Verificação final | Resultado |
| --- | --- |
| `npx --no-install vitest run src/test/EnemyAnimationCoverage.test.tsx` | 8 testes passaram, exit 0. |
| `npx --no-install eslint src/components/adventure/enemies/BossesEarlySprites.tsx` | exit 0. |
| `git diff --check` | exit 0. |
| React SSR + Sharp | 20 sprites renderizados em `contact-early-refined.png` e `contact-early-refined-64.png`, sem navegador. |

Evidência visual: `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/bestiario-visual-20261021/contact-early-refined.png` e `contact-early-refined-64.png` no mesmo diretório. Inspecionei ambas as folhas: os rostos e anatomias continuam distinguíveis em 64 px; a fênix e a aranha já não têm o contorno facetado da folha anterior. A inspeção é de imagens SSR rasterizadas; ainda faltam avaliação no navegador, leitura humana dentro da cena animada e eventual nova revisão de arte pela integração.
