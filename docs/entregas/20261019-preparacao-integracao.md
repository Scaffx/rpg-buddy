# Preparação local da integração — 19/10/2026

## Estado e escopo

- Worktree `Scaffx/rpg-automatico-integracao-20261019`, base limpa `1f49463efbf964ea94160353016af021f3e7c03e`. Onze cherry-picks estáveis, nesta ordem: A `b0f0dc1` → `c74ad92`, `c9bf719` → `e54eb98`, `7b1d446` → `42db567`; B `392dfb8` → `022356f`, `2bc08eb` → `f591818`, `e0f39cb` → `573fbf1`; C `286eb9a` → `cffffdf`, `0677438` → `079242b`, `2f85bb8` → `5cb5207`; D `e1e5ede` → `1dd5a14`; I `2ae12859` → `3740af2`. O commit de contratos/copy e deste relatório vem depois dessa cadeia.
- Único conflito: `src/pages/NpcPage.tsx` no cherry-pick I. A mutação de desafio de NPC ficou indisponível até haver recibo de recompensa e reversão do servidor. O trecho de A que já não creditava XP não foi substituído por um novo crédito; a resolução também não restaura a escrita direta de inventário/ouro do cliente.
- `src/components/AutoAdventure.tsx` e `src/hooks/useAutoAdventure.ts` receberam apenas os três cherry-picks de C. Não foram editados na preparação, pois C4 mudará contrato, bosses, pets e sprite em worktree própria.
- O `node_modules` desta worktree é uma junction para `C:\Users\Murillo\Desktop\RPG-Buddy\rpg-buddy\node_modules`. As verificações não demonstram `npm ci` limpo. A origem suja não foi editada, WIP não commitado e relatório de pré-auditoria não foram integrados.

## Contratos e interface

- `src/integrations/supabase/types.ts` mapeia as tabelas de aventura e inventário, além de `claim_class_gold_reward`, `claim_inventory_kit`, `choose_level3_companion`, `consume_inventory_item`, `ensure_user_balance`, `forage_inventory`, `purchase_game_item`, `set_inventory_attunement`, `set_inventory_equipped`, `sync_auto_adventure` e `use_scroll`. Os callers novos de inventário, ouro, forrageio e equipamento usam o cliente tipado; retornos JSON com campos necessários são verificados antes do uso. Não foi acrescentada supressão de TypeScript ou ESLint.
- O catálogo de pets usa chave de cache com ID de usuário e é invalidado após compra. Isso altera apenas a sincronização da vitrine, sem regra de compra. O retorno de onboarding anterior à migration ainda pode mostrar um XP positivo que o servidor efetivamente tenha creditado; com o contrato novo, esse valor é zero e não aparece como prêmio.
- `pt/en/es/ru/zh` receberam rótulo Aventura, copy de prioridade e ações dos cartões, saúde, onboarding, aventura coletiva e portal. Os cartões deixam claro que XP do checklist é pago na conclusão da missão. A tela de portal não mostra chance de espólio, dungeon ou fragmento como crédito de resultado declarado. `BossPage` usa as traduções do tour.
- `docs/REFORMA_AUTOMATICA_20261019.md` registra a calibração: base 25 XP, alta 50, média 25, baixa 5 antes dos bônus; ouro de missões preservado; aventura a cada 30 minutos, até 24 horas/48 confrontos por sincronização e teto diário de 120 ouro/2 itens; XP e atributos permanentes somente por rotina. Esses números de calibração foram escolhidos pela coordenação, não especificados numericamente pelo usuário. Pets históricos são preservados por entitlement de transição, sem prova retroativa de compra ou vitória.

## Migration de inventário

- `npx --yes supabase@2.121.0 migration new --help` → exit 0; `npx --yes supabase@2.121.0 migration new inventory_authorship` → exit 0, gerou `supabase/migrations/20261019210026_inventory_authorship.sql`. O corpo foi movido do nome manual `20261019190000_inventory_authorship.sql` sem alteração lógica. SHA-256 antes/depois: `41D83F4FBAD3E325BB9289B50F37914B4A1AA52DE94C16135C9B1FB3561742F8`. As referências no teste e na entrega de inventário foram atualizadas.
- A numeração gerada posiciona esta migration depois das migrations estáveis de progressão, aventura, prioridades e fontes de XP presentes nesta preparação. Migrations corretivas dos outros autores ainda podem antecedê-la no pacote final. Nenhuma cadeia histórica foi reaplicada aqui; as guardas e hashes da conciliação `20261019193625_progressao_reversao_checklist.sql` foram preservados.

## Verificação desta preparação

| Comando / comparação | Exit | Resultado e limite |
| --- | ---: | --- |
| `npm run test -- --run` | 0 | 33 arquivos, 240 testes passaram. A primeira execução falhou em 1 teste de onboarding quando a UI ocultava um crédito positivo legado; a indicação fiel ao retorno do servidor foi restaurada e a suíte completa passou. |
| `npm run build` | 0 | Build Vite concluído; aviso de chunk maior que 500 kB. |
| `npx tsc -p tsconfig.node.json --noEmit --pretty false` | 0 | Sem diagnóstico. |
| `npx tsc -p tsconfig.app.json --noEmit --pretty false` | 2 | 53 diagnósticos versus 55 em `C:\Users\Murillo\Documents\Codex\2026-10-15\seguinte-dentro-do-sistema-de-rpg\work\sprint-20261019\baseline-typecheck.log`. Identidade normalizada por arquivo, código TS e propriedade/argumento principal: zero novos, dois `TS2551` antigos removidos. O app não tem typecheck limpo. |
| `npx eslint --format json --output-file <log> <32 arquivos TS/TSX alterados>` | 1 | 201 erros e 14 avisos nos 32 arquivos. Os 24 arquivos com contraparte em `baseline-lint.json` tinham 256 erros e 14 avisos; identidade normalizada por arquivo, regra, severidade e mensagem sem número de linha: zero novos. O baseline global permanece 570 erros/30 avisos; não foi alegado lint global limpo. |
| `git diff --check` e parse JSON dos cinco locales | 0 | Sem marcador de conflito, whitespace inválido ou JSON inválido. |

Os logs temporários de Vitest, build, typecheck e lint foram gravados em `%TEMP%\rpg-integration-*`. O baseline de lint é `C:\Users\Murillo\Documents\Codex\2026-10-15\seguinte-dentro-do-sistema-de-rpg\work\sprint-20261019\baseline-lint.json`. Nenhum teste SQL completo foi repetido contra esta combinação com bloqueadores conhecidos; fixtures autorais e a cadeia corrigida exigem a Task final.

## Pendências para `task_9a48f9207c07`

1. Integrar e revisar os reparos de A4/A5: agenda e estado, atributos distintos, recibos e reversão; de B4: teto de pagamentos, ordem de locks e botão de desfazer na aba Concluídas; de C4: bosses reais, pets, sprite do jogador, calibração de inimigos e novo contrato da aventura. Os commits corretivos desses autores não fazem parte desta preparação.
2. Congelar o SHA do pacote corrigido, comparar o contrato `types.ts` e a copy após C4 e executar a cadeia SQL corrigida em fixture/local DB apropriado. Atestar separadamente teste autoral, auditoria independente, evidência local e estado vivo remoto. A migration de inventário depende de reconciliação com definições, grants e RLS vivos antes de qualquer aplicação.
3. Submeter a revisão independente e ao gate de promoção. Esta preparação não é aprovação, publicação, deploy, push nem evidência de comportamento em produção.
