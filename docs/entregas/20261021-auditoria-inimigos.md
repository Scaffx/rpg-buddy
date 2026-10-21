# Auditoria independente das animações de inimigos

## Escopo e fronteira

- Base comparada: `4754072adad65e2856727f2434bbcc5c45f61437`.
- Fase A, alvo exato: `c992736a61e7b5475ca8f7a5355bb6eb43c780cd` (`Scaffx/audit-inimigos-20261021`).
- Contrato visual `308e093`, integração `63ca6b0` e ajuste de prévia `2b00e41`, mais as três entregas de bosses até o alvo.
- A ausência dos módulos de criaturas nesse checkpoint é dependência conhecida da integração, não achado de produto. A fase B exige o SHA final completo e nova revisão sobre ele.
- A revisão só modifica este relatório. Não altera produto, banco, produção, main nem destino remoto.

## Fase A: evidência executada

| Comando / probe | Exit | Resultado |
| --- | ---: | --- |
| `git rev-parse HEAD`, `git rev-parse 4754072adad65e2856727f2434bbcc5c45f61437`, `git status --short` | 0 | Alvo e base acima; árvore inicialmente limpa. |
| `git diff --stat 4754072adad65e2856727f2434bbcc5c45f61437 c992736` e revisão focal de cena, registro, galeria, dados, efeitos e CSS | 0 | Só apresentação e testes; `AutoAdventure` passa `battle?.boss_id` à cena. |
| Probe `node` via PowerShell heredoc: `esbuild.buildSync` de cada `bosses*.data.ts`, comparação ordenada de `id`/`name` com `catalog.snapshot.json`, contagem de básicos físicos e `postcss.parse` | 0 | Early 20 bosses/78 definições/58 especiais; middle 20/80/60; late 20/82/62; 240 IDs únicos e 60 apresentações. |
| Probe `node` via PowerShell heredoc: `postcss.parse` em `enemyPresentation.css` e nos três CSS de bosses, inspeção de `@keyframes` duplicados e de `animation: ... infinite` | 0 | Quatro folhas parseadas; 17 keyframes sem colisão de nome; nenhuma declaração `animation` infinita nesses arquivos. |
| Probe SSR independente com `esbuild.buildSync` (`jsx=automatic`, CSS vazio só no harness) e `react-dom/server.renderToStaticMarkup` | 0 | 240 efeitos e 60 sprites produzem markup SVG com identidade correta; IDs/chaves desconhecidos retornam vazio. O primeiro ensaio falhou no harness ao procurar `*.js` sem `outfile`; reexecutado com `outfile=bundle.js`, passou sem alterar o produto. |

### Comportamento revisado no código

- `resolveEnemyPresentation` exige `bossId` exato para boss e nome mais bioma exatos para criatura; desconhecidos retornam `null` e usam o sprite anterior da cena.
- `findEnemyAnimation` só seleciona básico para `kind=attack`, mesmo quando recebe nome/ID de especial. O caminho `kind=skill` exige nome exato ou ID visual exato. Esses IDs de especiais são índices da prévia, não IDs confirmados do motor.
- A cena limita `action` a `status=fighting`, suprime VFX quando `animateAction=false` e bloqueia gesto inimigo atordoado ou com multiplicador zero. O readout de ação permanece baseado no evento; HUD usa `frame` derivado dos eventos visíveis do servidor. O código novo não escreve HP, dano, XP, recompensas ou relógio.
- Galeria pública usa quadro ilustrativo, declara os especiais como prévias e não chama mutações de combate. As porcentagens CSS dos efeitos vão da fonte inimiga em 75% para o alvo herói em 25%; `target=self` usa a fonte. Há pausa e pose de movimento reduzido. Essas conclusões são de código/CSS, não inspeção visual em navegador.

### Achado preliminar P2

- **Prévia `target=self` deslocava o sprite para o herói no alvo preliminar.** Em `bossesEarly.data.ts:29`, o segundo especial do boss de nível 5 usa o motivo `dragon-flight` com `motion=flight`, `target=self`. O nome vem do snapshot: **Dragão Jovem → Voo Tático**. Em `AdventureScene.tsx:131` de `c992736`, todo evento inimigo `flight` recebia deslocamento horizontal `x=-gap*.35`; o efeito CSS continuava direcionado ao próprio dragão. Reprodução lógica: selecionar Dragão Jovem e Voo Tático em `/previa-inimigos`; o sprite avançava à esquerda, embora a ação fosse própria. A evidência inicial foi de código, sem navegador. O coordenador aceitou o P2 e assumiu a correção na integração, a revalidar na fase B. Busca no Bug Tracker por motivo/arquivos não trouxe correspondência relevante. Não foi criado ticket externo, conforme escopo de comunicação via Orca.

## Fase B: alvo final completo

- SHA final do produto recebido via Orca: `c86b9bded5162c7fdf0110a71a6099beb1937642`.
- `git merge --ff-only c86b9bded5162c7fdf0110a71a6099beb1937642`: exit 0, fast forward de `c992736` para o SHA final.
- `git rev-parse HEAD` e `git rev-parse 'c86b9bded5162c7fdf0110a71a6099beb1937642'`: SHA igual ao alvo final. `git rev-parse 'HEAD^{tree}'` e `git rev-parse 'c86b9bded5162c7fdf0110a71a6099beb1937642^{tree}'`: ambos `d686e157257d07c178930e0b37eb7d21e05caa68`. A primeira tentativa sem aspas em PowerShell falhou por interpretação de `^{tree}` pelo shell; a comparação entre trees foi repetida com aspas e passou.

| Comando / probe | Exit | Resultado |
| --- | ---: | --- |
| `npm test -- src/test/EnemyAnimationCoverage.test.tsx src/test/AdventureSceneEffects.test.tsx src/test/SkillAnimationCoverage.test.tsx src/test/AutoAdventure.test.tsx src/test/AutoAdventureSync.test.tsx src/test/AutoAdventurePayload.test.ts src/test/AutoAdventureAdvanceCache.test.tsx` | 0 | 7 arquivos, 41 testes passaram. Avisos de Browserslist/React Router não foram falhas. Esses são testes do repositório, portanto evidência local, não independente por si só. |
| Probe Node independente via PowerShell heredoc, `esbuild.buildSync` no `registry.ts`/`enemyMotion.ts`, `assert` contra `catalog.snapshot.json`, SSR React dos quatro grupos e `postcss.parse` dos quatro CSS de grupo mais `enemyPresentation.css` | 0 | 252 IDs únicos, 180 especiais e 72 básicos físicos com alvo herói; 60 bosses/12 criaturas; 252 efeitos e 72 sprites renderizam; unknown retorna vazio; 5 CSS parseados, 20 keyframes sem colisão. |
| Mesmo probe: `resolveEnemyPresentation` de todos os 60 UUIDs e 12 pares nome+bioma; `findEnemyAnimation` com payload de básico contendo ID/nome de especial | 0 | UUID exato para boss, nome e bioma exatos para criatura, ausência de identidade retorna `null`; nenhum básico promovido a especial. |
| Mesmo probe: `enemyActionMotion` em todos os especiais `target=self` e no `flight` ofensivo | 0 | A correção `2f87e45` mantém `x=0` para todos os `self`; voo ofensivo com `gap=200` chega a `x=-70`. O componente da cena usa esse helper. |
| Probe `postcss.parse` e `assert` nos quatro CSS de grupo: variáveis de fonte/alvo, 75%→25%, duração, pausa, movimento reduzido, `animation` finita e prefixos de namespace próprios | 0 | Os quatro grupos atenderam a essas condições estáticas; não houve referência cruzada a prefixo de outro grupo. |
| Probe independente `esbuild.buildSync` da cena + `react-dom/server.renderToStaticMarkup` | 0 | Básico confirmado renderiza VFX correto, 13 de dano e HUD 87/130; VFX ausente quando `animateAction=false`, `status=victory`, atordoado/multiplicador zero ou UUID desconhecido; criatura conhecida e especial próprio renderizam a identidade/alvo esperados. O primeiro ensaio do probe usou nome de boss inexistente e falhou no harness; corrigido para `Dragão Jovem` do snapshot e repetido com exit 0, sem mudança de produto. |
| `.\node_modules\.bin\tsc.cmd --noEmit --project tsconfig.app.json --pretty false` (captura e filtro de paths tocados) | 2 | 67 linhas de diagnóstico globais; zero em `src/components/adventure/enemies/`, `AdventureScene.tsx`, `EnemyAnimationGallery.tsx` ou `EnemyAnimationCoverage.test.tsx`. TypeScript global não está verde; esta auditoria não atribui esses erros ao alvo sem comparação específica com a base. |

### Parecer sobre o alvo final

- **P2 preliminar corrigido localmente:** `AdventureScene` chama `enemyActionMotion`, que conserva voo vertical e impede avanço horizontal em `target=self`. O probe independente cobre o helper e a integração SSR de `Dragão Jovem → Voo Tático`. Não houve inspeção da trajetória em navegador.
- **Nenhum P1/P2 residual reproduzido** nos contratos de identidade, gate de ator/tipo, duração de VFX, alvo próprio, valores do HUD, cobertura, CSS e separação entre apresentação e resultado do combate, dentro dos probes descritos.
- Os sprites e efeitos são componentes de apresentação. `AutoAdventure` continua derivando HP, dano, mana e ação dos eventos visíveis do servidor; a galeria declara seus números ilustrativos e os especiais como prévias. O motor informado ao revisor só executa ataques básicos físicos de inimigos; este SHA não ativa especiais.

## Limites de evidência

- Os relatórios dos autores e seus testes não substituem estes probes independentes.
- Não houve navegador, observação de CSS em execução, validação visual humana, leitor de tela, schema/API live nem produção nesta auditoria. SSR e parse de CSS não provam aparência, foco ou movimento real em dispositivos.
- O snapshot de catálogo foi a referência fornecida; esta auditoria não repetiu a consulta à base live. A confirmação autoral da origem do snapshot e do motor não equivale a uma verificação remota independente.
