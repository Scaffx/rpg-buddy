# Leitura de cura no evento da aventura

Base integrada: `fb09c832430c500bb0d0c3a077c02cf12c064028`.

## Ajuste

Quando uma ação do inimigo traz `healing > 0`, o strip informa que o herói recuperou HP após o ataque ou habilidade do inimigo. O número continua vindo do evento; a UI não atribui a recuperação ao pet, pois não há marcador de origem. A cura de habilidade do herói continua exibindo `+N HP curado`. Eventos antigos sem `healing` mantêm o texto anterior. Nenhum tipo de evento, animação de ataque ou reação de dano foi alterado.

## Evidência e limite

- O auditor `ctx_555aaf1275e7` apontou a leitura ambígua por inferência estática; não houve falha reproduzida em runtime.
- O teste em `AdventureSceneEffects.test.tsx` verifica ataque e habilidade do inimigo com cura, HP final do herói, cura da habilidade do herói e evento legado sem `healing`. Os testes de cena e reação de dano também passaram: 3 arquivos, 20 testes. ESLint dos dois arquivos TSX tocados e `git diff --check` passaram.
- Esta entrega não executou navegador, RPC ao vivo ou QA em conta de teste. O coordenador fará a integração e a verificação autenticada antes da publicação.
