# Revisão independente de pets na aventura automática

Estado: plano inicial executado; ver `REPORT.md` para o veredito e limites. Base de leitura: `ed51cf02e100021927feb84fc9e06c7b50895ab0`. O SHA integrado final foi fixado no relatório antes da prova.

## Fontes e limite

- Contrato `contract-v1.json` (base SHA, RPCs, gate, snapshots) e `live-sources.json` (oito definições de funções, owner/config/ACL; `companions_count=2`; `anon_insert=false`, `auth_insert=false`). O snapshot remoto é evidência de preparação, não confirma o estado remoto no dia da execução.
- Fonte local `src/lib/pets.ts`: 12 tipos com 10% em `atk`, `def`, `hp` ou `mp`; `mini_kraken` cura 5% de HP, `mini_necromante` regenera 8% de MP, `mini_leviata` reduz custo de MP em 20%. O cliente usa `Math.round`, que arredonda meios positivos para cima. A migração deverá reproduzir isso em valores não negativos e capar HP/MP no máximo; sem ressuscitar o herói derrotado.
- O fixture existente `supabase/tests/economy_composed_20261022` cobre a cadeia de aventura/economia recente, mas precisa ser confrontado com as fontes finais reais e com as oito definições vivas. Um fixture reduzido não prova compatibilidade integral do projeto remoto.

## Matriz de prova para o SHA congelado

| Frente | Cenário e observável exigido |
| --- | --- |
| Metadados e preflight | Comparar full `pg_get_functiondef` normalizado, owner, config, ACL efetivo e sobrecargas de sync/advance, compras, escolha e guards; conferir colunas, RLS, permissões por coluna, triggers e bindings de `companions`; introduzir drift controlado e exigir falha **antes** de mutar schema. Hashes LF dos arquivos fonte. |
| Gate | Gate global desligado, usuário fora e dentro da allowlist, variação de relógio efetivo; pet e RPCs não devem vazar efeito antes da ativação autorizada. Anon não executa seleção nem ganha acesso indireto. |
| Posse e seleção | Um único pet ativo persistente por usuário e por sessão; id forjado, pet de outro UID, tipo sem catálogo, id nulo, repetição/idempotência, troca durante luta e compra/adoção legítima. `INSERT companions` autenticado permanece revogado; mudança de stats de cliente (`level`, `xp`, `atk`, `def`, `max_hp`, `mood`) não muda poder. Guard protege identidade/origem; verificar que leitura de posse não confia só na coluna editável. |
| Bônus | Cenário sem pet e cada um dos 12 tipos; um bônus de 10% apenas no stat canônico correto, inclusive ATK/MATK da classe, equipamento e limite, arredondamento em meio ponto e extremos. Comparar snapshot base/efetivo com cálculo independente. |
| Sustain | Kraken +5% HP, Necromante +8% MP, Leviatã -20% custo MP, com turnos de recurso baixo, zero e perto do máximo, clamp, custo nunca negativo e nenhuma ressurreição. Conferir eventos e payloads antigos opcionais/nulos. |
| Tempo e replay | Backlog gerado antes da seleção sem bônus; seleção/troca só afeta primeira luta elegível posterior ao horário de servidor; snapshots de lutas antigas inalterados após troca, sync, retry e replay. Exercitar predecessor v2 e v3 com/sem pet no catch-up para evitar base nula ou bônus empilhado. Duas sessões concorrentes seleção + sync/advance; sem crédito duplicado, deadlock ou relógio do cliente aceito. |
| Economia/progressão | Sem multiplicador direto de XP, nível, atributos, ouro, itens ou drop; primeiro clear/replay, boss/stage, ledger, baú, receitas e maturação sem regressão; compra e forrageio legítimos mantidos. |
| Frontend | Parsers legados aceitam pet ausente/nulo, estado ativo server-owned, evento de sustain e mensagem de erro persistente. Comparar TS/lint de arquivos vizinhos com baseline e isolar diagnósticos novos; sem browser autenticado neste dispatch. |

## Plano de execução seguido

1. Receber SHA final; confirmar árvore, diff e WIP da integração sem editar arquivos fora de `docs/audits/pets-20261026`.
2. Criar PostgreSQL 17 exclusivo em porta livre, diretório de dados/logs preservado e hash de cada fonte; aplicar cadeia fiel. Falhar fechado se o preflight apontar drift, sem contorná-lo.
3. Rodar probes independentes via RPC pública/roles e duas conexões concorrentes; guardar SQL, stdout/stderr e códigos de saída.
4. Registrar findings com SHA, arquivo, linha, cenário, impacto e esperado; distinguir resultado executado de inferência. Consultar Bug Tracker antes de reportar erro novo; somente o coordenador centraliza escrita nele.
5. Parar com `pg_ctl stop -m fast -w`; registrar exit 0 e `pg_isready` exit 2, sem listener. Declarar limites de fixture, gateway/Auth/browser/produção.

Nenhum push, merge, deploy, escrita remota ou publicação está autorizado neste dispatch.
