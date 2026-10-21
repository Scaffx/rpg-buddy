# Animações por habilidade e galeria — 21/10/2026
Checkpoint local: código de aplicação `427a686aa131ac7b0f0dcfb354017643943e548a`, sobre main `4897714815f5ce1db0544c78f14fe914a27dadf3`. Publicação será registrada no relatório final do coordenador; este documento descreve evidências locais executadas.

## Resultado
A aventura deixou de depender apenas de sete efeitos genéricos por elemento. Um registro de apresentação associa o ID real da habilidade a preparação, trajetória e impacto próprios. `AutoAdventure` encaminha `skill_id` do evento já ocorrido; a cena escolhe o visual da classe ou da arma universal e preserva HUD, dano, mana, recarga e recompensas do servidor. Ataques básicos, inimigos, IDs desconhecidos e eventos fora da janela continuam com os caminhos anteriores. Há sete sprites de classe, incluindo Aprendiz, e gestos de braços/arma para conjuração, disparo, investida e martelada.

A galeria pública `/previa-habilidades` permite escolher classe, habilidade, cenário, repetição e pausa, inclusive habilidades ainda não desbloqueadas. O link fica em Habilidades. Seus números são ilustrativos e ela não equipa, compra, concede XP, altera conta nem inicia aventura. Ela usa o mesmo componente visual do combate.

## Agentes no Orca
Run `run_2c76c678b339`; agentes GPT-6 Sol xhigh. Autoria por classe, ownership isolado, revisão independente e integração do coordenador. Sete tarefas autorais concluídas e liberadas após seus próprios relatos.

| Responsável | Tarefa | Commit visual autoral | Cobertura |
| --- | --- | --- | --- |
| Mago | task_586f83bbbc13 | e1b7fd3a5648b1201513775d2fbc32f6d36ba520 | 9: dardo, fogo, raio, estouro, gelo e quatro variantes |
| Guerreiro | task_8bb2b6609d59 | 48c8732f6e685eb8b28ff8e0bab7563b5c6c5e96 | 7: quatro ativas e três variantes |
| Arqueiro | task_fbb050e101ab | 6509f3b1565d95625f775ead0f00c2a2c4c50f21 | 7: quatro ativas e três variantes |
| Gatuno | task_a09e3a6a99d2 | 69ac2860046b7b47869349f2acb54d1c1f1bd941 | 7: quatro ativas e três variantes |
| Ferreiro | task_ea9e248e7a60 | 367f6f90bce3ebe066b1f5fc90b05015bf5c4dab | 6: quatro ativas e duas variantes |
| Clérigo/Noviço | task_2be2260a976b | 17fb27bf2d546abfda7a7a362b021548ee4b884d | 6: quatro ativas e duas variantes |
| Aprendiz/armas | task_201795aa96d2 | d4c29fe56d23dad604b0bf10e8d8313835e16bf8 | 10: Golpe Improvisado, duas cinzas e sete habilidades de armas |

Total **52 IDs únicos**: 35 habilidades ativas/armas e 17 variantes visuais. Passivos não são conjurados. Catálogo público de `skill_tree_nodes` e sete `game_items.weapon_skill` consultados somente por leitura em Primary em 21/10; nenhuma migration ou escrita de banco nesta entrega. Os IDs de arma usam o mesmo `weapon_UUID` do motor. Os relatórios de cada autor ficam neste diretório.

Um primeiro lançamento do Gatuno expirou antes de executar a tarefa; o terminal foi liberado antes da tentativa válida. Algumas injeções ficaram no compositor; foram inspecionadas e submetidas apenas com Enter, sem duplicar prompts. Ferreiro e Aprendiz criaram worktrees isolados para preservar WIP anterior. A revisão independente não confirmou regressão nova e entregou relatório `ee1d8a31f7e2c6cfca7591a8823f881a79fd8d0d`.

## Verificação
- `npx --no-install vitest run`: **335 testes em 49 arquivos**, exit0, no alvo completo e novamente após ajuste mobile.
- `npm run build`: exit0 no alvo completo e no ajuste mobile. Aviso de chunk grande preexistente permanece.
- TypeScript no alvo completo: exit2 por **44 diagnósticos contra44 da base; delta0**; não se afirma TypeScript global verde.
- Lint dos componentes de integração novos e da cena: exit0. Autores validaram compilação isolada, cobertura e parsing CSS; alguns módulos combinam metadata/componente e registram warning Fast Refresh, sem erro.
- Auditor independente `task_41f8818daa12`, alvo `bdef3b8`: 23 testes focados e sete cenários SSR próprios, exit0. Probes negam VFX específico em inimigo, ataque básico, classe divergente e janela expirada; preservam HUD/readout, cura self e arma compartilhada. CSS dos sete módulos analisado. O delta posterior `427a686` muda apenas o layout da galeria; foi verificado pelo coordenador com a suíte e o navegador, sem alegação de revisão independente desse delta.
- Navegador local: 52/52 IDs renderizados, todos únicos, com camada VFX; nenhuma ausência ou overflow nas larguras solicitadas900 e320. Em Windows com scrollbar, clientWidth885 e305 respectivamente. Grade mobile em duas colunas e seletor de classe antes da lista.
- Inspeção visual em1280: exemplos das sete classes, incluindo Bola de Fogo, Lâmina Flamejante, Flecha de Gelo, Lâmina Envenenada, Bigorna, Cura Menor e Flecha Perfurante de arma.
- Bola de Fogo capturada durante deslocamento real; CSS `vfx-mago-fire-flight`, duração1,1s, opacidade1, posição intermediária. A captura é um instante da demonstração, não prova de dano em conta real.
- Pausa e `prefers-reduced-motion` oferecem alternativas estáticas por módulo. Não foi feita sessão com leitor de tela ou medição de FPS.
- Somente o efeito atual é montado; os 52 não animam simultaneamente. Sem biblioteca, plugin, dependência, imagem externa ou instalação nova.

## Limites
Variantes são prévias e a UI informa que ainda não alteram a aventura. Queimadura, congelamento, dano contínuo, área, sinergias e passivos continuam fora do motor. Os desenhos não implementam essas mecânicas. Aparência de equipamentos no sprite continua no roadmap anterior.

A abertura inicial do dev falhou por `supabaseUrl is required`. O processo foi reiniciado com a configuração pública validada de Primary; sem editar client gerado, .env, junction, dependências ou sessão do usuário. Depois a galeria abriu normalmente. Esse problema de ambiente local foi separado de defeitos do produto e registrado/resolvido no Bug Tracker.

Arquivos QA antigos `.qa-effects.html` e `src/qa-effects.tsx` ficaram preservados e fora dos commits. Evidências completas de testes/build/tsc e navegador estão em `work/animations-20261021` do coordenador, e imagens em `outputs`.
