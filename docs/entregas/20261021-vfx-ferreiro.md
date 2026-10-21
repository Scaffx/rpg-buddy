# VFX de Ferreiro — 21/10/2026

## Identidade e escopo

- Base commitada: `9817fceca8dd73b583d3d7a166a7fe0a046e5d8e`.
- Branch/worktree isolado: `Scaffx/vfx-ferreiro-20261021`, `C:\Users\Murillo\orca\workspaces\rpg-buddy\rpg-vfx-ferreiro-20261021`.
- Commit de implementação: `367f6f90bce3ebe066b1f5fc90b05015bf5c4dab`.
- Arquivos de implementação: `src/components/adventure/skills/ferreiro.tsx` e `ferreiro.css`. Este relatório é o terceiro arquivo da entrega.
- O checkout recebido estava em `Scaffx/vfx-guerreiro-20261021` com `.qa-effects.html` e `src/qa-effects.tsx` não rastreados. Seu branch, seus arquivos e o junction `node_modules` ficaram intactos.

## Cobertura do catálogo

Fonte: `src/components/adventure/skills/catalog.snapshot.json` e `types.ts` commitados na base, identificados como snapshot público Primary de 21/10. Há **6/6 nós skill/variant** do tree `ferreiro`; os 7 passivos do tree não são conjurados.

| ID | Nome canônico | Tipo | Desenho visual |
| --- | --- | --- | --- |
| `f_martelada` | Martelada | skill | Martelo de aço, trilha curta, anel e lascas. |
| `f_chama` | Malho Flamejante | skill | Malho incandescente, trilha de brasa, chama e três fagulhas. |
| `f_impacto` | Impacto de Forja | skill | Bloco de marreta, rachaduras em leque e poeira. |
| `ferreiro_t1_pancada_atordoante` | Pancada Atordoante | skill | Batida vertical, dois arcos dourados e estrelas. |
| `f_for_var` | Bigorna | variant | Bigorna descendente, sombra, poeira e marcas no chão. |
| `f_inf_var` | Forja Vulcânica | variant | Forja no solo, três colunas de lava e brasas. |

`ferreiroSkills` contém metadados de apresentação. `FerreiroSkillEffect` devolve `null` para ID desconhecido; o wrapper absoluto tem `data-skill-vfx="ferreiro"`, `data-skill-id` e respeita `target=self` pela posição do herói. A animação única dura 1080 ms, sem loop, timer, aleatoriedade, IO, asset externo ou alteração de gameplay. `.adventure-still` e `prefers-reduced-motion` exibem composição estática.

## Verificação local

- Leitura por AST do TSX contra o snapshot: **PASS**, exit `0`; seis IDs, nomes e tipos exatos, cobertura do `switch`, caminho `null`, metadados e marcadores DOM. IDs: `f_martelada`, `f_chama`, `f_impacto`, `ferreiro_t1_pancada_atordoante`, `f_for_var`, `f_inf_var`.
- TypeScript Compiler API isolado em modo estrito para `ferreiro.tsx` e `types.ts`: **PASS**, exit `0` (dependências React resolvidas a partir do junction existente, sem modificá-lo).
- `postcss.parse` do CSS e cruzamento de `animation` com `@keyframes`: **PASS**, exit `0`; 18 keyframes declarados e 18 referenciados, todos com prefixo `vfx-ferreiro`.
- `git diff --cached --check` dos arquivos de implementação: **PASS**, exit `0`.

Não executei build ou suíte global, nem validação visual no navegador. A integração da camada e a gallery cabem ao root; estas variantes são demonstração visual e não ativam efeito no motor. Nenhum push, PR, merge ou deploy foi feito.
