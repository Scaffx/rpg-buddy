# Feedback de recusa do portal cooperativo — 2026-10-20

## Diagnóstico

Base `ac882d5afcff483c5d2f06231289d567d79c2027`. `useCoopPortal` lança o objeto `PostgrestError` recebido do RPC. A página extraía `message` apenas de instâncias de `Error`, substituindo a mensagem de um objeto estruturado por `Ação recusada pelo servidor.`; além disso, os `catch` mostravam a recusa somente em um toast transitório. No caso relatado, o portal diário vermelho exigia Lv. 30 e a conta estava em Lv. 1; a sala não foi criada.

O teste novo foi executado antes da correção com `{ code: 'P0001', details: '', hint: '', message: 'Nível mínimo não atendido' }`: cinco casos iniciais falharam porque não havia `role="alert"` na página (`npm test -- --run src/test/PortalEventPage.feedback.test.tsx`, exit 1). O primeiro runner não coletou testes porque a junction de dependências não contém `@testing-library/dom`; usei `createRoot`/`act`, já presentes nos testes do repositório, sem instalar pacotes.

## Correção

- Lê mensagens não vazias de `Error`, objetos de erro do RPC e strings; objetos sem `message` ou mensagens vazias recebem fallback seguro.
- Mantém um alerta acessível na página com título e motivo da recusa para criar, entrar, iniciar, atacar e escanear. O toast existente também permanece.
- Limpa o alerta depois de uma ação bem-sucedida. Os níveis, a cor oculta, as regras de servidor e a economia não foram alterados.

## Verificação

| Comando | Resultado |
| --- | --- |
| `npm test -- --run src/test/PortalEventPage.feedback.test.tsx` | exit 0; 7 testes, incluindo recusa por nível, fallback e limpeza no sucesso |
| `node_modules/.bin/eslint.cmd src/pages/PortalEventPage.tsx src/test/PortalEventPage.feedback.test.tsx` | exit 0 |
| `npm run build` | exit 0 |
| `npm run lint` | exit 1; 590 erros e 28 avisos globais em arquivos fora deste reparo |
| `git diff --check` | exit 0 |

Não houve navegador, chamada ao Supabase, migração ou deploy. Os testes usam hooks simulados e verificam o comportamento da página; não afirmam uma validação de ponta a ponta na conta publicada. O coordenador fará revisão e publicação.
