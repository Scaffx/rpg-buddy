# Alimentação de pets: entrega da interface

**Checkout:** `rpg-auth-foco-20261026`, HEAD inicial `c13d5ab3da2af18987ca2f08cd5793d4f8a10c00`. Trabalho local de UI, sem leitura ou escrita no Supabase remoto, instalação, commit, push ou deploy. A migração SQL e a integração de aventura pertencem a outra frente.

## Contrato usado

Confirmado com a frente de backend em 2026-10-29: `get_pet_food_catalog()` devolve somente espécies próprias, com `{pet_type,item_id,name,unit_price,owned:true,quantity}`. `buy_pet_food(p_pet_type,p_quantity,p_request_id)` devolve `{ok,replayed,request_id,pet_type,quantity,unit_price,total,gold,stock,created_at}`. `get_pet_food_purchase_receipt(p_request_id)` distingue `{found:false,request_id}` de recibo confirmado com esses campos. `get_pet_care_state()` devolve `server_now` e `pets` com `companion_id`, espécie, nome, estoque, refeições, próximo cuidado e `participation`. `interact_pet_care(p_companion_id,p_action,p_request_id)` aceita `care|play`, devolve `effective` e pode omitir `next_care_at`/`participation` no replay; a UI refresca o estado.

## Implementação

- `usePetCare.ts` valida as respostas dos RPCs. A vitrine usa somente o catálogo confirmado; preço unitário e estoque vêm do servidor. A loja limita o lote a 1–30 na escolha e mostra o total como estimativa do preço confirmado pelo catálogo; o débito real continua no RPC.
- O UUID da compra é mantido em `sessionStorage` por conta até recibo ou rejeição SQL confirmada. Após transporte incerto, a UI consulta o recibo e mantém a mesma intenção; `found:false` não é tratado como prova de ausência de débito. A retomada repete somente o mesmo UUID, espécie e quantidade. O cliente bloqueia cliques simultâneos e outras compras enquanto há pendência.
- A escolha do primeiro companheiro e a compra de pet invalidam catálogo e estado de cuidado, para que a nova espécie apareça sem esperar a expiração do cache.
- O escopo de identidade inclui usuário, token confirmado e `continuity.epoch`. Após troca de identidade durante uma espera, não começa nova consulta/reenvio da intenção antiga, não anuncia sucesso e preserva a pendência da conta original. Consultas de cuidado são tratadas como operações que liquidam refeições, não como leituras inertes.
- `CompanionPage` removeu o botão de alimento gratuito e o cálculo local de humor como indicador de cuidado. Mostra estoque, refeição automática, próximo cuidado e participação recebidos do servidor. Carinho e brincadeira compartilham o horário confirmado, e indisponibilidade do RPC desativa as ações sem ocultar os companheiros.
- Os textos novos estão em português, inglês e espanhol. Afinidade de forrageio, XP de história/missão e seleção de pet não foram alterados.

## Verificação local

- `npx vitest run src/test/PetCareUi.test.tsx src/test/CompanionPage.cosmetic.test.tsx`: 10 testes passaram. Os oito testes montados novos cobrem catálogo vazio, troca de conta, limite e clique duplo, recibo após transporte incerto, espera de recibo A→B, ausência de RPC, participação/cooldown e ação manual sem atualização direta de `companions`.
- `npm run build`: passou.
- `npx tsc --noEmit -p tsconfig.app.json`: falhou em erros já existentes fora dos arquivos desta entrega; não apontou erros nos arquivos tocados.
- `npx eslint` nos arquivos tocados: `usePetCare.ts` e o teste novo passaram; os 12 `no-explicit-any` reportados estão em trechos preexistentes de `ShopPage.tsx`/`CompanionPage.tsx`.

## Limite da evidência

Os testes usam RPCs simulados. Não provam GoTrue, PostgREST, ACL/RLS, liquidação offline, recibos PG17 nem comportamento do esquema publicado. A frente SQL deve validar esses pontos antes de liberação. O painel de combate existente ainda usa seus campos anteriores até revisão separada do contrato de snapshot.
