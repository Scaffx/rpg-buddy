# Acesso gratuito: rotas e shell autenticado

Base de integração: `32c27d396519150f00ddbb8106aa62d1b08fb951` em `Scaffx/rpg-pets-integracao-20261026`. Escopo desta entrega: `src/App.tsx`, `src/components/AppLayout.tsx`, `src/components/AppSidebar.tsx` e `src/test/freeAccessRoutes.test.tsx`.

## Mudança

- `ProtectedRoute` deixou de consultar assinatura, trial ou pagamento. Continua exigindo usuário do `AuthProvider`, que confirma token e identidade com `supabase.auth.getUser(token)`, e mantém o perfil e onboarding obrigatórios nas rotas do jogo.
- `LandingRoute` encaminha qualquer usuário confirmado a `/`; visitante permanece na Landing pública. Conta sem assinatura chega a `/companheiro`, `/boss` e demais rotas protegidas.
- `/admin/releases` exige `app_metadata.role === "admin"` do usuário confirmado. A rota mantém a exceção de onboarding para administradores; o backend continua responsável pelas permissões das operações.
- O shell removeu banner de modo de pagamento, aviso de expiração, botão e diálogo de códigos Premium, e badge de trial. Os componentes legados não foram alterados.

## Evidência local

| Verificação | Resultado |
| --- | --- |
| `npx --no-install vitest run src/test/freeAccessRoutes.test.tsx src/test/authLoadingRecovery.test.tsx` | Exit 0; 21/21 testes. O novo arquivo cobre conta sem assinatura em `/companheiro`, `/boss` e `/landing`; visitante; onboarding; admin confirmado e papel armazenado divergente; token com identidade divergente. A assinatura é simulada inativa e ainda carregando, e o hook de assinatura não é chamado. |
| `npx --no-install vitest run src/test/mobileSidebar.accessibility.test.tsx` | Exit 0; 4/4 testes. Uma execução inicial em conjunto falhou na restauração de foco de um teste existente; a execução isolada passou. Causa da oscilação não confirmada. |
| `npx --no-install tsc --noEmit -p tsconfig.app.json` | Exit 2; 44 diagnósticos, mesmo total do baseline informado. Nenhum diagnóstico nos quatro arquivos desta entrega. |
| `npx --no-install eslint src/App.tsx src/components/AppLayout.tsx src/components/AppSidebar.tsx src/test/freeAccessRoutes.test.tsx` | Exit 1; três erros `no-explicit-any` e um aviso de dependência de hook em linhas preexistentes de `AppLayout` e `AppSidebar`, não tocadas pelo patch. |
| `git diff --check` | Exit 0; sem erros de whitespace. |

O teste usa o `AuthProvider` real e simula apenas a resposta remota de `getUser`, o perfil e as páginas carregadas por rota. Esta é prova local de roteamento, não de sessão real, autorização do banco, navegador, publicação ou produção. Publicação de código, licença e destino de doação dependem das definições do coordenador/usuário e não foram inventados nesta frente. Outros agentes editam arquivos distintos no mesmo checkout.

Revisão React: ordem dos hooks preservada, rotas continuam carregadas sob demanda, o estado do diálogo removido saiu com sua interface e a recuperação de Auth mantém mensagem persistente.
