# Compatibilidade da suíte de Auth — 2026-10-26

## Escopo e base

- Produto congelado em `73aa106769b2bee1e4294aaaa88ccec47a9b9e5b`; nenhuma alteração de produto.
- Propriedade desta frente: cinco testes de Auth/rotas, `src/test/authSessionFixtures.ts` e este relatório. `authRefreshFinalReview.test.tsx` e seu relatório são da revisão fria.
- Log inicial fornecido: 20 falhas em 486 testes, concentradas nos cinco arquivos desta frente. O contrato foi conferido em `work/auth-renovacao-20261026/CONTRATO-REVISAO.txt` da pasta de trabalho do coordenador.

## Causa e diferenças semânticas

1. Os testes positivos antigos ofereciam tokens opacos (`test-token`, `confirmed-token` etc.). `getUser(token)` podia confirmar o UID, mas `AuthProvider` exige também `exp` legível e futuro antes de adotar o candidato. Troquei os positivos por JWTs sintéticos com `sub`, `iss`, `session_id` e `exp`; a assinatura é fictícia e a confirmação remota continua mockada explicitamente. A asserção de `getUser` ainda verifica o token entregue.
2. A expiração do JWT confirmado agora corta `user`, `session`, admin e conteúdo público imediatamente e entra em `loading` por um prazo máximo de 15 segundos. Ajustei as asserções que esperavam `retry` no instante da expiração: `retry` é exigido ao fim do prazo sem candidato válido. `expires_at` alegado pelo evento não prolonga a validade real do JWT. Usei relógio simulado alinhado ao segundo para testar o limite exato.
3. Um JWT sintético sem `exp` permanece negativo mesmo quando `getUser` retorna o mesmo UID: o teste agora exige `retry`, admin negado, sessão não exposta e nenhuma cena privada.
4. Acrescentei o caso em que o token antigo expira durante uma verificação de foco: a resposta antiga não reabre acesso; um novo token da mesma âncora, confirmado dentro do prazo, restaura acesso. Esse teste verifica a retomada de identidade, sem alegar retenção de árvore React; a retenção efetiva pertence aos testes integrados novos.
5. Permanecem as negativas de metadata/admin, UID divergente, bootstrap tardio, logout, retry, timeout, ordem das respostas, acesso gratuito, onboarding e admin confirmado.

## Execução

| Verificação | Resultado |
| --- | --- |
| `npx --no-install vitest run` nos cinco arquivos da frente | 5 arquivos, 42/42 testes passaram |
| `npx --no-install eslint` nos seis arquivos alterados sob esta propriedade | Exit 0, sem apontamentos |
| `git diff --check` | Exit 0; apenas aviso de normalização LF/CRLF do Git no Windows |
| `npx --no-install vitest run` na suíte completa | 69 arquivos passaram, 1 falhou; 488/490 testes passaram |

As duas falhas da suíte completa estão exclusivamente em `src/test/authRefreshFinalReview.test.tsx`, de outra propriedade. A revisão do produto confirma o mecanismo: `AuthDataGate.fetch` devolve a resposta de um pedido já iniciado depois de `clear()` e `approve()` trocarem a identidade, porque não revalida a aprovação após `fetch`; `AuthContinuityBoundary` chama `saved.focused.focus()` na retomada mesmo quando outro elemento recebeu foco depois. Escalei ambos ao coordenador como possíveis bugs de produto e não alterei as asserções nem os arquivos alheios.

Não houve browser, banco, instalação, commit, push ou deploy. Esta evidência é local e não substitui QA autenticado nem validação de expiração real no servidor.
