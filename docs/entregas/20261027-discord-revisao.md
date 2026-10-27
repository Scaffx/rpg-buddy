# Revisão independente do login Discord — 27/10/2026

## Escopo e evidência inicial

- Worktree: `rpg-auth-foco-20261026`; baseline: `ce1ec0f432aee9da8a98c6c9136ad0c715cfaf97`.
- Propriedade desta revisão: `src/test/authDiscordIndependent.test.tsx` e este relatório. Produto e testes do construtor não foram editados.
- Contrato inspecionado: `src/pages/Auth.tsx` no baseline e `src/lib/nativeAuth.ts` local. O teste monta a página `Auth` com `createRoot`/`act`, simula apenas as dependências externas e usa `signInWithDiscord` real.
- O coordenador relatou duas respostas 504 em `authorize`, timeout no health check e `SELECT 1` respondendo. Essa é evidência de diagnóstico externo a esta revisão; não atribuí a causa remota ao cliente. Esta revisão cobre recuperação local da UI e preservação do fluxo nativo.

## Negativos no baseline

Comando: `node_modules/.bin/vitest.cmd run src/test/authDiscordIndependent.test.tsx --reporter=verbose`.

Resultado inicial: **1 passou, 5 falharam**. Falharam alerta persistente após erro, liberação do botão após promessa pendente e após retorno sem navegação, retry após timeout e guarda de clique duplo. Passou a chamada nativa com `redirectTo` de deep link, `skipBrowserRedirect` e `Browser.open`.

## Critérios de aceitação da revisão final

1. Falha de autorização libera o botão e mostra mensagem persistente na página sem expor URL ou token em página/toast.
2. Promessa pendente ou resolvida sem navegação não prende indefinidamente o botão; a pessoa pode tentar de novo.
3. Rejeição tardia da primeira tentativa não afeta a segunda; cancelar ou retornar à aba libera a espera; conclusão após desmontagem não produz novo toast.
4. Cliques duplos na mesma renderização iniciam uma única autorização.
5. O caminho nativo mantém deep link, `skipBrowserRedirect` e abertura do navegador do sistema.

## Resultado final

**Aprovação explícita da recuperação local da UI no SHA `75a67686b6a1e45f4b45e31ff24ae030f49be980`.** O diff `ce1ec0f..75a6768` instala espera limitada a 15 segundos, aviso persistente e seguro, cancelamento, tratamento do retorno à aba, guarda síncrona contra clique duplo e descarte de respostas de tentativas antigas. `src/lib/nativeAuth.ts` não mudou; o teste exercitou o caminho nativo real com Supabase e `Browser.open` simulados.

- `vitest run src/test/authDiscordIndependent.test.tsx src/test/authDiscordRecovery.test.tsx --reporter=verbose`: **13/13 passaram**, sendo **8/8 independentes**.
- `eslint src/test/authDiscordIndependent.test.tsx`: exit 0.
- `tsc --noEmit -p tsconfig.app.json`: exit 2, 67 linhas de diagnósticos no projeto; nenhuma aponta para `src/test/authDiscordIndependent.test.tsx` ou `src/pages/Auth.tsx`. Não trato o typecheck global como aprovado.
- `git diff --check ce1ec0f..HEAD`: sem erro. Após o congelamento, somente os dois arquivos desta revisão permanecem novos, além do diretório `work/` preexistente e fora de propriedade.

**Limite:** os testes usam jsdom e respostas simuladas. Não comprovam OAuth remoto, callback publicado, navegador real, nem a recuperação do Auth cloud. Uma autorização já entregue ao SDK ainda pode navegar tardiamente; esta UI só ignora seu resultado antigo e não usa esse resultado para autorizar identidade. O fluxo remoto continua a cargo do coordenador.
