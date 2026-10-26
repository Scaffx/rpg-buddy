# Parecer independente: pets na aventura automática

**Veredito local:** matriz PG17 aprovada no SHA congelado; nenhum finding aberto no backend de pets. A execução focalizada de frontend mostrou um teste legado intermitente, descrito abaixo. Isto não aprova produção.

## Fonte e escopo

- Base comum: `ed51cf02e100021927feb84fc9e06c7b50895ab0`.
- Contrato: `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/pets-combate-20261026/contract-v1.json`.
- Snapshot de oito funções e permissões vivas: `live-sources.json` no mesmo diretório. O snapshot é uma entrada capturada, não uma confirmação do estado remoto na data da auditoria.
- Fonte final auditada: `C:/Users/Murillo/orca/workspaces/rpg-buddy/rpg-pets-integracao-20261026`, SHA congelado `d453783f21650cc3f4e71f5eaaaa99eaa2b09ffb`, árvore limpa antes e depois. Migração `supabase/migrations/20261026185325_adventure_pets_authoritative.sql`, SHA256 LF `B49428C7C96A99234C7695AEFA98480275286EDE20CA6EC5379E06447433671B`.
- PostgreSQL 17 local em porta própria, fixture econômico composto com cinco predecessores conferidos por SHA256 LF, complemento de identidade/ACL e comparação do catálogo antes e depois. Nenhuma escrita remota.
- Execução final: `run-local.ps1 -ExpectedSha d453783f21650cc3f4e71f5eaaaa99eaa2b09ffb -ProductRoot C:/Users/Murillo/orca/workspaces/rpg-buddy/rpg-pets-integracao-20261026 -Port 55899 -RunDirectory "$env:LOCALAPPDATA/Temp/rpg-pets-independent-final-d453783f-55899"`. Evidência preservada em `%LOCALAPPDATA%/Temp/rpg-pets-independent-final-d453783f-55899/logs`.

## Reprodução preliminar, antes do SHA final

| Evidência executada | Fonte e cenário | Resultado preliminar e impacto | Resultado final |
| --- | --- | --- | --- |
| ACL nulo | Migração inicial integrada em `12f8122d69397791002c3f64cbd7ec7f991ca6e1`, arquivo da migração, linha 24; `public.buy_pet(text).proacl=NULL` e `anon` com EXECUTE efetivo | Migração exit 0 e DDL presente; o preflight aceitava ACL divergente. Esperado exit 3 antes de DDL. | Corrigido em linha 24 (`IS DISTINCT FROM`); reteste exit 3, sem `adventure_pet_rollout`. |
| Sobrecarga | Mesma fonte; função preexistente `public.set_active_adventure_pet(text)` concedida a `anon` | Migração exit 0, duas assinaturas e DDL presente; risco de RPC ambígua/executável por `anon`. Esperado exit 3 antes de DDL. | Corrigido em linha 62 (exclusividade); reteste exit 3, sem DDL. |
| ACL efetivo por associação de papéis | Candidato motor `7d9ac7f6613cb58d7939b57529a9cd3ceb919b2d`; `GRANT authenticated TO anon` somente em cluster PG17 descartável | `has_function_privilege(anon,buy_pet,EXECUTE)=true`; migração exit 0, DDL presente e nova RPC executável por `anon`. Esperado exit 3 antes de DDL. | Corrigido em linhas 25–30 (ACL efetivo); reteste exit 3, sem DDL, associação revogada. |

O primeiro candidato usou SHA256 LF da migração `FE997896ECE3F154B9D0E8DA5C6235EABEFAAB42DADE67B9B11EA10AECAD7C78`; o segundo, `12BE5F51A6E500097C47179764EACE96231EAEA36CDA81CE47C1127A2F7EFACA`. Logs da reprodução: `%LOCALAPPDATA%/Temp/rpg-pets-independent-preflight-55897/logs`. Os três achados pertencem à recorrência documentada BUG-30 e foram reportados ao coordenador para a escrita centralizada.

## Matriz final

| Cenário | Resultado no SHA congelado | Evidência |
| --- | --- | --- |
| Fonte, hash LF e catálogo antes/depois | PASS: 28 fontes do bootstrap, cinco predecessores com hash LF, oito funções do snapshot com definição completa/owner/config/ACL sem mismatch; funções preservadas, colunas e triggers idênticos antes/depois | `bootstrap.log`, `catalog-before.json`, `catalog-after.json`; `compare_catalog.py` exit 0 |
| Gate, posse, seleção, anonimato, stats forjados e economia direta | PASS: gate escuro; pet próprio ativado, estrangeiro/forjado negados, anônimo sem RPC; stats arbitrariamente altos em `companions` não entram no snapshot; XP e ouro não mudam na criação da luta | `pets_positive-behavior.log`, `pets_positive-metadata.log`, ambos exit 0 |
| Doze tipos e três sustains com arredondamento, clamp e derrota | PASS: 12 tipos em batalha no teste autor; 12 entradas no catálogo independente; Kraken 5%, Necromante 8%, Leviatã 20%, meio ponto, cap, zero e derrota em teste independente | `pets_positive-author-matrix.log`, `pets_positive-catalog.log`, `pets_positive-sustain.log`, exit 0 |
| Compra legítima, ledger e elegibilidade de forrageio | PASS: `buy_pet` como `authenticated` após clear sintético válido, débito/preço/histórico, registro elegível e seleção por RPC | `pets_positive-purchase-provenance.log`, exit 0 |
| Backlog, troca, snapshot e replay | PASS: offline autor confirmou backlog anterior sem bônus e snapshot imutável; duas sessões independentes serializaram seleções e liquidação/replay com um first-clear, um crédito de ouro, sem deadlock. O avanço do relógio da batalha foi uma intervenção de fixture como `postgres`; seleções e sync usaram RPCs. | `pets_positive-author-offline.log` e `two-session/*`, exit 0 |
| Drifts de corpo, ACL bruto, ACL nulo, associação de papéis, sobrecarga, colunas e trigger | PASS: os sete cenários retornaram exit 3 e `to_regclass('app_private.adventure_pet_rollout') IS NULL`; associação de papéis revogada e `pg_has_role=false` | `pets_drift_*-reject-*.log`, `postgres-restore-role-membership.log` |
| Frontend, parser legado, estado e mensagem de cura | Primeira execução focalizada: cinco arquivos, 26/26 exit 0, incluindo pet ausente/nulo, RPC de seleção e texto da cura após ataque inimigo. Segunda execução dos mesmos testes: 25/26 exit 1, falha intermitente no teste legado de avanço. Caso isolado: 1/1 exit 0. Avisos `act(...)` não fatais no teste de estado. | `frontend-targeted-vitest.log`, `frontend-sync-isolated.log`; build e suíte completa 390/390 são evidência informada pelo coordenador, não rerodadas aqui |
| Teardown PG17 | PASS: cluster próprio porta 55899, `pg_ctl stop` exit 0, `pg_isready` exit 2, sem listener | Saída de `run-local.ps1`; `INDEPENDENT_PG17_PASS` depois do teardown |

## Limites já identificados

- O fixture composto local não contém `public.forage_inventory(uuid)`, `public.inventory_forage_claims` nem `public._anchor_status_today(uuid,date)`. A prova local cobre compra real por RPC, ledger e registro de elegibilidade; não cobre execução de forrageio ponta a ponta. A migração de pets não modifica a definição do forrageio.
- O fixture cobre predecessor econômico e testes de receitas/baús, mas é reduzido frente ao projeto remoto. PG17 local e build não certificam Auth, PostgREST, navegador, rollout, deployment ou produção.
- O coordenador informou que executou o bloco `DO preflight` da migração congelada na Primary em `BEGIN READ ONLY`/`ROLLBACK` e obteve `PETS_LIVE_READ_ONLY_PREFLIGHT_PASS` (`live-preflight-readonly.json` no diretório do contrato). Esta é evidência do coordenador sobre compatibilidade de metadados remotos, distinta da execução PG17 desta auditoria; não aplica a migração nem testa Auth.
- A revisão de interface é estática e de testes locais; QA autenticado pertence ao coordenador.

## Observação de teste legado, fora da posse da auditoria

- SHA `d453783f21650cc3f4e71f5eaaaa99eaa2b09ffb`, `src/test/AutoAdventureSync.test.tsx:110`: em uma execução conjunta, `expect(container.textContent).toContain('3:0:0')` encontrou `2:0:0advance`, após o clique iniciar `void advance.mutateAsync(...)` na linha 48. O mesmo conjunto passou 26/26 na execução anterior e o caso isolado passou 1/1. `src/test/AutoAdventureSync.test.tsx` e `src/hooks/useAutoAdventure.ts` são idênticos à base `ed51cf0` (`git diff --name-status` vazio).
- Impacto observado: instabilidade do teste em execução conjunta, sem evidência de falha funcional do pet. Inferência provável: o `mutateAsync` não aguardado permite que a asserção leia o DOM antes da atualização; não há confirmação por navegador. Esperado: o teste deve esperar a conclusão observável do avanço antes de afirmar o estágio. Bug Tracker consultado por `AutoAdventureSync`, `advance rewards` e `act React test`, sem ocorrência específica; nenhuma escrita no Notion ou edição fora de `docs/audits/pets-20261026`.
