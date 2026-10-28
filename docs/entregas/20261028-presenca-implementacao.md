# BUG-55 — implementação do heartbeat de presença

## Escopo e base

- [Certo] Checkout `Scaffx/rpg-presenca-20261028`, base `c493e02bebe06d540b1f94bad3a3dde0d254be9e`; implementação restrita a `src/hooks/usePresence.ts`.
- [Certo] A versão base usava `setInterval(beat, 30_000)` sem aguardar a RPC; a reprodução registrada no BUG-55 observou três chamadas pendentes em 60 s. Isso não demonstra a causa do incidente Auth 504.
- [Certo] O método `.abortSignal(signal)` existe no `PostgrestTransformBuilder` instalado e passa o sinal ao `fetch` em `PostgrestBuilder`; a [referência oficial](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal) descreve o mesmo contrato.

## Mudança

- [Certo] O próximo heartbeat só é agendado depois de a RPC anterior liquidar. A guarda por UID permanece entre reexecuções do efeito, inclusive no replay de StrictMode; um novo objeto `user` com o mesmo ID não reinicia o ciclo.
- [Certo] O ciclo ativo exige UID confirmado pelo `useAuth` e aba visível. Ao ocultar, deslogar, trocar conta ou desmontar, limpa timers e aborta a chamada pendente. Conclusões antigas só podem acordar o ciclo do mesmo UID que ainda esteja ativo.
- [Certo] Sucesso usa 30 s desde a conclusão; falhas retornadas ou rejeitadas usam 30, 60 e até 120 s. Cada chamada tem deadline local de 15 s via `AbortController`; um pedido cancelado só libera a guarda quando a promessa liquidar. Não há fila de beats perdidos.
- [Certo] `useAuth`, `authDataGate`, cliente Supabase, banco, policies e economia não foram alterados.

## Validação local

- [Certo] `eslint src/hooks/usePresence.ts`: exit 0.
- [Certo] `git diff --check`: exit 0.
- [Certo] `tsc --noEmit -p tsconfig.app.json`: exit 2 por diagnósticos globais preexistentes, incluindo `update_my_last_seen` ausente dos tipos gerados; a chamada literal da mesma RPC já existia na base. Nenhum diagnóstico novo foi identificado neste arquivo.
- [Certo] `vitest run src/test/usePresence.test.tsx --reporter=dot`: exit 0, 11/11 testes no estado compartilhado às 17:30 local. Cobre RPC pendente, deadline, backoff, visibilidade, logout, unmount, renovação do mesmo UID, troca de UID e StrictMode; o arquivo de testes é de propriedade de outro agente.

## Limites

- [Certo] `AbortController` cancela a espera/fetch do cliente; não prova que o servidor não executou uma RPC já recebida. Se um transporte ou mock ignorar o abort e nunca liquidar a promessa, o hook conserva a guarda e não abre uma segunda RPC para o mesmo UID; nesse caso a presença deixa de renovar até a liquidação.
- [Certo] A verificação local com mock não substitui teste autenticado em navegador nem validação de produção. Sem commit, push, deploy, restart ou escrita remota.
