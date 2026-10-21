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
