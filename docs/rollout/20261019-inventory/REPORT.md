# PR 58 — item comprado invisível antes do kit inicial

## Causa e correção

O coordenador reproduziu no produto publicado: uma conta sem `starter_kit_claimed` comprou o **Cajado do Andarilho**, teve ouro `109 → 81` e `user_inventory.quantity = 1`, mas o Perfil mostrava apenas o aviso do Kit de Novato, inclusive após reload. Essa é evidência recebida do coordenador; este worker não consultou banco nem navegador de produção.

Em `src/pages/ProfilePage.tsx`, o ternário começava por `!profile?.starter_kit_claimed`; quando verdadeiro, ele não avaliava `inventory.length` e ocultava qualquer compra ou drop legítimo. Agora o aviso do kit é independente da lista, que aparece sempre que `inventory` tem itens. Se a lista estiver vazia, a aba mantém o aviso e mostra a orientação de obter itens; para quem já resgatou o kit inicial, o texto de kit de classe no nível 5 permanece quando aplicável.

Nenhum resgate automático, mudança de flag, chamada de economia, hook de inventário ou SQL foi adicionado. O botão das missões de boas-vindas ainda navega para `/`.

## Verificação local

| Comando | Resultado | Alcance |
| --- | --- | --- |
| `npm test -- src/test/inventoryBeforeKit.test.tsx` | PASS, 2/2 | Renderiza `ProfilePage` com item comprado antes do kit: nome, botão **Equipar** e aviso de boas-vindas coexistem; não ocorre RPC/ação de inventário automática nos mocks. Também cobre inventário vazio antes do kit. |
| `npm run build` | PASS | Bundle Vite gerado. Avisos já presentes em `PortalEventPage.tsx` para `??` e tamanho de chunk. |
| `npx tsc --noEmit -p tsconfig.app.json` | FAIL global | Erros de tipos espalhados pelo projeto; nenhum erro listado em `inventoryBeforeKit.test.tsx`. Em `ProfilePage.tsx`, o typecheck acusa as duas importações de `Settings` nas linhas 26 e 31, anteriores a esta mudança. |
| `npm ci --prefer-offline --no-audit --no-fund` | FAIL `EUSAGE` | `package-lock.json` já não cobre dependências declaradas, incluindo `@testing-library/dom`. Para executar teste e build nesta worktree, foi usado `npm install --no-save --package-lock=false --prefer-offline --no-audit --no-fund`, sem alteração rastreada no lockfile. |

Os testes usam hooks e transporte simulados para isolar a decisão de renderização. O coordenador ainda precisa validar o Perfil servido em produção com o item da conta de teste, após integrar e publicar o commit; este relatório não afirma smoke de API, SQL ou UI remota.
