# Criaturas inimigas — arte visual local

## Escopo e origem

- Checkout: `C:\Users\Murillo\orca\workspaces\rpg-buddy\rpg-continuo-cena-20261020`, branch `Scaffx/vfx-criaturas-20261021`, base `308e093be03dff5e94a777127a163c8ecc377897`.
- Snapshot de referência: `src/components/adventure/enemies/catalog.snapshot.json`, campo `creatures`, observado em `2026-10-21`.
- Os arquivos `.qa-effects.html` e `src/qa-effects.tsx` já estavam não rastreados na inspeção inicial. Foram preservados sem edição e não entram no commit.
- Ownership limitado a `creatures.data.ts`, `CreaturesEffects.tsx`, `CreaturesSprites.tsx`, `creatures.css` e este relatório.

## Entrega

- Doze entradas `creature:BIOME:SLOT` com nomes exatos, quatro biomas e três slots por bioma. Há uma animação por criatura, identificada por `creature:BIOME:SLOT:attack`; todas se chamam `Ataque básico`, com `kind: attack`, `target: hero` e `element: physical`.
- Doze SVGs locais `viewBox="0 0 32 32"` com silhuetas próprias: lobo, javali, espírito, peixe, ave costeira, serpente, esqueleto, morcego, sentinela, chama viva, asa de brasa e golem. A pose original encara a direita para a cena espelhar.
- Doze motivos visuais de impacto físico com direção do inimigo para o herói, usando `--enemy-source-x`, `--enemy-target-x` e `--enemy-line-y`. Água, folhas e brasas são apenas apresentação; nenhum dado de dano, resistência, recompensa ou progressão foi criado.
- Os dois componentes retornam `null` para IDs desconhecidos. O VFX traz `data-enemy-vfx`, `data-enemy-animation` e `data-target`, termina em 1,2 s e oferece pose estática em `.adventure-still` e `prefers-reduced-motion: reduce`.
- A resistência a fogo da Asa de brasa permanece no catálogo/motor existente; estes arquivos não a reinterpretam.

## Verificação local

| Comando/prova | Exit | Resultado |
| --- | ---: | --- |
| `git rev-parse --show-toplevel; git branch --show-current; git status --short; git rev-parse HEAD` | 0 | Root, branch, base e WIP registrados acima. |
| `./node_modules/.bin/eslint.cmd` nos três arquivos TS/TSX novos | 0 | Sem diagnósticos. |
| `node -e` com `postcss.parse` em `creatures.css` | 0 | CSS parseado, 58 nós de topo. |
| Script Node inline com TypeScript `createProgram` focal, bundle `esbuild`, React `renderToStaticMarkup` e `assert` contra o snapshot | 0 | Zero diagnósticos nos arquivos TS/TSX do ownership; 12/12 nomes, chaves e IDs únicos; 12/12 sprites e VFX renderizados; IDs desconhecidos retornam vazio (`null`). |
| Renderização dos 12 SVGs por React SSR e `sharp`, mosaico em `%TEMP%\lifeon-creatures-proof.png` | 0 | Inspeção visual local: 12 silhuetas reconhecíveis. Artefato temporário fora do commit. |
| `./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.app.json` | 1 | Diagnósticos globais em arquivos fora do ownership, incluindo `CombatArena.tsx`, `ReportsPanel.tsx`, hooks e páginas. A compilação focal acima não encontrou erro nos arquivos entregues. |
| `git diff --check` | 0 | Sem problemas de whitespace nos arquivos rastreados; repetir com `--cached` após stage para cobrir os novos. |

## Limites

- Não houve browser disponível para observar animações rodando na cena: o executável Chromium esperado pelo Playwright não está presente. A verificação cobre SSR dos componentes, parse do CSS e inspeção dos SVGs rasterizados, não uma sessão de navegador ou validação humana em tela.
- Não houve alteração em `AdventureScene`, registry, catálogo, economia ou Supabase. A integração do wrapper e a validação da cena completa cabem ao coordenador.
- Nada foi enviado por push, merge ou deploy.
