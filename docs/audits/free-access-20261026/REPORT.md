# Revisão independente: frontend de acesso gratuito e MIT

Data: 2026-10-26. Base `32c27d396519150f00ddbb8106aa62d1b08fb951`, worktree `Scaffx/rpg-pets-integracao-20261026`, com alterações não commitadas de outras frentes. Revisão somente leitura do produto; este relatório é o único arquivo produzido por esta frente. Escopo: `App.tsx`, `AppLayout.tsx`, `AppSidebar.tsx`, `Landing.tsx`, `MobilePage.tsx`, `ProjectSupport.tsx`, `projectSupport.ts`, cinco catálogos, quatro páginas legais, `README.md`, `LICENSE`, `freeAccessRoutes.test.tsx` e `projectSupport.test.tsx`. APIs em edição por outra frente não foram auditadas.

## Veredito

Sem achado P0 ou P1 no escopo inspecionado. O fluxo de frontend gratuito e a apresentação da licença MIT estão coerentes em código local, com dois achados P2 de texto mobile preexistente. A aprovação aqui cobre roteamento e UI locais; não confirma Auth real, banco, destino público do GitHub, listagem na Play Store, browser, deploy ou cancelamento de cobranças antigas.

## Achados acionáveis

### P2-1 — FAQ recomenda APK direto que a interface não oferece

- **Arquivo e linha:** `src/pages/MobilePage.tsx:62-65,113-120,254-263`; `src/i18n/locales/pt.json:303`, `en.json:303`, `es.json:303`, `ru.json:294`, `zh.json:294`.
- **Cenário e impacto:** quem acessa `/mobile` vê o botão de download direcionado à Google Play, mas a FAQ dos cinco idiomas diz que o APK direto é a via mais rápida. O próprio código da página informa que o download direto saiu (`MobilePage.tsx:27-35`). O usuário pode procurar um download que não existe no fluxo apresentado.
- **Esperado:** ajustar a FAQ nos cinco idiomas para a via de instalação realmente oferecida, de acordo com o estado de distribuição aprovado; manter texto de Play Store coerente entre Landing e `/mobile`.
- **Origem:** as frases da FAQ e o destino Google Play já estavam na base HEAD. Não foram introduzidos pela mudança de acesso gratuito.

### P2-2 — Landing anuncia disponibilidade na Play Store com botão desativado

- **Arquivo e linha:** `src/pages/Landing.tsx:303-311`; `src/i18n/locales/es.json:16,111`, `ru.json:16,111`, `zh.json:16,111`.
- **Cenário e impacto:** em espanhol, russo e chinês, o destaque do herói diz que o app já está na Play Store e o CTA diz para baixar, mas o botão correspondente está desativado; a própria descrição da seção diz que a versão ainda está a caminho. Isso cria uma promessa contraditória para visitantes desses idiomas.
- **Esperado:** alinhar destaque e CTA ao estado real de publicação, como já fazem português e inglês ao dizer que funciona no navegador e que a loja vem depois; só anunciar download quando o botão estiver operacional.
- **Origem:** textos e botão desativado já estavam na base HEAD. A revisão os identificou ao conferir os cinco catálogos.

## Evidência de passagem no escopo

- `src/App.tsx:81-113,128-139,157-185`: não consulta assinatura para liberar rotas autenticadas; visitante vai à Landing, onboarding segue obrigatório para páginas do jogo, e `/admin/releases` exige papel admin. `src/hooks/useAuth.tsx:62-90` confirma token e identidade via `getUser`; `src/hooks/useIsAdmin.ts:7-12` usa esse usuário confirmado. O teste cobre assinatura simulada inativa e carregando, identidade divergente, visitante, onboarding e admin.
- `src/components/AppLayout.tsx` e `AppSidebar.tsx`: diff remove banner de pagamento, aviso de vencimento, diálogo de códigos Premium e badge de trial. `Landing.tsx` e `MobilePage.tsx` deixam de montar paywall e montam `ProjectSupport`. Busca de referências em `src` encontrou os componentes/hooks de checkout apenas nas próprias definições legadas e no `GiftKeySection` legado, sem importação ativa por páginas/rotas inspecionadas. A RPC `has_active_subscription` permanece nos tipos/histórico, sem chamada ativa observada no frontend.
- `src/lib/projectSupport.ts:4-23` só exibe Pix quando a chave é UUID v4 aleatória e só aceita URL absoluta HTTPS sem credenciais. `src/components/ProjectSupport.tsx:23-53` oferece código público, omite pagamento sem configuração válida, informa ausência de vantagem e mantém feedback visível de sucesso/erro da cópia; seção, título, label, botão, `role=alert` e `role=status` dão estrutura acessível básica.
- Os cinco JSON são válidos, contêm todas as dez chaves de `project_support` usadas pelo componente e não contêm bloco `pricing`. As chamadas visíveis de trial/assinatura na Landing foram substituídas por textos de acesso gratuito; os identificadores internos antigos (`hero.perk_trial`, `whats_new.items.premium_*`) agora têm valores públicos/gratuitos, sem promessa de trial ou Premium.
- `LICENSE:1-21` contém o texto MIT e o copyright; `README.md:3,29-39`, `TermsPage.tsx:61-68` e os cinco catálogos apontam para MIT de modo coerente. O remoto Git configurado e a URL mostrada no produto usam `github.com/Scaffx/rpg-buddy`; a disponibilidade pública do repositório não foi verificada. `RefundPage.tsx:17-44`, `TermsPage.tsx:76-87` e `DeleteAccountPage.tsx:87-93` preservam a distinção entre acesso gratuito atual e cobranças anteriores, sem prometer cancelamento ou estorno automático.
- Comando executado: `npx --no-install vitest run src/test/freeAccessRoutes.test.tsx src/test/projectSupport.test.tsx` — exit 0, 2 arquivos e 13 testes passaram. O teste de rotas usa `AuthProvider` real com `getUser`, perfil e páginas simulados; o de apoio simula configurações públicas e clipboard. Avisos de future flags do React Router não causaram falha.

## Limites da revisão

Não houve escrita de produto, commit, suíte global, `tsc`, build, navegador, serviço remoto ou banco. O status da licença no Git é **untracked** neste worktree; sua inclusão no artefato/commit final cabe à coordenação. A alegação de acesso gratuito em produção depende também das APIs e da publicação, fora desta revisão. A documentação de 44 erros TypeScript de baseline foi preservada sem repetir essa checagem.
