# Correção P1: roteamento visual do Clérigo na horda — 2026-10-28

## Causa e correção

Na horda, a camada do evento recebe `--horde-source-x` e `--horde-target-x` conforme os slots. O elemento filho `.vfx-clerico` definia `--skill-source-x: 25%` e `--skill-target-x: 75%` nele próprio, sobrepondo os valores herdados. Assim, `n_luz` e `n_sag_var` mostravam o impacto em 75% para qualquer alvo, e `n_cura` podia aparecer fora do herói.

Em `src/components/adventure/adventureScene.css`, o override limitado a `.adventure-horde-event-layer .vfx-clerico` passa a usar as coordenadas do evento. A regra específica para `data-target="self"` mantém o alvo na origem. `clerico.css` não foi alterado; o modo legado mantém 25%/75%.

## Evidência local

- `node_modules/.bin/vitest.cmd run src/test/AdventureHordeScene.test.tsx --reporter=dot`: 11/11 passaram.
- O novo caso renderiza `AdventureScene` com `n_luz` e `n_sag_var` para `targetSlot` 0/1/2 e verifica origem em 13% e impacto em 38%/63%/87% pelas declarações CSS aplicadas à árvore real. Confere `n_cura` no herói em 13% para três inimigos e 25% contra um chefe, além de 25%/75% no legado.
- `node_modules/.bin/eslint.cmd src/test/AdventureHordeScene.test.tsx`: passou.
- A chamada tsc sem projeto saiu 0, mas não verifica o app. A coordenação executou tsc --noEmit -p tsconfig.app.json: 44 diagnósticos preexistentes, nenhum novo nos arquivos alterados.
- `npm run build`: passou; avisos de Browserslist desatualizado e bundle grande.
- `git diff --check`: passou.

## Limite

O jsdom aplica seletores e herança de propriedades customizadas, mas não expande `var()` na posição calculada. O teste resolve essas referências a partir das declarações CSS efetivamente aplicadas; não prova pixels, animação nem renderização no navegador. A validação visual por CUA com fixtures ilustrativas do Clérigo fica para o coordenador.
