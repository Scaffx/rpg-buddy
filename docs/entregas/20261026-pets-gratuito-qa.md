# QA autenticado e acesso gratuito — candidato à publicação

Data: 2026-10-26. Integração do PR #73 a partir de 32c27d396519150f00ddbb8106aa62d1b08fb951. Esta é a evidência do coordenador; os relatórios anteriores permanecem como registros das respectivas frentes.

## Resultado de aceitação

QA dos pets aprovado na conta de teste, usando a prévia local com Auth e banco reais. A conta com trial vencido entrou no painel, companheiros, aventura e página mobile após a retirada do bloqueio, sem renovar ou fabricar assinatura. A publicação ainda precisa da confirmação READY/SHA do alvo; esse recibo será salvo nos artefatos operacionais do chat.

| Cenário real | Evidência |
| --- | --- |
| HP | Base130 → efetivo143 com Cachorro e Kraken. |
| DEF | Base12 → efetivo13 com Gato. Neste patamar, o arredondamento manteve o dano recebido em21; não se afirma redução em todo ataque. |
| MP | Base64 → efetivo70 com Raposa, Necromante e Leviatã. |
| Ofensa e dano | Base23 → efetivo25 com Dragão; ataque básico9 →10 contra a mesma criatura/etapa11. |
| Kraken | Eventos persistidos do inimigo registraram dano21, cura7 e HP do herói atualizado; texto da cena identificou a cura do herói. |
| Troca durante luta | Dragão → Kraken em20:12:23.046519Z, luta terminando20:12:26.269537Z. MD5 dos campos imutáveis idêntico antes/depois; luta guardou Dragão, próxima passou a Kraken. IDs ficam nos artefatos privados de QA. |
| Persistência | Recarregamento da página preservou Necromante selecionado; segunda aba de aventura acompanhou as novas seleções confirmadas no servidor. |
| Progressão | Nível1, XP69, loadout e pontos pessoais iguais. Hashes completos de atributos e missões idênticos antes/depois. Nenhum XP, nível, gold de fixture ou skill foi concedido para testar. Ouro natural da aventura continuou sendo creditado. |
| Apoio voluntário | Chave Pix aleatória fornecida/autorizada pelo usuário, configurada como VITE_DONATION_PIX_KEY na prévia e nos próximos builds Vercel preview/production. A interface exibiu a chave e confirmou a cópia. Sem PayPal configurado. |

A conta tem Dardo Arcano de custo0. A seleção e snapshot dos sustains de Necromante/Leviatã foram confirmados, assim como clamp de MP cheio e custo0; regeneração após gasto e desconto positivo de MP foram comprovados em PG17 local, não nesta sessão autenticada. Os 12 tipos e os três sustains têm prova PG17 do autor e revisor independente. Fixtures temporárias de sete pets tinham nomes/origens QA próprios, IDs registrados e foram removidas com guardas de identidade; a seleção foi desativada pelo fluxo real antes da limpeza. Isso não comprova compra desses pets pela conta de teste. Aquisição/ledger foram cobertos na prova local anteriormente documentada.

## Código e verificação

- App gratuito: sem consulta de assinatura na liberação de rotas, sem oferta mensal/anual, trial ou checkout no fluxo alcançável. Auth, onboarding e permissões continuam exigidos.
- Repositório público confirmado no GitHub. Licença MIT escolhida explicitamente pelo usuário, adicionada em LICENSE e referenciada na interface e README.
- Três APIs sem gate de assinatura. processar_turno parte da LIVEv34 e preserva o combate legado sem recompensas. Chat preserva complete_mission; geração NPC usa o contrato semanal do repositório para corrigir a divergência com a LIVEv9. Fontes LF, hashes, limites e metadados no manifesto de release.
- Suíte integrada416/416, zero falhas, exit0. Build exit0. TypeScript exit2 com44 diagnósticos; comparação exata das linhas com a integração aceita anterior: delta0. Os24 arquivos WIP originais do checkout primário mantêm seus hashes.
- Revisão independente do frontend: sem P0/P1; dois P2 anteriores de texto APK/Play Store permanecem registrados em docs/audits/free-access-20261026/REPORT.md. Não foram tratados como regressão deste release.
- Migração pets com SHA256 LF B49428C7C96A99234C7695AEFA98480275286EDE20CA6EC5379E06447433671B aplicada após preflight atual em Primary. Gate inicial OFF; canário apenas conta de teste. História alinhada ao identificador20261026185325 sob guarda de nome, cardinalidade1 e MD5 exato831cab5e4916e025dc6103444a386bd7.
- Advisors não mostraram search_path mutável para as funções novas de pets. Há achados anteriores fora do escopo (vw_combat_balance e bosses_skills_backup_phasea); não se afirma que todo o projeto esteja sem alertas.

## Limites e operação

Não há cobrança automática nova nem cancelamento financeiro efetuado nesta entrega. As assinaturas registradas não apresentaram IDs Paddle recorrentes na forma sub_...; isso é evidência do banco do app, não uma auditoria da conta externa do provedor. Registros e direitos relacionados a pagamentos antigos foram preservados.

As APIs de IA não tinham quota própria por usuário; weekToken arbitrário continua aceito na geração semanal. É um limite operacional anterior documentado, sem relação com concessão de acesso ou cobrança no novo modelo. Reabrir recompensas NPC exige recibos autoritativos; a tela mantém conclusão desativada. Nenhum crédito direto de XP/ouro foi reintroduzido.

Depois de integrar o candidato congelado: publicar as APIs verificadas, marcar PR pronto e mesclar apenas seu SHA validado, aguardar produção Vercel READY/alias/SHA, ativar o gate global pelo relógio do servidor e realizar smoke publicado. O recibo final de execução será salvo fora do repositório para não gerar um deploy recursivo apenas por atualizar evidências.
