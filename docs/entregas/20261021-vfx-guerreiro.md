# VFX de habilidades do Guerreiro — 21/10/2026

## Escopo e origem

- Base: `9817fceca8dd73b583d3d7a166a7fe0a046e5d8e`; branch `Scaffx/vfx-guerreiro-20261021`.
- Código visual: `48c8732f6e685eb8b28ff8e0bab7563b5c6c5e96`.
- Fonte dos IDs e nomes: `src/components/adventure/skills/catalog.snapshot.json` commitado na base, declarado como snapshot da consulta pública ao Primary em 21/10. Esta entrega não consultou nem escreveu no Primary.
- O catálogo contém **13** nós com `tree=guerreiro`: **7** `skill`/`variant` animados e **6** passivos excluídos da conjuração.

| ID | Nome canônico | Tipo | Gesto visível | Metadata visual |
| --- | --- | --- | --- | --- |
| `g_golpe` | Golpe Marcial | skill | Guarda, arco curto de aço e impacto compacto | physical · melee · enemy |
| `g_chama` | Lâmina Flamejante | skill | Acendimento, lâmina com brasas e leque de chamas | fire · lunge · enemy |
| `g_corte` | Corte Sangrento | skill | Duas linhas rubras com impactos em tempos distintos | physical · lunge · enemy |
| `g_ruptura` | Ruptura Frontal | skill | Cunha descendente e rachaduras no chão | physical · slam · enemy |
| `g_for_var` | Devastar | variant | Corte angular, anel de choque e lascas | physical · slam · enemy |
| `g_inf_var` | Espada Vulcânica | variant | Fio incandescente e coluna de lava estilizada | fire · slam · enemy |
| `g_sang_var` | Dança das Lâminas | variant | Três rastros curvos cruzados em sequência | physical · lunge · enemy |

`g_for_mod1`, `g_inf_mod1`, `g_sang_mod1`, `g_for_mod2`, `g_inf_mod2` e `g_sang_mod2` são passivos e não constam da lista visual. As variantes servem à apresentação; esta entrega não altera o motor nem concede efeitos de combate.

## Contrato de montagem

`guerreiro.tsx` exporta `guerreiroSkills: SkillAnimationDefinition[]` e `GuerreiroSkillEffect({ skillId, target }: SkillEffectProps)`. Um ID desconhecido retorna `null`. Um ID conhecido gera camada absoluta `inset: 0`, `pointer-events: none`, `aria-hidden`, `data-skill-vfx="guerreiro"`, `data-skill-id` e `data-target`; o consumidor deve montá-la na camada absoluta da cena (z-index 3). A origem usa `--skill-source-x` (25% por padrão), o alvo usa `--skill-target-x` (75%), e ambos compartilham `--skill-line-y` (62%). `target="self"` fixa o impacto na origem do herói.

O ciclo dura **1100 ms** sem repetição: formação até 35%, deslocamento entre 35–75%, impacto de 75–100%. SVG e CSS são declarativos e prefixados com `vfx-guerreiro`; não há timer, aleatoriedade, asset externo, dependência nova ou escrita de resultado de combate. Em `.adventure-still` e `prefers-reduced-motion: reduce`, as animações cessam e aparecem apenas a marca de origem e o emblema final estático.

## Verificação local

| Verificação | Resultado |
| --- | --- |
| Comparação automática entre snapshot, metadata e chaves do artwork | exit 0; IDs `g_golpe,g_chama,g_corte,g_ruptura,g_for_var,g_inf_var,g_sang_var`; 7 ativos, 6 passivos |
| `npx --no-install tsc --noEmit --jsx react-jsx --moduleResolution bundler --module ESNext --target ES2020 --skipLibCheck src/components/adventure/skills/guerreiro.tsx` | exit 0 |
| `npx --no-install eslint src/components/adventure/skills/guerreiro.tsx` | exit 0, sem avisos após a supressão local do aviso Fast Refresh exigida pelo contrato de dois exports |
| Parse de `guerreiro.css` por PostCSS e verificação de prefixo de `@keyframes` | exit 0; 20 keyframes prefixados |
| Varredura PostCSS de seletores e declarações `animation` | exit 0; seletores contidos no prefixo e 19 animações finitas de até 1200 ms |
| SSR local com Vite `ssrLoadModule` + `renderToStaticMarkup` | exit 0; ID desconhecido vazio, ID conhecido com atributos corretos para `enemy` e `self` |
| `git diff --cached --check` no commit visual | exit 0 |

Limites: sem QA em navegador, sem validação visual em 320/900 px e sem prova de integração no root. A animação depende da montagem pelo registry/cena do root; dano, HP, MP e resultado continuam exclusivos dos eventos do servidor. `.qa-effects.html`, `src/qa-effects.tsx` e a junction `node_modules` permaneceram fora do commit.
