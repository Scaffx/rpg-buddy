# Contrato da reforma automática — 19/10/2026

## Decisões do usuário e autoridade

Esta reforma foi autorizada pelo usuário em 19/10/2026. As decisões abaixo substituem os trechos conflitantes de CLAUDE.md, DESIGN_ROTINA_TORNEIRA.md e documentação anterior. Não interpretar a regra antiga de ouro somente por rotina como veto à mudança solicitada.

- XP, nível e atributos permanentes só evoluem por rotinas cumpridas. Checklist isolado não paga progressão.
- Combate passa a ser automático contra inimigos sucessivos e concede ouro e itens; nunca XP, nível, atributos permanentes ou multiplicadores de XP de rotina.
- Chefes aparecem automaticamente nas etapas 10, 20, 30 etc. da aventura, conforme esclarecimento do usuário. Etapa da aventura não é nível do herói.
- O usuário confirmou limites por dia, considerando o agendamento: até 4 missões de prioridade alta/vermelha, 8 de prioridade média/amarela e baixa/verde sem limite.
- Altas pagam mais XP que médias; baixas pagam bem menos. Números devem ser explícitos, iguais entre servidor e prévia, com calibração documentada. Não alterar a curva de níveis incidentalmente.
- O aplicativo deve reduzir esforço e frustração; ações para assistir, coletar e repetir não podem gerar créditos duplicados.

## Critérios técnicos compartilhados

- Servidor valida identidade, agenda, relógio, recompensas e limite. Valores econômicos enviados pelo cliente não são autoridade.
- Data de rotina permanece America/Sao_Paulo. Completar não deve liberar imediatamente uma vaga para criar e completar outra alta no mesmo dia e contornar o teto.
- Limites consideram criação, edição de prioridade/agenda e reativação. Semana flexível precisa ter semântica explícita; únicas em datas distintas não conflitam só por cair no mesmo dia da semana. Dados antigos acima do teto não são apagados nem rebaixados silenciosamente.
- Desfazer usa os totais realmente creditados e reconcilia os efeitos derivados uma vez. Não recreditar checklist ao alternar marcação.
- A aventura precisa persistir e reconciliar tempo no servidor; não depender exclusivamente de setInterval no React. Reconexão e duas abas não podem duplicar ouro/loot. Versão inicial deve ter duração máxima offline e orçamento de recompensa documentados/configuráveis; valores são decisões iniciais de balanceamento, não requisitos do usuário.
- Equipamentos afetam combate, não alteram atributos permanentes do perfil nem XP da rotina. Pets não geram XP/ouro/multiplicadores de rotina por si mesmos.
- Não gastar automaticamente itens/ouro consumíveis sem configuração explícita. Derrota pode interromper avanço, sem drenar XP ou atributos permanentes e sem obrigação de assistir.
- Migrações novas aditivas/guardadas; não reaplicar a cadeia histórica inteira em produção. Consultar definições vivas ao afirmar estado remoto. Nenhuma escrita remota durante implementação autoral.
- Preservar D-1, semanal/única, autoria e WIP importado. Não fazer reset, limpeza ampla, push/deploy ou merge pelo worker.

## Divisão de ownership

1. Progressão e reversão: src/hooks/useProfile.tsx, src/hooks/useUndoMission.ts e testes/migrações próprios. Reaproveitar soluções documentadas de checklist, conferir ledger diário/semanal/único. Não editar Missions.tsx, constantes de prioridade ou combate.
2. Prioridades e agenda: src/lib/missionPriority.ts, src/lib/constants.ts, src/hooks/useMissionsHooks.ts, src/pages/Missions.tsx e testes/migrações próprios. Consumir os totais confirmados pela RPC nas notificações/otimistas; coordenar alteração do contrato de conclusão com a frente 1. Não editar useProfile.tsx ou combate.
3. Aventura automática: novos módulos/hook/componente de aventura, src/pages/BossPage.tsx, integrações mínimas de rota/menu da arena e testes/migrações próprios. Não editar src/integrations/supabase/types.ts ou traduções globais; entregar chaves/contratos para integração. Nunca escrever em arquivo de ownership da frente 1/2 sem mensagem prévia ao coordenador.
4. Acessibilidade e orientação: src/components/ui/sidebar.tsx, src/components/AppSidebar.tsx (só semântica acessível), testes próprios e uma proposta de copy/chaves. Não alterar layout do menu/rotas de aventura, Missions.tsx, locale JSON ou progressão. Validar aviso de título do diálogo sem alegar teste humano/leitor de tela real.

## Entrega e revisão

Cada worker usa sua worktree isolada baseada no mesmo snapshot. Não está sozinho no projeto: preservar trabalho dos demais e acomodar contratos compartilhados. Entregar commit, arquivos, testes com comando/exit code, riscos, dependências, relatório e estado exato de implementação. Conferir caixa de mensagens nos checkpoints e antes da conclusão. Revisão independente e integração ocorrem em uma onda seguinte. Testes autorais não significam aprovação independente ou deploy.
