# Candidato local de correção — revisão final de hordas (28/10/2026)

## Escopo e estado

Base `59148d56ea42b0ff9890aecdb0b493fde32695ae` no worktree `rpg-auth-foco-20261026`, branch `Scaffx/rpg-hordas-continuas-20261028`. O relatório `20261028-hordas-revisao-final.md` já estava não rastreado e foi preservado. Este é um candidato local para revisão do coordenador; PR 77 continua rascunho, sem commit, push, merge, deploy, SQL remoto ou aprovação deste fix.

## Delta dos três achados

1. **P1, `sync` A→B→A.** `useAutoAdventure` agora associa a consulta ao usuário confirmado e à `continuity.epoch` do AuthProvider. O `AbortSignal` de TanStack é passado ao builder PostgREST por `abortSignal`; uma resposta da geração anterior, uma resposta cuja consulta perdeu uma atualização de cache ou um `server_now` anterior devolve apenas o snapshot já aceito. Cancelamentos não viram erro visível. O resumo é gravado pelo evento `success` do cache, depois do aceite, com deduplicação por objeto. A troca para outro token confirmado da mesma conta cancela e revalida uma vez, conservando a tela; refresh do mesmo vínculo mantém a época e o estado. Nenhum JWT entrou em query key ou log.
2. **P2, projeção SQL.** A migração candidata conserva o preflight original e altera somente a expressão `encounters.end_reason`: `draw` v4 retorna `event_limit`; v3 retorna `turn_limit`. `last_result` e `adventure_battle_payload` já distinguiam essas versões. O teste `draw.sql` agora inspeciona a primeira resposta pública depois da liquidação, a chamada pública seguinte e um registro sintético reclassificado como v3 dentro de transação com `ROLLBACK`.
3. **P2, documentação econômica.** `MECHANICS.md` informa 1–48 ouro por vitória completa, sem teto diário de ouro; o intervalo de 30 minutos condiciona apenas item direto, com limite de dois por dia em São Paulo. O trecho de outros modos foi preservado.

## Evidência executada

- Vitest instalado, sem instalação: **9 arquivos, 35 testes passaram**. `AutoAdventureSyncRace.test.tsx` usa `QueryObserver` real e cobre `before=9, after=9` quando a resposta antiga traz etapa 1, cache de B por identidade de objeto, retorno sob novo token confirmado da mesma conta, refresh sem remount (`mounts=1`), `AbortSignal` entregue ao builder, cancelamento sem erro visível, relógio servidor anterior e ausência de refetch repetido (contagem exata de RPCs). Os testes anteriores de avanço e resumo também passaram.
- ESLint somente nos dois arquivos TS/TSX tocados: saída limpa, código 0. `tsc --noEmit -p tsconfig.app.json` saiu 2 com diagnósticos globais em arquivos não tocados, incluindo `CombatArena.tsx` e `ReportsPanel.tsx`; nenhum diagnóstico apontou os arquivos deste fix. `git diff --check` passou.
- PostgreSQL **17.9 local**: copiei o cluster parado `C:/Users/Murillo/AppData/Local/Temp/rpg-hordas-review-task8aded148eed8/data` para `C:/Users/Murillo/AppData/Local/Temp/rpg-hordas-fix-task483352/data`, porta 55930. No banco sintético `hordes_final2`, que tinha zero linhas v4, restaurei as fontes capturadas `sync.sql` e `payload.sql`, removi a função horde candidata anterior e restaurei o CHECK v3. Hashes MD5 LF pré-migração observados: `sync=1641aa39afd52bcddae1998819c4b330`, `payload=19652de586465e476978672744f83fd5`; CHECK v3 exato. O preflight preservado e a migração candidata passaram com `ON_ERROR_STOP=1`, código 0, `BEGIN` até `COMMIT`.
- O `draw.sql` ampliado passou pelo wrapper `public.sync_auto_adventure()` com `SET ROLE authenticated`, código 0 e `ROLLBACK`: empate v4 devolveu `event_limit` em `last_result`, `last_battle` e `encounters`, inclusive na próxima chamada; a projeção do registro v3 sintético devolveu `turn_limit`. Owner da função privada permaneceu `postgres`, ACL `{postgres=X/postgres,authenticated=X/postgres}`, e `anon` não tem `EXECUTE` no wrapper público. Logs locais em `C:/Users/Murillo/AppData/Local/Temp/rpg-hordas-fix-task483352/logs/`.
- `pg_ctl stop -m fast -w` encerrou o clone; `pg_isready` retornou `no response` em 55930, 55928 e 55929, sem listener em 55930. Dados e logs dos três clusters foram preservados.

## SHA-256 com LF canônico dos arquivos entregues

| Arquivo | SHA-256 |
| --- | --- |
| `src/hooks/useAutoAdventure.ts` | `15b93e3d70e3c4762a3bf4b402235d388891013da88afd0e98ee5201ac5cc780` |
| `src/test/AutoAdventureSyncRace.test.tsx` | `c48fe57fd7f9d302118c5422d7e24619504c1cfb3401169d7ffeed9ab68f97a3` |
| `supabase/migrations/20261028214109_adventure_horde_continuous.sql` | `858c6600d4ec72fb45a833b1cc6b9cc20013497baa5c48f4782219e75e72a39b` |
| `supabase/tests/horde_20261028/draw.sql` | `3416055cbc9e7032a7588577a191c01411015be04e9945f3f96c08c03a93191c` |
| `MECHANICS.md` | `e07eec9b566f75286b7befb91607a47ff32e82a53200fe531d981204417433f6` |

## Limites e próximo gate

O clone usa dados sintéticos e `SET ROLE`, não PostgREST nem navegador autenticado. A definição viva foi a captura sanitizada de 28/10/2026; não houve revalidação remota. O coordenador ainda precisa revisar o delta e decidir sobre freeze/publicação; estes testes locais não aprovam o fix nem demonstram compatibilidade com o schema de produção atual.
