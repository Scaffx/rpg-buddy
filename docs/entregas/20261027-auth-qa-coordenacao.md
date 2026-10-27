# Renovação de sessão — evidência da coordenação

## Corte e revisão

- Base publicada: `20d127516dec179639dc650c920aafcf8562de9a` (PR74). A implementação de continuidade foi congelada em `b29a3f340efb665c99e3308cf6bf2f7759c461d1`; o reteste frio aprovou tecnicamente esse corte com 99 cenários e build. O relatório de rejeição anterior refere-se ao corte `73aa106`, cujos três problemas foram corrigidos.
- A correção adicional da tela Discord foi congelada em `75a67686b6a1e45f4b45e31ff24ae030f49be980` e aprovada por outro revisor, com 13 testes específicos, 8 independentes. Ela não altera `useAuth`, a fronteira de continuidade, o gate de dados nem o cliente Supabase.
- Corte completo de testes: `d929089123ca2e42afa57428c6fdc6c51962f637`. Execução da coordenação: **73 arquivos, 513/513 testes, exit 0; build exit 0**. TypeScript explícito: **44 diagnósticos em 67 linhas, exit 2, comparação textual exata com a base: delta 0**. O typecheck global não está aprovado. Lint global também contém falhas preexistentes; o relatório Discord diferencia esse estado do lint do teste e dos arquivos tocados.

## Navegador e conta de teste

- A QA usa o App, AuthProvider e cliente Supabase reais, na origem `http://127.0.0.1:5190`. Uma entrada temporária fora do build público oferece botões visíveis de `refreshSession()`, indicadores booleanos e referências a elementos da rota `/boss`. Não há cópia de sessão entre origens nem alteração de JWT, refresh token ou storage.
- Rascunho: `QATEST` no campo de código da aba Dungeon, sem acionar Entrar. Há foco nesse campo e rolagem não nula antes de renovar. A prova compara os mesmos nós da cena e do campo; não se limita ao texto reaparecer após um remount.
- Em `ad93507`, duas renovações reais no provider preservaram a montagem. Em `73aa106`, duas renovações reais no App preservaram cena, campo, valor, foco e rolagem. Esses resultados são históricos e não substituem os casos finais de expiração.
- Caso A, no produto `b29a3f3`: **aprovado**. O relógio local avançou para depois do `exp` antigo; a tela ficou oculta sem desmontar, a renovação real produziu outro token, `getUser` confirmou o mesmo UID e a rota retornou com os mesmos nós, rascunho, foco e rolagem. Artefato local: `qa-expiry-a-final.json`.
- Uma execução anterior do caso B foi **excluída**, pois não observou ocultação e provocou renovações repetidas do SDK ao simular o vencimento logo após a emissão do token. O artefato `qa-expiry-b-excluded.json` não é PASS. A sonda passou a exigir uma margem de idade do token antes desse caso; nenhum critério de ocultação foi relaxado.
- Caso B final, produto `75a6768` com os testes de revisão em `d929089`: **aprovado**. `refreshSession` real mudou o token, `getUser` real confirmou o mesmo UID, o token anterior venceu com resposta pendente e o observador registrou ocultação durante essa espera. A sonda confirmou exclusão por DOM/CSS, nenhum desmonte, mesma cena, mesmo campo/valor, foco e rolagem preservados. Foram atrasadas duas respostas `getUser`; o indicador de chamadas token chegou a três antes de fechar a página. Artefatos locais: `qa-expiry-b-final-20261027.json` e `.png`. A coleta manual da árvore acessível ocorreu depois da conclusão e não é apresentada como observação manual da janela oculta; essa janela foi registrada pelo observador DOM/CSS e pelos testes adversariais.

## Incidente remoto de 27/10

- Antes de publicar esta frente, o usuário não conseguiu abrir o Discord. A página do projeto retornou `upstream request timeout`, os logs registraram duas respostas 504 de `/auth/v1/authorize` e uma consulta de health expirou em 15 segundos. O banco respondeu a `SELECT 1`, sem sessão ativa demorada no snapshot de diagnóstico. O aviso de orçamento de IO no painel não comprova a causa.
- Foi feito o reinício oficial do mesmo projeto pelo painel, observando `RESTARTING` e depois `ACTIVE_HEALTHY`. Durante a manutenção apareceu 522 e, logo após, 525 numa aba. Nenhuma proteção TLS foi contornada.
- Após recuperação: health 200; authorize 302 para `discord.com/api/oauth2/authorize`; o navegador concluiu o OAuth da conta de teste e voltou autenticado à origem local. A recuperação do serviço foi registrada no BUG44; a ausência de recuperação do spinner é tratada separadamente no registro `406812ac-94d8-81da-8167-d3ebdddc6c12`.

## Limites e publicação

O relógio e o atraso de cinco segundos usados nos casos A/B são locais. Auth, novos tokens e `getUser` são reais; não foi forçado nem comprovado o vencimento do JWT no servidor. O bloqueio de dados e Realtime, logout, erro, timeout, troca de conta e respostas tardias também têm prova automatizada adversarial. Cancelar uma requisição local não desfaz uma operação já executada no servidor.

QA prévia concluída; publicação depende dos checks do PR e da conferência do SHA no domínio canônico. Sem migração, Edge Function, troca de chave, grant, policy ou URL autorizada. O WIP original de 24 arquivos permaneceu byte a byte igual nas verificações da coordenação.
