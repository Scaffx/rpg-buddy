# Cena, baús, jornada e compra avulsa — coordenação de 31/10/2026

[Certo] Candidato no PR #77, ainda rascunho. Base desta rodada `9a00224ec1d79cfeed87aca5d5c85cf95a193402`, branch `Scaffx/rpg-hordas-continuas-20261028`, worktree `rpg-auth-foco-20261026`. Produção conferida nesta rodada em `8955e80a3e5f358b4ae2360d4e67eb39518e3a39`; nenhuma migração remota, promoção de produção ou cobrança foi realizada. O diretório `work/` já existia sem versionamento e foi preservado fora da entrega.

## Resultado implementado

- A cena permanece durante recuperação offline. Só uma batalha atual confirmada permite ataques, HP e eventos de combate; sem isso, há exploração animada, HP desconhecido e aviso separado. “Confrontos recentes” e o cartão de último resultado saíram da interface; recibos internos permanecem.
- Novos baús sorteiam quantidades e equipamento no servidor, com regras congeladas, probabilidades visíveis e pool permitido. Equipamentos exclusivos de bosses ou receitas ficam excluídos. Baús antigos mantêm conteúdo e horários.
- Uma abertura inicial, segunda por 6.000 ouro e terceira por 18.000 ouro, permanentes e sequenciais. Os quatro espaços de armazenamento continuam independentes. Quarta abertura por compra única de R$ 9,90, indisponível por padrão até configurar e validar Paddle.
- Checkout associado a pedido durável, confirmação de usuário, assinatura de webhook e rechecagem de transação/preço. SDK, doação e dados enviados pelo navegador não concedem o benefício. Resultado incerto não cria automaticamente outra cobrança.
- História dos cinco reinos e pequenas escolhas opcionais, persistidas por usuário/ciclo/capítulo. As decisões não bloqueiam a aventura e não geram XP ou atributos.
- Quinze ofertas pagas da Loja do Tempo passam a 1.200–8.000 ouro. Os valores iniciais dos desbloqueios e da loja devem ser recalibrados com ganhos reais; não há evidência de equilíbrio de longo prazo nesta rodada.

## Agentes e revisão

[Certo] Orca 1.4.245, run `run_e22dc6a87e9d`, agentes GPT-6-Sol com esforço xhigh comprovados nos recibos de lançamento. Quatro tarefas concluídas: cena/histórico (`task_d68285f8a940`), baús/economia (`task_c1dfda0e5554`), jornada (`task_29948008da9d`) e cash/revisão (`task_797e46ce8f10`). Os workers foram liberados e as entregas aceitas. A coordenação integrou loja, painéis e retomada de compras, revisou os contratos e reuniu a prova local.

[Certo] A revisão encontrou e corrigiu uma concessão herdada de TRUNCATE em tabelas novas de baús: clone negativo reproduziu instalação insegura antes do postflight, e depois recebeu exit 3 sem tabelas parciais. Também foram corrigidos IDs reais da Loja do Tempo, escolha de jornada preservada após recuo, retomada de pedido entre navegadores, leitura reativa de disponibilidade cash, preflight CORS com `x-client-info` e supressão de cupons no checkout.

## Verificação e seus limites

| Prova | Resultado e alcance |
| --- | --- |
| Suíte local completa | 724 testes em 102 arquivos, exit 0. Após os últimos ajustes de texto e temporizador, nove testes focais de UI/SDK passaram. |
| Build Vite | Exit 0; avisos já conhecidos de tamanho de bundle e Browserslist. |
| TypeScript do app | 44 diagnósticos preexistentes, exit 2; nenhum diagnóstico novo nos caminhos alterados. |
| ESLint direcionado | Caminhos novos/alterados verificados; `src/lib/paddle.ts` ainda tem um `any` global preexistente, contra dois na base. Não é prova de lint global limpo. |
| PG17 por módulo | Assertions públicas, identidade, RLS/ACL efetivos, drift, recibos, atomicidade e concorrência; detalhes nos relatórios de baús, cash e jornada. |
| Três migrações de 31/10 juntas | `20261031_chest_cash_pg17.ps1 -IncludeJourney -Port 55796`, exit 0; ordem baús → jornada → pedidos, assertions finais e concorrência, com parada exit 0 e `pg_isready` exit 2. Base reduzida de economia; não é a cadeia integral do PR #77. |
| Deno | 2.9.8, `check` dos dois entrypoints Edge, exit 0. Tipagem, sem execução HTTP real. |
| Navegador Orca | Prévia externa com os componentes reais e dados ilustrativos. Cena durante pending, HP desconhecido, ausência de histórico, pausa, escolha narrativa e ampliações 2/3 exercitadas. Em 390×844, captura visual conferida e largura do documento 390. Em 1280×900, DOM sem overflow; a captura apresentou repetição de colunas e foi descartada como prova visual de desktop. |

[Certo] A primeira execução completa expôs um teste de cuidado de pet com data fixa já vencida. O teste passou a congelar e restaurar `Date.now` na data da própria fixture; lógica de produto dos pets não mudou. A suíte completa final passou após esse ajuste.

[Certo] Hashes SHA-256 de UTF-8/LF canônico:

| Migração | SHA-256 |
| --- | --- |
| `20261031044207_chest_parallel_loot_time_shop.sql` | `bf122f6e1a5526312374c9787f68a53e3606f719f5bb025157c851386ccf4416` |
| `20261031044228_adventure_journey_choices.sql` | `ca1f04f515e9826318e929825c73e570e4f76741ac40b7ddb7d19674d38fcc17` |
| `20261031050256_chest_cash_checkout_orders.sql` | `2d74a4d084e0b1b3862e11e8e4bd8c8e626972d5d1b62a77e182fb4b41872551` |

[Certo] Logs da integração final: `C:/Users/Murillo/AppData/Local/Temp/rpg-cash-20261031-20261031-024539/logs`. Testes, build, Deno e capturas desta rodada: diretório externo `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/reforma-20261031`. Nenhum binário, segredo, cache ou fixture de prévia entra no PR.

## Pendências de publicação

[Certo] O usuário informou não possuir projeto Supabase separado. Docker e Podman não estão disponíveis nesta máquina. PG17 e mocks não substituem GoTrue/PostgREST nem a conta de teste com o backend novo; a aba de produção do perfil Orca abriu sem sessão. Não há prova autenticada dos fluxos novos nesta rodada.

[Certo] Cash permanece desativado. Faltam preço avulso live, destino/segredo do webhook, validação do total BRL 9,90 e prova do procedimento de reconciliação de pedidos `creating` após resposta perdida. O procedimento manual e os gates constam de `20261031-cash.md`.

[Certo] Continuam abertas as pendências anteriores do PR #77: P2 de 4.097 refeições vencidas sem progresso; cadeia lexical completa incluindo D-1, horda e alimentação; custo com pets vencidos e limite de 256 lutas/1.200 eventos; preflight efetivo do alvo; teste autenticado com habilidades/pet, duas abas, resposta perdida e dungeon cooperativa. A recuperação da animação tem hunk mínimo documentado em `20261031-cena.md` caso precise sair em correção separada sobre o contrato v3 publicado. Não copiar o componente v4 inteiro para main.

[Certo] Evidências por módulo: `20261031-cena.md`, `20261031-baus-servidor.md`, `20261031-jornada.md` e `20261031-cash.md`. O PR deve continuar rascunho até concluir esses gates; a prévia de frontend não instala SQL.
