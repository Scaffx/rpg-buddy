# Entrega: acessibilidade da sidebar móvel — 19/10/2026

## Escopo e evidência

- Worktree `Scaffx/rpg-acessibilidade-20261019`, base `1f49463efbf964ea94160353016af021f3e7c03e`. Inventário inicial limpo; nenhum arquivo de outra frente editado.
- Contrato: [REFORMA_AUTOMATICA_20261019.md](../REFORMA_AUTOMATICA_20261019.md). Registro consultado antes do fix: [BUG-15 no Bug Tracker](https://app.notion.com/p/3fa812ac94d881e8a1d3f074021e86d8), ainda `A Resolver` na consulta. O registro atribuía a sidebar como causa **provável**, sem demonstrar vínculo com `/assets/LanguageSwitcher-CU_C11pT.js` publicado.
- Evidência local: `src/components/ui/sidebar.tsx` montava `SheetContent` móvel sem `SheetTitle` ou `SheetDescription`; `src/components/ui/sheet.tsx` implementa esses componentes com `@radix-ui/react-dialog`. O teste novo, antes do fix, abriu `SidebarTrigger` → `AppSidebar` → `SheetContent` real e falhou em `expected undefined to be 'Menu de navegação'` (exit 1). O teste original que usava Testing Library parou na coleta porque a instalação compartilhada não contém `@testing-library/dom` (exit 1); a versão entregue usa React DOM e Vitest, sem instalar pacote.

## Alterações

- `src/components/ui/sidebar.tsx`: título e descrição dentro do `SheetContent`, ligados por `aria-labelledby` e `aria-describedby` gerados pelo Radix; ambos com `sr-only`. O título identifica o menu, e a descrição explica as opções. O botão de fechar que `SheetContent` já gera fica visível; o gatilho informa estado expandido e tem nome conforme abrir/fechar no móvel ou recolher/expandir no desktop. Ao fechar, o foco retorna ao controle que abriu o menu, com fallback para o gatilho.
- `src/components/AppSidebar.tsx`: links de ícone na barra recolhida recebem nome via tradução existente; os botões Ajuda e Sair recebem nomes explícitos. Nenhuma rota, item de menu ou regra de missão foi alterada.
- `src/test/mobileSidebar.accessibility.test.tsx`: monta os componentes reais de sidebar e Sheet com dados externos simulados; verifica relações ARIA, ausência dos avisos `DialogTitle`/`Missing Description` ao abrir, nomes dos controles, fechamento por botão e Escape, atalho Ctrl+B e restauração de foco.

## Verificação

| Comando | Resultado | Exit |
| --- | --- | ---: |
| `.\node_modules\.bin\vitest.cmd run src/test/mobileSidebar.accessibility.test.tsx` | 3 testes passaram | 0 |
| `.\node_modules\.bin\vitest.cmd run` | 214 testes / 28 arquivos passaram; a suíte de `CompanionPage` ainda imprime avisos de `useLayoutEffect` em SSR | 0 |
| `.\node_modules\.bin\vite.cmd build` | Build concluído; avisos em `PortalEventPage.tsx`, Browserslist e tamanho de chunk | 0 |
| `.\node_modules\.bin\tsc.cmd --project tsconfig.app.json --noEmit` | 55 erros, mesmo total informado para a baseline; nenhum nos três arquivos desta entrega | 2 |
| `.\node_modules\.bin\eslint.cmd src/components/ui/sidebar.tsx src/test/mobileSidebar.accessibility.test.tsx` | Zero erros; aviso existente `react-refresh/only-export-components` em `sidebar.tsx` | 0 |
| `.\node_modules\.bin\eslint.cmd src/components/ui/sidebar.tsx src/components/AppSidebar.tsx src/test/mobileSidebar.accessibility.test.tsx` | Dois erros `no-explicit-any` preexistentes em `AppSidebar.tsx:96,98`, um aviso Fast Refresh | 1 |
| `git diff --check` | Sem whitespace inválido | 0 |

As dependências existentes foram expostas por junction local para `C:/Users/Murillo/Desktop/RPG-Buddy/rpg-buddy/node_modules`; o diretório de origem não foi modificado. Testes são de JSDOM, não equivalem a teste humano, leitor de tela, auditoria de publicação ou prova de correção do bundle remoto. O componente `SheetContent` ainda nomeia seu botão de fechar como `Close`, e as novas frases da sidebar estão em português; os outros idiomas precisam de chaves de locale na integração. Sugestão de chaves: `app.sidebar.navigation_title`, `navigation_description`, `open_menu`, `close_menu`, `expand_sidebar`, `collapse_sidebar`, e um rótulo de fechar para o Sheet compartilhado. Copy inicial: “Menu de navegação” e “Acesse as áreas do LifeonRPG, ajuda e a opção de sair.”

## Handoff

- Para atualizar BUG-15 após revisão integrada: causa local confirmada no fluxo da sidebar móvel; correção em `sidebar.tsx` com `SheetTitle` e `SheetDescription` internos, teste JSDOM passou sem esses avisos no fluxo aberto. Manter ressalva sobre o bundle publicado e testar separadamente outros diálogos, inclusive Nova Missão, antes de afirmar que o warning remoto desapareceu. Nenhuma escrita foi feita no Notion por restrição desta rodada.
- Não houve achado de controle de missão nesta frente. Nenhuma escrita remota, deploy, push ou merge.
