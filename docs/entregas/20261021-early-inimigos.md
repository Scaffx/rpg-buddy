# Bosses iniciais 1–20: apresentação visual

## Escopo e contrato

- Base: `308e093be03dff5e94a777127a163c8ecc377897`, branch `Scaffx/vfx-bosses-iniciais-20261021`.
- Fonte dos nomes e da ordem: `src/components/adventure/enemies/catalog.snapshot.json`, observado em 2026-10-21. O módulo filtra níveis 1–20.
- Cobertura: 20 bosses, 20 ataques básicos e 58 habilidades especiais, totalizando 78 definições. Os básicos têm `element: 'physical'` conforme o motor atual.
- IDs: `boss:UUID:attack` e `boss:UUID:skill:INDEX` (índice zero-based do snapshot). Esse índice identifica a prévia visual; não identifica uma habilidade no motor.
- `bossesEarly.data.ts` contém apresentações, descrições visuais e motivos. `BossesEarlyEffects.tsx` e `BossesEarlySprites.tsx` produzem SVG/CSS sem recurso externo, áudio, timer ou efeito em estado de jogo.
- Os especiais são **prévias visuais**. O motor atual só executa ataques básicos de inimigos. Nenhuma regra de dano, status, vida, mana, XP, drop ou relógio foi alterada.

## Validação local

| Comando / verificação | Exit | Resultado |
| --- | ---: | --- |
| `node` via PowerShell heredoc, `esbuild.build` focal para os três arquivos TS/TSX (`bundle`, `write:false`) | 0 | Três arquivos compilados. |
| `node` via PowerShell heredoc, bundle CommonJS + `react-dom/server.renderToStaticMarkup` | 0 | 20 bosses, 58 skills e 78 definições em ordem/id/nome do snapshot; 78 efeitos e 20 sprites renderizados; desconhecidos retornam `null`. |
| `node` via PowerShell heredoc, comparação de motivos declarados com `case` de `Glyph` | 0 | 78 motivos distintos, nenhum sem desenho. |
| `node` via PowerShell heredoc, `postcss.parse` em `bossesEarly.css` | 0 | CSS parseado; keyframes finitos; nenhuma ocorrência de `infinite`. |
| `npx --no-install eslint src/components/adventure/enemies/bossesEarly.data.ts src/components/adventure/enemies/BossesEarlyEffects.tsx src/components/adventure/enemies/BossesEarlySprites.tsx` | 0 | Sem alertas. |
| `npx --no-install tsc -p tsconfig.app.json --noEmit --pretty false` | 2 | 44 erros globais fora dos arquivos desta entrega; zero erros nos arquivos próprios. |
| `git diff --check` | 0 | Sem whitespace inválido. |

## Limites

- Não houve integração na cena ou galeria, teste em navegador, validação visual humana ou conferência com leitor de tela neste checkout.
- Não houve consulta de schema/API remoto nesta tarefa; o snapshot fornecido é a fonte desta entrega.
- O erro global de TypeScript impede afirmar build TypeScript completo verde; a compilação focal, a renderização estática e o lint passaram.
- Commit e SHA são comunicados no handoff ao coordenador. Não houve merge, push nem deploy.
