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

## Reteste na worktree de integração

Fonte: integração `24a9be1` sobre o merge remoto `9019effe`. O `node_modules` desta worktree é um junction para o checkout original; nele `vitest` existe e `@testing-library/dom` não existe. Nenhum pacote foi instalado e `package.json`/`package-lock.json` não foram alterados neste reteste.

Baseline reproduzido nesse ambiente: `npm test -- src/test/inventoryBeforeKit.test.tsx` falhou ao carregar `@testing-library/dom`; `npm test -- src/test/mobileSidebar.accessibility.test.tsx` falhou em 1 de 4 testes, no assert imediato de foco da linha 128 (`body` em vez do trigger). O código do menu e esse teste não tinham diff contra `9019effe`; a reprodução publicada em 320 px, relatada pelo coordenador, fechou com Escape e devolveu o foco ao trigger.

O teste de inventário agora usa `createRoot` e `act` de React, com consultas ao DOM renderizado: mantém as verificações de nome do item, botão **Equipar** habilitado, aviso e acesso às missões de boas-vindas, ausência de RPC/ação automática e caso vazio. No teste multilíngue do menu, o assert de foco continua em cada um dos cinco idiomas, mas aguarda a condição real `document.activeElement === trigger` por até 1 segundo, com intervalos de 10 ms; o diálogo fechado continua sendo verificado imediatamente. O callback `onCloseAutoFocus` do Radix restaura o foco depois da remoção do diálogo, o que explica a observação transitória de `body` no teste anterior.

| Comando no ambiente base | Resultado após ajustes |
| --- | --- |
| `npm test -- src/test/inventoryBeforeKit.test.tsx src/test/mobileSidebar.accessibility.test.tsx` | PASS, 2 arquivos e 6 testes |
| `npm test` | PASS, 38 arquivos e 263 testes |

Persistem avisos não bloqueantes de React Router no teste de inventário e `useLayoutEffect` no teste SSR de companheiros. Esta suíte local usa mocks para inventário e jsdom para foco; não substitui a validação no navegador publicado nem uma instalação limpa via `npm ci`, ainda bloqueada pelo lockfile.
