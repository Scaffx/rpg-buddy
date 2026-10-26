# Acesso gratuito e apoio voluntário — frente pública

Data: 2026-10-26  
Base observada: `32c27d396519150f00ddbb8106aa62d1b08fb951` (`Scaffx/rpg-pets-integracao-20261026`)

## Alterações

- A landing mantém login e cadastro e não abre paywall para assinatura expirada. O bloco mensal/anual e o modal de checkout foram removidos. A página mobile também deixou de renderizar `SubscriptionPaywall`.
- `ProjectSupport` aparece nas duas páginas: informa acesso gratuito, mostra o repositório open source sob MIT em `https://github.com/Scaffx/rpg-buddy` e explica que doações são opcionais, sem bônus, vantagem ou acesso adicional.
- `VITE_DONATION_URL` é opcional para PayPal ou página de apoio. Apenas uma URL HTTPS absoluta, sem credenciais embutidas, produz um link de doação. `VITE_DONATION_PIX_KEY` também é opcional e aceita somente chave aleatória UUID v4. Uma chave válida aparece em campo legível com botão de cópia; erro de cópia permanece visível e orienta cópia manual. Sem destino válido, aparece a mensagem de que as doações estão em preparação e a contribuição por código segue disponível. Nenhum dado de pagamento foi configurado nesta frente.
- As cinco traduções da landing substituem chamadas de assinatura e período de teste. O bloco `pricing` foi retirado dos cinco catálogos. Em espanhol, russo e chinês, campos de preço que estavam dentro de `diff` também foram removidos; as seis linhas de diferenciais agora têm as chaves esperadas pelo componente.
- Termos, privacidade, exclusão de conta e ajuda com reembolsos distinguem acesso atual gratuito de cobranças anteriores. A página de reembolso preserva a referência à antiga garantia de 30 dias quando aplicável à compra, sem declarar cancelamento ou estorno automático. Após a aprovação da licença MIT pelo usuário e a adição de `LICENSE` pela coordenação, os Termos passaram a apontar a licença do repositório para reutilização do código.

## Verificação local

| Comando | Resultado |
| --- | --- |
| `npx --no-install vitest run src/test/projectSupport.test.tsx` | exit 0; 5 testes passaram: URL HTTPS válida, esquemas/credenciais inválidos, chave Pix UUID v4, render sem e com URL e cópia Pix com sucesso/erro persistente |
| `npx --no-install eslint src/pages/Landing.tsx src/pages/MobilePage.tsx src/pages/legal/*.tsx src/components/ProjectSupport.tsx src/lib/projectSupport.ts src/test/projectSupport.test.tsx` | exit 0 |
| `npx --no-install tsc --noEmit -p tsconfig.app.json` | exit 2; 44 erros existentes no projeto, 0 nos arquivos desta frente |
| validação JSON dos cinco catálogos | todos válidos, com `project_support` presente e sem `pricing` |

## Limites e integração

- Não houve browser, checkout real, deploy, escrita remota ou banco de dados nesta frente. A chave Pix real, a URL de PayPal/apoio e a revisão jurídica final dependem da coordenação.
- Outros agentes estão retirando os bloqueios de assinatura e o checkout nas áreas autenticadas. O componente legado `SubscriptionPaywall` ainda referenciava chaves `pricing` durante esta frente; a integração deve confirmar que não há montagem desse componente no produto final.
- Não editei `LICENSE` ou `README`; ambos pertencem à coordenação. A designação *open source* foi usada somente após a aprovação explícita da licença MIT e a presença de `LICENSE` no worktree.
