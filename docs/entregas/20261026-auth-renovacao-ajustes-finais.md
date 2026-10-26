# Ajustes finais da renovação Auth — 2026-10-26

## Base e propriedade

- Revisão de produto iniciada em `73aa106769b2bee1e4294aaaa88ccec47a9b9e5b`; testes de outros owners chegaram em `ba7a8dd90b86efe3fb1af66817a17c564c142dc2` durante a execução. Nenhum arquivo desses owners foi revertido.
- Edição de produto restrita a `src/lib/authDataGate.ts`, `src/components/auth/AuthContinuityBoundary.tsx`, `src/hooks/useAuth.tsx` e `src/integrations/supabase/client.ts`. Novo teste: `src/test/authRefreshRevision.test.tsx`. O coordenador autorizou alterar somente o terceiro caso de `src/test/authRefreshFinalReview.test.tsx` para exigir o comportamento corrigido; as duas asserções negativas iniciais ficaram intactas.

## Correções

1. **Resposta antiga:** `clear()` eleva uma geração de autorização, rejeita prontamente pedidos em voo e aborta o fetch subjacente quando possível. Antes de entregar uma resposta, o gate confere geração, âncora verificada e autorização ainda válida. A renovação confirmada do mesmo vínculo usa a mesma âncora e permite a resposta iniciada sob o token antigo enquanto a identidade segue aprovada. A expiração sem confirmação não entrega resposta privada. O abort do chamador também rejeita o pedido em voo. Isso protege a entrega ao cliente; não desfaz uma mutation que o servidor já executou.
2. **Foco e rolagem:** a fronteira registra nova interação de foco/scroll durante o fallback e respeita essa escolha ao revelar a mesma sessão. Sem interação posterior, restaura o foco e as posições salvas. A retomada de outra identidade segue desmontando a árvore anterior.
3. **Realtime:** `disconnect()` sozinho mantém os canais no SDK instalado. Em `clear()` o gate exige `removeAllChannels()` e impede `setAuth`/`connect` até a retirada terminar. A limpeza captura os canais antigos no início; canais B criados depois da captura sobrevivem e conectam após a aprovação. `expire()` apenas pausa o socket, preservando canais da mesma sessão. O hook usa `clear()` em logout, retry, falha e troca de identidade; usa `expire()` na quarentena recuperável. Se a limpeza assíncrona falhar, o gate mantém Realtime bloqueado.

## Provas locais

| Verificação | Resultado |
| --- | --- |
| `npx --no-install vitest run` em 14 arquivos Auth/rotas | 120/120 testes passaram antes do teste extra de rolagem; o novo caso passou na suíte completa |
| `npx --no-install vitest run --silent` completo | 71 arquivos, 500/500 testes passaram |
| `npm run build` | Exit 0 |
| `npx --no-install eslint` nos seis arquivos tocados | Exit 0, um aviso `react-refresh/only-export-components` em `useAuth.tsx` |
| `git diff --check` | Exit 0; apenas aviso de normalização LF/CRLF no Windows |
| `npx --no-install tsc --noEmit -p tsconfig.app.json` | Exit 2, 44 diagnósticos fora dos arquivos alterados e zero neles; não houve comparação integral com o HEAD |

Os dez testes novos cobrem resposta A após `clear`/B, renovação normal do mesmo vínculo, logout sem reviver resposta, abort em voo, foco normal e foco posterior, rolagem normal e posterior, retirada de canal A antes da conexão B, espera da limpeza e preservação de canais na expiração recuperável. O teste de revisão fria cobre os três achados com as duas negativas originais preservadas.

## Limites e próximo gate

As provas são locais com tokens e rede simulados. Não houve browser, banco, instalação, commit, push nem deploy. O coordenador fará novo freeze e QA autenticado com `refreshSession` real; estes testes não provam expiração real no servidor nem canais contra um backend Realtime ativo.
