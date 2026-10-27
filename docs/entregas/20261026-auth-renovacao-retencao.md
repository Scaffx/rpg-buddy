# Retenção da rota durante renovação Auth — 2026-10-26

Base de produto informada: `ad9350777fe02cb740d5b8dc47250ec4ef8055ad`. Implementação local no worktree `rpg-auth-foco-20261026`, sem commit, deploy, browser ou banco.

## Contrato implementado

- `AuthProvider` conserva `user/session` já confirmados enquanto o JWT anterior ainda está válido e um refresh da mesma sessão aguarda `getUser(novo JWT)`. O evento só passa a expor o novo usuário e token depois da confirmação remota dos bytes exatos, da validade de `exp`, do UID e do vínculo `iss + session_id`. Metadata alegada pelo evento não concede admin.
- No `exp` anterior, ou na volta de aba já expirada, o provider zera imediatamente `user/session` públicos e a aprovação de dados. A âncora privada do UID confirmado, emissor e sessão serve exclusivamente para decidir se a árvore oculta pode voltar. Um `SIGNED_IN` tardio do JWT expirado não reinicia a espera; um `SIGNED_IN` com novo JWT e mesmo vínculo pode retomá-la.
- A fronteira `AuthContinuityBoundary` fica antes de `Routes` e dos hooks dos guards. Suspense retém a página montada com estado local, oculta o DOM, aplica `inert` e `aria-hidden`, e mostra estado de confirmação. Na retomada do mesmo vínculo restaura foco e posições de rolagem da árvore e da janela. Falha, logout, timeout ou conta/sessão diferente alteram a chave de montagem e descartam a página antiga.
- Uma espera sem evento novo depois do vencimento dura no máximo 15 s. Renovação em andamento mantém o prazo original, inclusive depois do `exp`; duplicatas não o estendem. `getUser` pode terminar depois do `exp` anterior se o novo JWT ainda for válido e o prazo não venceu. Toda resposta antiga é descartada pela versão monotônica.
- `authDataGate` intercepta o `fetch` configurado no cliente Supabase. Auth permanece acessível para confirmação. REST, Functions e Storage só transmitem JWT de usuário aprovado e não expirado; candidato espera aprovação por até 15 s ou rejeita em abort/falha/troca de token. Chamadas públicas com Bearer exatamente igual à chave pública continuam acessíveis sob RLS. A credencial candidata nunca é convertida em anônima.
- Realtime é usado em mensagens diretas, assinatura, lobby e combate. O cliente filtra a troca antecipada de `setAuth` feita pelo SDK, desconecta durante a quarentena, bloqueia `connect` sem token aprovado e reconecta os canais conservados apenas após nova aprovação. Não há chamada Auth assíncrona dentro do callback de estado.

## Provas locais

- `npx --no-install vitest run src/test/authRefreshContinuity.test.tsx src/test/authRefreshRetention.test.tsx src/test/authDataGate.test.ts --reporter=dot`: **30/30** cenários próprios passaram. Cobrem renovação normal e atravessando `exp`, rascunho/estado/foco/rolagem, bloqueio de I/O candidato, aba expirada, ausência de novo evento, duplicata sem novo prazo, erro, logout, nova conta, `SIGNED_IN` com mesmo vínculo, abort, reconexão Realtime e chamadas Auth/públicas.
- `npx --no-install vite build`: passou. `npx --no-install tsc --noEmit -p tsconfig.app.json`: nenhum erro nos arquivos alterados; erros em outros módulos já presentes na base. ESLint dos arquivos próprios: zero erros, um aviso preexistente de Fast Refresh em `useAuth.tsx`.
- O teste independente de QA permaneceu sob propriedade de QA. Dos 16 casos, 15 passaram; o caso `blocks at confirmed-token expiry while a refresh is pending and ignores its late answer` ainda exige falha imediata no `exp`, incompatível com a retenção de 15 s pedida agora. A expectativa deve ser atualizada pelo owner de QA para cobrar identidade pública nula, rota oculta e aceitação da confirmação válida dentro do prazo. Não foi relaxado por esta frente.

## Limites

O teste React/jsdom prova a retenção estrutural e a guarda de rede por unidade. Ele não mede comportamento de foco, rolagem, WebSocket e canais em navegador real, nem confirma comportamento de Auth em produção. O coordinator deve repetir a verificação independente com a expectativa de expiração atualizada e executar o fluxo visual autenticado antes de integrar.
