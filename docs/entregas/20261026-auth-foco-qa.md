# QA integrada — retorno à aba

Produto verificado: `eb241756d14eccf2548fd9e781dc421c6296bdff`, derivado da main `9062510d2d6105b4e938083d5a659657fbb38976`. O commit posterior inclui somente testes e relatórios; não altera o produto.

- Três trabalhadores reais do Orca, Codex GPT-6-Sol xhigh: implementação, revisão fria e revisão fria final. A primeira revisão encontrou um caso de expiração após reconfirmação concluída. Foi corrigido; a revisão final aprovou o contrato para JWT Supabase com `exp` numérico.
- Suíte final: **64 arquivos, 434/434 testes, exit 0**. Os testes incluem 34 casos de Auth, com preservação de formulário/cena, duplicatas, prazo, usuário forjado, token novo, UID novo, respostas antigas, erro, retry, logout e expiração sem novo evento.
- Build Vite: **exit 0**. ESLint dos quatro arquivos de código/teste: **zero erros**, apenas aviso preexistente de Fast Refresh. TypeScript explícito: **exit 2, os mesmos 44 diagnósticos da base, delta exato 0**.
- Prévia autenticada em `127.0.0.1:5190`: ocultar/reabrir o navegador preservou o indicador de Pix copiado em duas tentativas e a pausa da aventura em outra. Depois do ajuste de expiração e reload intencional, nova tentativa preservou pausa, etapa e herói, sem splash. Não houve edição de produto durante essas tentativas aprovadas.
- Uma primeira tentativa perdeu o indicador; não foi possível identificar qual evento ocorreu e ela não foi contada como aprovação. Não foram extraídos tokens, credenciais ou storage para investigar.
- Os 24 arquivos WIP originais do checkout principal permanecem com os hashes anteriores.

Escopo: continuidade da mesma sessão confirmada nesta instância. Token novo ou expirado continua exigindo confirmação e pode desmontar a rota. Sem `exp` legível, não há continuidade no evento de foco. A identidade exposta sempre vem da resposta remota de `getUser(token)`; a autorização efetiva permanece no backend.

Este relatório é evidência local e de revisão. A publicação canônica e a QA após deploy ficam no registro de release do coordenador e no Bug Tracker, vinculados ao PR #74.
