# VFX Gatuno — 2026-10-21

## Escopo e proveniência

- Branch: `Scaffx/vfx-gatuno-20261021`, criada de `9817fceca8dd73b583d3d7a166a7fe0a046e5d8e` após `git status --short --branch` limpo. A branch anterior `Scaffx/vfx-mago-20261021` permaneceu em `e1b7fd3a5648b1201513775d2fbc32f6d36ba520`.
- Commit de implementação: `69ac2860046b7b47869349f2acb54d1c1f1bd941`.
- Fonte de IDs, nomes e tipos: `src/components/adventure/skills/catalog.snapshot.json` e `types.ts` commitados na base; o snapshot corresponde à consulta Primary de 21/10 informada no despacho. Não fiz nova consulta live.
- Ownership alterado: `gatuno.tsx`, `gatuno.css` e este relatório. Nenhum contrato de combate, catálogo, dependência ou arquivo de integração foi alterado.

## Cobertura

| ID | Nome canônico | Tipo | Silhueta principal |
| --- | --- | --- | --- |
| `gt_punhal` | Punhalada | skill | Punhal reto e corte estreito |
| `gt_furtivo` | Golpe Furtivo | skill | Sombra baixa e marca atrás do alvo |
| `gt_retalhar` | Retalhar | skill | Lâmina vibrante e três cortes sucessivos |
| `gt_veneno` | Lâmina Envenenada | skill | Gota na lâmina e respingos verdes |
| `gt_fur_var` | Assassinato | variant | Mira em losango, traço fino e estrela |
| `gt_sang_var` | Estripar | variant | Arco largo, corte cruzado e fitas |
| `gt_ven_var` | Névoa Tóxica | variant | Frasco em arco e nuvem baixa em camadas |

Total: **7/7** nós `skill`/`variant` do Gatuno. Os **6** nós `passive` não são conjuráveis. Variantes têm demonstração visual, sem aplicação de efeito de motor.

O componente exporta `gatunoSkills` e `GatunoSkillEffect`, retorna `null` para ID desconhecido e emite `data-skill-vfx="gatuno"` e `data-skill-id`. Cada efeito ocupa `inset: 0`, usa `--skill-source-x`, `--skill-target-x` e `--skill-line-y`, e reposiciona impacto em `target="self"` para o herói. Todas as animações são únicas, duram **1080 ms**, não têm iteração, e reservam 0–35% para formação, 35–75% para deslocamento e 75–100% para impacto. `.adventure-still` e `prefers-reduced-motion` mostram apenas um símbolo estático de impacto.

## Evidência executada

| Verificação | Resultado |
| --- | --- |
| `npx --no-install tsc --noEmit --jsx react-jsx --esModuleInterop --skipLibCheck --moduleResolution bundler --module esnext --target es2020 src/components/adventure/skills/gatuno.tsx` | exit 0 |
| `npx --no-install eslint src/components/adventure/skills/gatuno.tsx` | exit 0; 1 warning `react-refresh/only-export-components`, decorrente das duas exportações pedidas no mesmo arquivo |
| Checagem Node de IDs do snapshot contra metadata e `case` | exit 0; 7 esperados, 7 metadata, 7 casos, sem ausências/extras |
| Renderização SSR pontual via esbuild + ReactDOMServer | exit 0; 7 IDs, nomes e tipos, `enemy`/`self`, atributos e ID desconhecido `null` |
| Parse PostCSS e inspeção de seletores/keyframes | exit 0; 22 keyframes `vfx-gatuno-*`, sem seletor fora do escopo ou duração divergente |
| `git diff --cached --check` antes do commit de implementação | exit 0 |

## Limites de validação

O módulo ainda não está ligado ao registry/cena neste branch, por ownership. O build do aplicativo não provaria sua montagem, e não foi usado como evidência. Não houve navegador, gallery, avaliação visual humana em 320/900 px, teste de leitor de tela, teste do motor ou validação de backend. A integração e a inspeção visual ficam com o root.
