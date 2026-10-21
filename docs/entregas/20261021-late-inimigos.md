# Inimigos finais: apresentação visual dos bosses 41–60

## Fonte e cobertura

- Checkout isolado: `Scaffx/vfx-bosses-finais-20261021`, base `308e093`.
- Fonte de identidade e ordem: `src/components/adventure/enemies/catalog.snapshot.json`, `observedAt` 2026-10-21.
- Cobertura: 20 bosses com `level >= 41`, inclusive os três eventos mundiais; 20 ataques básicos e 62 especiais. Odin tem cinco especiais. São 82 IDs de animação únicos.
- Chaves: `boss:UUID`; básico `boss:UUID:attack`; especiais `boss:UUID:skill:INDEX` com índice zero-based da ordem do catálogo. Esses IDs são de apresentação da galeria e não alegam ser IDs do motor.
- Os nomes dos especiais e dos bosses seguem literalmente o snapshot. Todas as definições incluem elemento visual, movimento, alvo e descrição do efeito. Todos os básicos têm `kind: attack`, nome `Ataque básico` e `element: physical`, conforme contrato live comunicado pelo coordenador.

## Entrega visual

- `bossesLate.data.ts`: catálogo local de apresentação, paletas, silhuetas, motivos e descrições visuais, sem regras de combate.
- `BossesLateSprites.tsx`: 20 SVGs `viewBox="0 0 32 32"`, com chave de inimigo, classe recebida e silhuetas para esfinge, dragões, behemoth, serpentes, fênix, deuses, ceifador, djinn, valquíria, lich, anjo, titã, vazio, Gaia e Ragnarök. Os rostos e cabeças apontam para a direita para a cena espelhar o inimigo.
- `BossesLateEffects.tsx` e `bossesLate.css`: 36 motivos desenhados em SVG, paletas por elemento e cores próprias para básicos. Preparação, deslocamento direita→esquerda e impacto duram 1,2 s em animação finita. `target=self` usa a posição da fonte. `adventure-still` e `prefers-reduced-motion: reduce` mostram o símbolo de impacto parado e visível.
- IDs e chaves desconhecidos retornam `null`. Sem dependências novas, imagens externas, áudio, scripts, timers ou alterações em HP, dano, XP, drops e clocks.

## Verificação local

| Comando executado | Saída |
| --- | --- |
| `node_modules\.bin\eslint.cmd src/components/adventure/enemies/bossesLate.data.ts src/components/adventure/enemies/BossesLateEffects.tsx src/components/adventure/enemies/BossesLateSprites.tsx` | exit 0 |
| `node_modules\.bin\vite.cmd build` | exit 0; build do aplicativo, com avisos de browserslist/chunk |
| `node_modules\.bin\tsc.cmd --noEmit --project tsconfig.app.json --pretty false` | exit 1; diagnósticos em arquivos fora desta entrega, nenhum nos três arquivos novos |
| `node $env:TEMP\bossesLate-verify.cjs` | exit 0; harness temporário com TypeScript focal, comparação de nomes/IDs/ordem com snapshot, 20 básicos físicos, 82 efeitos e 20 sprites renderizados em React SSR, `null` para desconhecidos, CSS analisado por PostCSS |
| `node $env:TEMP\bossesLate-preview.cjs` | exit 0; contact sheet temporário de 20 silhuetas renderizado por Sharp e inspecionado visualmente |

O primeiro ensaio do harness temporário falhou com `React is not defined` porque o esbuild de teste usava JSX clássico. Reexecutado com `jsx: automatic`, passou; não houve correção do produto para essa falha de harness.

## Limites

Os especiais são prévias visuais. O motor atual executa apenas ataques básicos de inimigos; esta entrega não ativa mecânicas de especiais. O build do aplicativo não importa estes arquivos antes da integração do coordenador; a compilação e renderização focais cobrem este módulo. A contact sheet foi inspecionada fora do navegador; não houve validação visual no jogo, por pessoas usuárias ou leitores de tela. Não houve merge, push, deploy ou escrita remota.
