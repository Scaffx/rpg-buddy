# Bestiário late — redesenho dos 20 bosses

Base: `d23e5de6722aa60266d6b6c469328e0403722943`. Escopo: apenas `BossesLateSprites.tsx`; dados, identidades, efeitos e CSS de VFX preservados.

## Direção visual

Todos os sprites usam geometria SVG estática em grade 64 × 64 dentro do `viewBox="0 0 32 32"`. O contorno usa 1,8 unidade da grade, cantos e pontas arredondados. Cada paleta da apresentação gera base, sombra e luz para o corpo e para o material secundário, com rosto e olhos desenhados separadamente. O desenho original aponta para a direita e mantém a classe de animação da silhueta.

| Boss | Silhueta e marca própria |
| --- | --- |
| Esfinge Guardiã | Corpo de leão quadrúpede, rosto humano, toucado listrado e cauda curva. |
| Dragão Espectral | Asas rasgadas, pescoço longo, chifres e cauda flutuante. |
| Behemoth de Cristal | Quadrúpede pesado, dorso com cristais altos e focinho largo. |
| Serpente do Caos | Corpo em espiral, pescoço de cobra erguido e capuz. |
| Fênix Sombria | Asas abertas, crista, bico e duas penas longas de cauda. |
| Tiamat, Mãe dos Dragões | Cinco cabeças em leque, asas largas e corpo baixo com patas. |
| Odin, o Pai de Todos | Chapéu com pontas, barba comprida, corvos e lança. |
| Anúbis, Guardião dos Mortos | Cabeça de chacal com orelhas altas, focinho, colar e cajado. |
| Poseidon, Senhor dos Mares | Cabelo de espuma, barba, manto ondulado e tridente. |
| Bahamut, Rei dos Dragões | Dragão branco quadrúpede com coroa de chifres e asas régias. |
| Shinigami | Capuz largo, rosto de caveira, manto irregular e foice. |
| Ifrit, Senhor do Fogo | Djinn de punhos grandes, chifres de chama e cauda de fumaça. |
| Valquíria Suprema | Asas de penas, elmo alado, lança e escudo redondo. |
| Leviathan Cósmico | Serpente marinha em curva, barbatanas dorsais e focinho. |
| Archlich Eterno | Coroa óssea, crânio, manto e cajado com gema. |
| Lúcifer, Anjo Caído | Asas sombrias, chifres, manto e espada diagonal. |
| Chronos, Deus do Tempo | Relógio nas costas, barba, capuz e cajado de ampulheta. |
| Entidade do Vazio Absoluto | Corpo irregular com apêndices e olho dentro de uma abertura escura. |
| Gaia Corrompida | Galhos de árvore, cabelo de folhas e vestido de raízes. |
| Ragnarök, Destruidor de Mundos | Gigante blindado com elmo quebrado, capa e martelo. |

## Verificação

- `npx --no-install vitest run src/test/EnemyAnimationCoverage.test.tsx`: 8 testes passaram; cobre todas as apresentações registradas, identidade e `unknown => null`.
- `npx --no-install eslint src/components/adventure/enemies/BossesLateSprites.tsx`: saída 0.
- `git diff --check`: saída 0.
- Folha de contato renderizada com React SSR e Sharp: `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/bestiario-visual-20261021/contact-late.png`. Inspeção visual da imagem e da versão reduzida a 64 px por sprite (`contact-late-64.png`), sem navegador.

Limites: a folha mostra os sprites sobre fundo claro; não comprova leitura em todos os fundos, navegadores ou telas reais. Nenhuma validação de VFX ou economia foi feita neste escopo visual.
