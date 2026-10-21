# VFX do Arqueiro — 21/10/2026

## Escopo e fonte

- Base de autoria: `9817fceca8dd73b583d3d7a166a7fe0a046e5d8e`, branch `Scaffx/vfx-arqueiro-20261021`.
- Fonte de cobertura: `src/components/adventure/skills/catalog.snapshot.json` commitado nessa base; contrato de exportação em `types.ts`.
- Entrega visual apenas: `arqueiro.tsx` exporta `arqueiroSkills` e `ArqueiroSkillEffect`; `arqueiro.css` contém os gestos. Não há gasto, dano, estado de combate ou alteração de catálogo.

## Cobertura (7 de 7 nós conjuráveis)

| ID | Nome canônico | Desenho | Motion |
| --- | --- | --- | --- |
| `a_tiro` | Tiro Certeiro | Flecha reta fina e marca pequena | `bow` |
| `a_fogo` | Flecha Flamejante | Flecha com cauda de brasas e coroa de chamas | `bow` |
| `a_gelo` | Flecha de Gelo | Dardo facetado e cristal de três eixos | `bow` |
| `a_vetor` | Disparo Perfurante | Mira que fecha, agulha e corte axial | `bow` |
| `a_fogo_var` | Chuva de Fogo | Cinco projéteis diagonais em salva | `bow` |
| `a_gelo_var` | Tempestade de Gelo | Seis cristais convergindo em espiral | `bow` |
| `a_pre_var` | Tiro do Vazio | Dardo escuro com ecos e íris violeta | `bow` |

Os 6 nós passivos do Arqueiro não são conjurados. As três variantes são demonstrações visuais; a presença delas no catálogo de VFX não afirma que o motor execute transformações, área, dano adicional ou estados secundários. `element`, `target` e `description` descrevem a apresentação, não uma mecânica.

## Contrato de composição

- O componente retorna `null` para ID desconhecido. Para cada ID conhecido, a camada possui `data-skill-vfx`, `data-skill-id`, `aria-hidden` e wrapper absoluto `inset: 0` com prefixo `vfx-arqueiro`.
- Coordenadas: `--skill-source-x` (padrão 25%), `--skill-target-x` (75%) e `--skill-line-y` (62%); `target=self` põe o alvo no herói. A camada não captura ponteiro.
- A linha temporal total é no máximo 1180 ms: 1040 ms por gesto e até 140 ms de atraso entre flechas da salva. Formação 0–35%, deslocamento 35–75% e impacto 75–100% do gesto. Sem timers JavaScript, aleatoriedade, assets externos ou loop de jogo.
- `.adventure-still` e `prefers-reduced-motion` removem animações e mostram uma silhueta estática do projétil/impacto. Não há flashes de tela cheia ou animação infinita.

## Validação e limites

- Comparação automática dos IDs do catálogo (`tree=arqueiro`, `nodeType in skill/variant`) contra definições e `switch`: 7 esperados, 7 definidos, 7 renderizados, exit 0.
- `npx --no-install eslint src/components/adventure/skills/arqueiro.tsx`: exit 0, sem avisos.
- `npx --no-install tsc -p tsconfig.app.json --noEmit`: exit 2 por 44 diagnósticos preexistentes fora da entrega; 0 em `arqueiro.tsx`/`arqueiro.css`.
- `npm run build`: exit 0 na base indicada. Como o integrador ainda não importou este módulo, o build global não prova sua composição visual.
- Bundle isolado com API `esbuild.build` (`write:false`, `outfile` virtual): exit 0, 2 arquivos de saída em memória (JS e CSS). A primeira tentativa sem `outfile` falhou por configuração da sonda, não por código; foi corrigida e repetida.
- Renderização `react-dom/server` da saída compilada em memória: exit 0; 7 IDs do catálogo retornam `data-skill-id`/`data-skill-vfx`, ID desconhecido retorna vazio e `target=self` aplica a classe de alvo no herói.
- `git diff --check`: exit 0; Git advertiu apenas sobre normalização LF/CRLF do worktree Windows.
- A composição na cena, o enquadramento a 320/900 px e a galeria ficam para a validação do integrador, sem alegação de navegador nesta autoria.
