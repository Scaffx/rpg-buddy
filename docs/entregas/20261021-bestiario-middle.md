# Bestiário middle — redesenho de 20 bosses

Base de trabalho: `d23e5de6722aa60266d6b6c469328e0403722943`.

## Escopo

- Arquivo de arte: `src/components/adventure/enemies/BossesMiddleSprites.tsx`.
- Mantidos `viewBox="0 0 32 32"`, `BossesMiddleSprite`, `enemyKey`, `data-enemy-key`, retorno `null` para chave desconhecida, nomes de classe e estilos de cor usados pela animação/VFX.
- Geometria estática em grade 64×64 com `scale(.5)`; contornos arredondados, tons separados por material e olhos/rostos legíveis. Sem IDs SVG, imagens externas, hooks, timers ou regras de combate.

## Elenco e marcas visuais

| Boss | Marca da miniatura |
| --- | --- |
| Hidra das Profundezas | Três pescoços sinuosos e três mandíbulas separadas sobre corpo anfíbio. |
| Cavaleiro do Vazio | Elmo com pluma, viseira, escudo facetado e espada erguida. |
| Wyvern Relâmpago | Asas altas de membrana, crista em raio, bico e pernas finas. |
| Necromante Eterno | Rosto sob capuz, manto aberto e cajado de caveira. |
| Quimera Ancestral | Corpo leonino, cabeça de bode, cabeça de leão e cauda de serpente. |
| Elemental Primordial | Corpo de pedra com chama, água, vento e núcleo expressivo. |
| Dragão Sombrio | Asa larga, pescoço reptiliano, chifres e cauda grossa. |
| Guardião Celestial | Asas com penas, halo, rosto humano, túnica e lança. |
| Kraken Abissal | Manto arredondado, tentáculos curvos e ventosas. |
| Imperador Draconiano | Coroa alta, asa recolhida e armadura ventral dracônica. |
| Lich Supremo | Crânio coroado, órbitas fundas, manto e cajado arcano. |
| Wyrm de Gelo Eterno | Corpo serpentino em S, barbatanas de gelo e cabeça estreita. |
| Demônio da Fome | Chifres curvos, asas, mandíbula com presas e braços longos. |
| Golem de Adamantina | Placas metálicas, punhos assimétricos e núcleo no peito. |
| Árvore Maldita | Copa ramificada, rosto no tronco, braços-galho e raízes como pés. |
| Crononauta | Explorador com óculos, roupa e grande mostrador às costas. |
| Basilisco Imperial | Lagarto rasteiro com crista régia, quatro patas e cauda. |
| Fenrir, Lobo do Ragnarok | Quadrúpede de focinho longo, orelhas, juba, cauda e elo rompido. |
| Djinn do Deserto Infinito | Turbante, rosto humano, torso com joias e cauda de fumaça. |
| Titã de Obsidiana | Corpo pesado com placas de obsidiana, chifres e núcleo de magma. |

## Evidência local

- `npx --no-install vitest run src/test/EnemyAnimationCoverage.test.tsx`: **PASS**, 8 testes.
- `npx --no-install eslint src/components/adventure/enemies/BossesMiddleSprites.tsx`: **PASS**.
- `git diff --check`: **PASS**.
- Renderização estática React SSR + Sharp, inspecionada em 136 px e 64 px:
  - `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/bestiario-visual-20261021/contact-middle.png`
  - `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/bestiario-visual-20261021/contact-middle-64.png`
- `npx --no-install tsc --noEmit -p tsconfig.app.json`: **falha global**, exit 2, 44 erros em outros arquivos; nenhum diagnóstico em `BossesMiddleSprites.tsx`. Log local: `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/bestiario-visual-20261021/tsc-middle.log`.

Limite: a inspeção foi de PNGs estáticos; não foi feita validação em navegador nem da animação em cena.
