# Histórico de compras da loja — 2026-10-22

Base: `73a763bc80b4445f57a1efca509097fc8548e608` (PR 71). Escopo: somente UI e leitura.

## Mudança

- O botão **Ver histórico de compras** abre um diálogo com título, descrição, estados de carregamento, vazio e erro persistente (`role="alert"`), lista das 20 compras mais recentes, botão **Fechar** e fechamento por Escape.
- A consulta autenticada lê somente `gold_history` do próprio usuário, com filtros no servidor `type IN ('compra_loja', 'compra_equipamento', 'compra_pet')` e `amount < 0`, ordenação por `created_at DESC` e `LIMIT 20`. A chave de cache inclui o ID do usuário. Compras confirmadas de Loja do Tempo, equipamento e pet invalidam essa chave.
- Os três tipos vêm dos escritores `buy_shop_item`, `purchase_game_item` e `buy_pet` nas migrações atuais. `inventory_purchase_requests` não é consultada: a migração de autoria revoga todas as permissões de cliente nessa tabela. Não há `user_purchases` nos tipos/esquema deste commit.

## Verificação local

- `vitest run src/test/ShopPurchaseHistory.test.tsx`: 5 testes passaram. Cobrem abertura, filtro/limite, resultado realista de equipamento, fechamento por botão/Escape, estado vazio, erros estruturado, `Error` e string, e invalidação após compra confirmada.
- `vite build`: passou.
- `tsc --noEmit -p tsconfig.app.json`: falha por diagnósticos preexistentes em outros arquivos; nenhum em `ShopPage.tsx` ou `usePurchaseHistory.ts`.
- ESLint dos arquivos tocados: 11 erros de `no-explicit-any` em `ShopPage.tsx`, exatamente os mesmos 11 presentes no HEAD base; hook e teste sem novos diagnósticos.
- `git diff --check`: passou.

Não houve consulta autenticada ou teste de navegador pelo worker, nem alteração no banco. Integração, revisão independente e publicação ficam com o coordenador.
