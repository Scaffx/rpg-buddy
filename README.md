# LifeonRPG

Sua rotina é a aventura. Aplicativo gratuito de rotinas com progressão pessoal e aventura automática, open source sob a [licença MIT](LICENSE).

## Jogar e apoiar

Acesse https://lifeonrpg.vercel.app e entre na sua conta. Não há plano mensal, assinatura obrigatória ou prazo de trial para usar o aplicativo. Autenticação, onboarding e isolamento entre contas continuam em vigor.

Doações são opcionais e não concedem XP, itens, acesso ou vantagens. Se nenhum destino estiver configurado pelo mantenedor, a interface oferece a contribuição pelo código. Registros históricos de pagamentos são preservados e não representam requisito de acesso.

## Regras centrais

- Rotinas concluídas concedem XP e evolução pessoal.
- A aventura automática concede ouro e itens; cada décima etapa é um boss.
- Um pet selecionado pode melhorar os atributos do herói e oferecer seu efeito de suporte. O servidor congela essa escolha ao iniciar cada luta.
- Equipamentos, habilidades, pets, encontros e recompensas são validados pelo servidor.

## Desenvolvimento

Requisitos: Node.js e npm. A interface usa React, TypeScript e Vite; o backend usa Supabase/PostgreSQL e Edge Functions.

```sh
npm install
npm run dev
npm test -- --run
npm run build
```

Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com os valores públicos do seu projeto Supabase. Nunca coloque chaves secretas ou `service_role` no frontend.

Para apoio voluntário, `VITE_DONATION_URL` aceita um endereço HTTPS e `VITE_DONATION_PIX_KEY` aceita uma chave Pix aleatória. São configurações públicas da interface e devem conter somente destinos autorizados pelo mantenedor para divulgação. Na ausência delas, o acesso continua gratuito.

As migrações ficam em `supabase/migrations`. Migrações críticas exigem preflight do estado atual, validação local e verificação no alvo. Não aplique todo o histórico indiscriminadamente sobre um banco já existente.

## Contribuir

Descreva o problema e o comportamento esperado em uma issue ou pull request. Preserve autenticação, isolamento entre contas, progressão por rotinas e recompensas autoritativas. Inclua a validação relevante para sua alteração.

A licença do projeto não transfere direitos de marcas ou materiais de terceiros que tenham termos próprios.
