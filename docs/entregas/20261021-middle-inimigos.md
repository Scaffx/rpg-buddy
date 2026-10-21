# VFX de bosses intermediários (níveis 21–40)

## Escopo

- Base de trabalho: `308e093be03dff5e94a777127a163c8ecc377897`, branch `Scaffx/vfx-bosses-intermediarios-20261021`.
- Fonte dos nomes e da ordem: `src/components/adventure/enemies/catalog.snapshot.json`, observado em 2026-10-21. São 20 bosses, 20 ataques básicos e 60 habilidades especiais.
- IDs visuais: `boss:UUID:attack` e `boss:UUID:skill:INDEX`, com índice inicial zero. São identificadores de apresentação, não IDs reivindicados do motor.
- Cada boss tem silhueta SVG 32×32 própria ou variação identificável de família (hidra, cavaleiro, wyvern, necromante, quimera, elemental, dragões, anjo, kraken, lich, wyrm, demônio, golem, árvore, crononauta, basilisco, lobo, djinn e titã). Todos encaram à direita antes do espelhamento da cena.
- Cada habilidade usa um motivo SVG ligado ao nome e à descrição do catálogo. A animação de cerca de 1,2 s prepara na origem, percorre a linha direita → esquerda quando mira o herói e mostra o impacto. Estados `.adventure-still` e `prefers-reduced-motion` conservam uma pose legível.
- Todos os básicos declaram `element: physical`, seguindo o contrato confirmado do motor. As cores dos efeitos são apenas linguagem visual. Habilidades especiais são **prévias visuais**; nenhuma regra de dano, status, cura, invocação, tempo, economia ou combate foi ativada.

## Verificação local

| Comando / checagem | Saída | Limite |
| --- | --- | --- |
| Script temporário `esbuild.buildSync` com `jsx: automatic`, seguido de `ReactDOMServer.renderToStaticMarkup` e asserções contra o snapshot | exit 0: 20 apresentações, 80 IDs únicos, 20 básicos `physical`, 60 skills em ordem exata, 80 efeitos e 20 sprites renderizáveis, unknown → `null` | Verifica markup, não aparência em navegador ou leitores de tela. O primeiro ensaio usou JSX clássico no verificador e falhou; a configuração foi corrigida antes desta passagem. |
| `node -e "... require('postcss').parse(css) ..."` | exit 0 (`CSS_PARSE_OK`) | Parse sintático apenas. |
| `npx --no-install eslint` nos três arquivos TS/TSX | exit 0 | Escopo focal. |
| `npm run build` | exit 0 | O registro/galeria ainda não importam estes módulos; o build da aplicação sozinho não prova integração. |
| `npx --no-install tsc --noEmit -p tsconfig.app.json` | exit 2; zero diagnósticos nos arquivos deste escopo | Há erros globais fora do ownership; não é uma passagem global de TypeScript. |

Não houve instalação de dependências, merge, push, deploy ou validação de mecânicas em ambiente remoto. A integração do registro e da galeria pertence ao coordenador.
