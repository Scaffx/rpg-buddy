# DungeonArena: confirmação de poção legada

## Diagnóstico

Em `DungeonArena.tsx`, `usePotion` curava HP/MP, reduzia estoque local e registrava sucesso antes da resposta de `consume_inventory_item`. O RPC de `20261019210026_inventory_authorship.sql` trava a linha de inventário com `FOR UPDATE`, exige o usuário autenticado e quantidade positiva, e pode falhar com `ITEM_NOT_OWNED` quando a autoaventura debitou a última unidade. A resposta válida contém `ok`, `item_id`, `effect` e `preserved`. A arena só recebe `invId`, sem `item_id`; por isso lê esse ID da linha do próprio usuário para conferir o recibo, sem tratar essa leitura como autorização.

## Correção local

- Uma trava síncrona única cobre clique manual HP/MP e gatilho automático. Os três gatilhos automáticos mantêm atraso de 100 ms e os limites antigos de 25% HP; a confirmação de poção não bloqueia a ação de combate.
- Nenhuma cura, redução de estoque ou mensagem de sucesso ocorre antes de `ok=true`, `item_id` igual ao lido, `effect` igual ao item selecionado e `preserved` booleano. A cura é calculada do efeito confirmado, mantendo as fórmulas legadas da dungeon. `preserved=true` conserva a carga local.
- Falha, resposta inválida ou ausência de usuário não curam. O retorno tardio não se aplica após morte, mudança de sala/dungeon/sessão/identidade ou desmontagem. O botão mostra espera e fica desabilitado durante a requisição.
- Leitura e RPC usam `AbortSignal` com 15 segundos. Após timeout, erro de transporte ou recibo inválido do RPC, o débito é tratado como **incerto**: não há cura nem repetição automática; a arena desliga a poção automática até o jogador religá-la, busca a quantidade atual da linha com limite de 10 segundos e invalida `['inventory', userId]`, chave real de `useInventory`. Se a atualização falhar, os botões de poção ficam bloqueados e aparece `Atualizar inventário`. Cancelar a requisição HTTP não desfaz uma transação que o servidor já confirmou.

## Provas locais

- `npx vitest run src/test/DungeonPotionConfirmation.test.tsx`: **10/10**. Monta `DungeonArena` de verdade e cobre resposta diferida antes/depois da confirmação, `ITEM_NOT_OWNED` e retry manual, recibo de outro item, `preserved=true`, clique repetido e auto HP durante MP pendente, troca de identidade/dungeon, avanço de sala, morte, ausência de usuário, desmontagem, timeout com atualização de estoque ainda 1 e próximo ataque sem novo RPC automático, e fallback quando essa atualização também expira.
- `npx tsc --noEmit -p tsconfig.app.json`: **44 erros globais**, igual ao baseline informado; nenhum em `DungeonArena.tsx` ou no teste novo.
- `npx eslint src/components/DungeonArena.tsx src/test/DungeonPotionConfirmation.test.tsx`: **3 erros e 4 avisos** em `DungeonArena.tsx`, todos em trechos legados (`any` nos broadcasts/catch e avisos de export/dependências). O teste novo não tem diagnóstico. O nome local `usePotion` foi trocado para `consumePotion`, removendo cinco falsos positivos de `rules-of-hooks` observados durante esta execução.
- `git diff --check`: sem erro.

## Limites

Os testes usam RPC e leitura simulados em jsdom. Não comprovam GoTrue/PostgREST reais, concorrência PostgreSQL, deploy ou autoridade do motor legado de combate; a garantia implementada aqui é que a arena não produz cura local sem recibo válido. Nenhum SQL remoto, migração, instalação, commit, push ou deploy foi executado.

## Revisão pós-review: erro retornado pelo SDK

O SDK instalado (`@supabase/postgrest-js/src/PostgrestBuilder.ts`) captura falhas de `fetch` e devolve `{ data: null, error: { message, code: '' }, status: 0 }`, sem rejeitar a Promise. A classificação anterior marcava qualquer `error` retornado como rejeição SQL, deixando a poção automática ligada após possível débito. Agora só `status === 400` com SQLSTATE `P0001` confirma a rejeição: é o código dos `RAISE EXCEPTION` de guarda em `consume_inventory_item`. Erro de transporte, `ECONNRESET`, gateway 504 sem SQLSTATE e outros resultados não comprovados seguem o fluxo de débito incerto já existente: sem cura, auto OFF, atualização de estoque e sem novo consumo automático no próximo ataque.

Prova local após a correção: `npx vitest run src/test/DungeonPotionConfirmation.test.tsx` passou **13/13**. Os três novos casos montam `DungeonArena`, recebem erro retornado (não Promise rejeitada), atualizam estoque para 1 e verificam ausência de cura e de novo RPC após ataque. O caso `ITEM_NOT_OWNED` agora simula `P0001`/HTTP 400 e confirma auto ON e retry manual. `npx eslint src/components/DungeonArena.tsx src/test/DungeonPotionConfirmation.test.tsx` mantém os mesmos **3 erros e 4 avisos** legados em `DungeonArena.tsx`, nenhum no trecho novo ou no teste. `npx tsc --noEmit -p tsconfig.app.json` mantém os **44 erros globais** do baseline informado, nenhum nos arquivos alterados. Nenhuma chamada a serviço remoto foi feita.
