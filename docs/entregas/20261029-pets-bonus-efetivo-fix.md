# Correção local: bônus efetivo do pet e alimento no inventário

**Checkout:** `rpg-auth-foco-20261026`, branch `Scaffx/rpg-hordas-continuas-20261028`, HEAD de partida `c13d5ab3da2af18987ca2f08cd5793d4f8a10c00`. Revisão de entrada: `20261029-pets-alimentacao-revisao.md`. Bug informado: `408812ac-94d8-8178-b490-da64bdcd6cf4`.

## Mudança

- `autoAdventurePayload.ts` mantém e valida o quarteto congelado pelo servidor: `participation`, `care_as_of`, `effective_bonus` e `effective_sustain`. Snapshot legado sem o quarteto continua válido; quarteto parcial, tipo inválido, percentual fora do intervalo, stat/kind divergente ou sustain efetivo incompatível rejeita o payload. O parser não calcula bônus com relógio, catálogo ou cuidado atual. `base_stats` e `effective_stats` continuam recebidos do servidor.
- `AdventurePetPanel.tsx` mostra o efeito efetivo da **luta atual** com vírgula decimal (`5%` e `2,5%` quando a participação é `0,5`). Suporta zero e até quatro casas no percentual, conforme a precisão de seis casas da fração no SQL. Para snapshot legado mantém o rótulo confirmado anterior. A seleção da próxima luta apresenta os valores nominais como **máximo**, sem prometer que serão efetivos. Nome e demais dados visuais da luta seguem o snapshot congelado.
- O inventário de `ProfilePage.tsx` reconhece os 13 IDs reservados pelo SQL (`b45e1000-0000-4000-8000-000000000001` a `...013`) via `isReservedPetFoodItemId` em `pets.ts`. A comida mostra quantidade e “Estoque de alimentação automática do pet”, sem ação genérica “Usar”; poções e outros consumíveis mantêm “Usar”. A identificação usa IDs canônicos, sem depender de nome traduzido ou de RPC por combate. Novos SKUs futuros exigirão atualizar o classificador junto com o contrato SQL.

## Evidência local

- `npm test`: **95 arquivos, 667 testes passaram**. Cobertura nova: parser de 50%, 75%, 100%, fração e zero; campos malformados/legado; painel React montado com separação entre luta congelada e seleção alterada; inventário React montado com comida sem “Usar”, poção com “Usar” e equipamento preservado.
- `npm run build`: passou.
- ESLint direcionado para parser, painel, `pets.ts` e testes alterados: passou. `ProfilePage.tsx` mantém 74 erros e 3 avisos de lint preexistentes; não há diagnóstico nas linhas alteradas.
- `npx tsc -p tsconfig.app.json --noEmit --pretty false`: **44 diagnósticos**, equivalentes ao baseline informado. Nenhum nos arquivos alterados além dos dois `Settings` duplicados preexistentes em `ProfilePage.tsx:27,32`. O comando `npx tsc --noEmit` sem `-p` não percorre o projeto por causa das referências em `tsconfig.json`.
- `git diff --check`: sem erro de whitespace. Nenhuma alteração SQL, instalação, commit, push, deploy ou consulta remota nesta frente.

## SHA256 após normalização LF

| Arquivo | SHA256 LF |
| --- | --- |
| `src/lib/autoAdventurePayload.ts` | `EB4E0B071BF6464346E88B0EE53657892898E84766CEFF4C72786E6548B5A2ED` |
| `src/components/AdventurePetPanel.tsx` | `33DB1A0AC57CA990B1C60038E88A24D67D5366A304BC5C5613ACF5AA649DDA39` |
| `src/lib/pets.ts` | `46F054C480809BEA4FFC414FE7998C18D3319141EA0C3517A56DFDD6998E87EB` |
| `src/pages/ProfilePage.tsx` | `1C4155AFCBC1A20DE1FDF52BDF694B1A61A22803BC6FAC4608CE97162450E3E2` |
| `src/test/PetCareBattleSnapshot.test.ts` | `129658B2AD5D97EEB0D0CE44B7B9A5998F53125F42407DED69B176BE0CA81375` |
| `src/test/AdventurePetPanel.test.tsx` | `24A6691AD64F60BDBC99F77D62190246961B86BD158EA01C14D27025F4CD094F` |
| `src/test/inventoryBeforeKit.test.tsx` | `B32B3998E6ECA3A47795810A8EF9DF4C35BD411A3FF5C46DB99611065EDB202C` |

## Limites de liberação

O resultado local não libera produção. Permanecem a cadeia SQL completa com ACL efetiva e concorrência em PG17, o teste autenticado de staging (incluindo rótulo de bônus reduzido e resposta perdida) e a medição de custo com pets vencidos e catch-up. A frente SQL pertence a outro worker; o hash da migração citado na revisão congelada não é apresentado aqui como hash atual.
