# VFX Clérigo — 2026-10-21

## Escopo e origem

- Branch: `Scaffx/vfx-clerico-20261021`, criada do commit `9817fceca8dd73b583d3d7a166a7fe0a046e5d8e` com worktree limpo.
- Fonte: `src/components/adventure/skills/types.ts` e `catalog.snapshot.json` commitados nessa base (catálogo público Primary de 21/10, conforme despacho).
- Ownership editado: `clerico.tsx`, `clerico.css` e este relatório. Nenhum contrato de combate, asset, dependência ou arquivo de outra classe foi modificado.

## Cobertura

| ID | Nome canônico | Tipo | Gesto visual |
| --- | --- | --- | --- |
| `n_golpe` | Golpe de Bastão | skill | Bastão varre um arco curto e gera contato angular. |
| `n_cura` | Cura Menor | skill | Selo circular e gotas luminosas sobem no herói. |
| `n_luz` | Luz Purificadora | skill | Filete horizontal termina em estrela de quatro pontas. |
| `n_escudo` | Bênção Protetora | skill | Abas convergem em contorno de escudo no herói. |
| `n_sup_var` | Aura Restauradora | variant | Três anéis e duas pétalas se abrem ao redor do herói. |
| `n_sag_var` | Julgamento | variant | Sigilo superior desce em coluna estreita sobre o alvo. |

Total: **6 de 6 nodes skill/variant** da árvore `novato`. As passivas `n_sag_mod1` e `n_sag_mod2` ficam fora por não serem conjuradas. Variantes têm demonstração visual; esta entrega não ativa seu efeito no motor.

## Contrato visual

- `clericoSkills: SkillAnimationDefinition[]` e `ClericoSkillEffect({ skillId, target })` são exportados; ID desconhecido retorna `null`.
- A camada própria tem `position: absolute; inset: 0`, `data-skill-vfx="clerico"`, `data-skill-id` e `data-target`. O destino `self` usa a posição do herói. Coordenadas padrão: herói 25%, inimigo 75%, linha 62%.
- Cada gesto usa uma animação finita de 1100 ms: formação até 35%, deslocamento até 75%, impacto até 100%. Não há timers, aleatoriedade, IO ou loop de gameplay.
- `.adventure-still` e `prefers-reduced-motion` mostram a composição estática sem animação. CSS e keyframes são prefixados por `vfx-clerico`.

## Verificação executada

| Comando / prova | Resultado |
| --- | --- |
| `npx --no-install tsc --noEmit --jsx react-jsx --module esnext --moduleResolution bundler --skipLibCheck --target es2020 --lib dom,es2020 src/components/adventure/skills/clerico.tsx` | Exit 0. |
| `npx --no-install eslint src/components/adventure/skills/clerico.tsx` | Exit 0; um warning `react-refresh/only-export-components`, consequência de exportar metadata e componente no mesmo arquivo exigido pelo contrato. |
| `npm run build` | Exit 0; o arquivo novo ainda não está montado na aplicação, então este build não prova a integração. |
| Probe autoral em Node, transpilando o TSX e renderizando com `react-dom/server` | Exit 0; seis IDs, nomes e tipos coincidem com o catálogo; atributos presentes; ID desconhecido retorna `null`; animações finitas e até 1200 ms. |
| Parse de `clerico.css` com PostCSS | Exit 0. |
| `git diff --cached --check` | Exit 0 após stage dos três arquivos de ownership. |

Limites: sem validação visual em navegador, gallery, leitor de tela ou viewport real; integração e apreciação visual ficam com o root. Não houve suíte global, SQL, push, PR, merge ou deploy.
