# Renovação de Auth sem reset — 26/10/2026

Base congelada: `20d127516dec179639dc650c920aafcf8562de9a` (`Scaffx/rpg-auth-renovacao-20261026`). Implementação local, sem commit, push, deploy ou escrita em Supabase/Notion.

## Contrato implementado

- `TOKEN_REFRESHED` com token diferente mantém a cena e expõe apenas o `user` e a `session` **anteriores** enquanto o JWT anterior ainda não venceu, desde que os dois JWTs contenham `sub`, `iss` e `session_id` iguais e o `sub` seja o UID já confirmado. Esses claims são lidos somente como filtro de rejeição; não autenticam o candidato.
- Cada candidato novo passa por `supabase.auth.getUser(candidate.access_token)` fora do callback de Auth. A sessão nova só é publicada depois de conferir o UID remoto contra o UID alegado e, numa renovação, contra o UID anterior.
- Renovação com claim ausente/divergente, mesmo que `Session.user.id` alegue a pessoa anterior, bloqueia a rota imediatamente e falha após a consulta remota. `TOKEN_REFRESHED` não adota outra pessoa nem outra sessão. `SIGNED_IN` com token diferente continua no fluxo bloqueante, inclusive quando vem de outra aba, porque pode ser login ou recuperação de storage.
- Metadados de `Session.user` não concedem admin. A sessão publicada recebe o `User` confirmado remotamente; a sessão candidata não vaza para o contexto durante a espera.
- Duplicatas do candidato pendente conservam a primeira verificação e seu prazo de 15 segundos. Uma resposta de foco anterior não substitui a renovação mais recente. O timer do JWT antigo permanece ativo até a confirmação do novo token; após ela, é substituído pelo prazo do novo JWT.
- Logout, retry, falha de Auth, UID diferente, timeout e expiração retiram a sessão visível. Bootstrap e `SIGNED_IN` de token diferente ainda bloqueiam até confirmação remota.

## Evidência local

- Antes do fix, `npm run test -- src/test/authRefreshContinuity.test.tsx`: **3 falhas / 4 casos**. O teste observou `loading` durante a renovação e uma nova instância da cena após a resposta.
- Depois do fix, o mesmo arquivo: **16/16**. Cobre formulário, estado local, scroll, foco, token antigo exposto enquanto espera, admin forjado negado, deadline de duplicatas, vencimento antigo, troca de timer, falha remota, UID diferente, logout tardio, JWT de outro UID com `Session.user` falsificado, divergências/ausências de `sub`, `iss` e `session_id` em ambos os tokens, `SIGNED_IN` distinto bloqueante e evento de foco tardio.
- Suíte Auth direcionada sob propriedade desta frente: **50/50** em seis arquivos.
- A sonda independente `authRefreshIndependent.test.tsx` é propriedade da frente QA. Na última execução conjunta, **6/9** passaram e três falharam porque seus JWTs sintéticos omitiam `iss` e `session_id`; o coordenador recebeu a necessidade de atualizar esses fixtures. Não foi editada por esta frente.
- ESLint nos quatro arquivos tocados: **0 erros**, 1 aviso preexistente `react-refresh/only-export-components` em `useAuth.tsx`.
- TypeScript do projeto (`tsc --noEmit -p tsconfig.app.json`): **44 erros** em arquivos fora desta mudança; a saída completa foi pesquisada e não contém erro nos quatro arquivos tocados.
- `npm run build`: **passou**; apenas avisos de dados Browserslist antigos e tamanho de chunk.

## Compatibilidade de testes

Com propriedade adicional concedida pelo coordenador, `authFocusStability.test.tsx` e `authFocusExpiryFinal.test.tsx` passaram a esperar cena e sessão anterior visíveis durante uma renovação da mesma pessoa. Os JWTs simulados nesses dois arquivos agora incluem `iss` e `session_id` para representar a continuidade da mesma sessão real. Os asserts de confirmação remota, metadados não confiáveis, resposta antiga e expiração permanecem. O bloqueio de bootstrap e de `SIGNED_IN` com token diferente não foi alterado.

## Limite

Os testes usam mock de Supabase Auth e uma rota representativa em jsdom. Esta entrega não prova sessão real no navegador, transição de rede/Auth em produção, nem a integração do coordenador. O arquivo `App.tsx` não foi alterado.
