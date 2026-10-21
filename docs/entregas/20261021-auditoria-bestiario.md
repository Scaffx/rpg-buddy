# Auditoria independente — bestiário visual

**Alvo exato de código:** `cdaaef723e75b86bdd7cfd3ec481ecd6fa6bf498` (`Scaffx/revisao-bestiario-20261021`), avançado por `git merge --ff-only` a partir de `c3ee094f1e9c6e1cc0bca00562c07f999e22c916`. Base do conjunto: `d23e5de6722aa60266d6b6c469328e0403722943`.

**Resultado:** [Certo] **PASS parcial local**, sem achado aberto reproduzido no alvo exato. Esta conclusão cobre os quatro módulos de arte, o pequeno ajuste CSS, o guard de chave desconhecida e o teste focal adicionado no intervalo `d23e5de..cdaaef7`. Não é certificação de navegador, economia, banco ou publicação.

## Escopo e contratos

| Contrato | Evidência no alvo final | Resultado |
| --- | --- | --- |
| 60 bosses e 12 criaturas com identidade preservada | O delta não modifica `*.data.ts`, `registry.ts`, catálogo, IDs, VFX ou economia. O teste focal compara as 72 apresentações com `catalog.snapshot.json`. O probe SSR independente renderizou 20 early, 20 middle, 20 late e 12 criaturas. | [Certo] 72/72 SVGs com geometria, `viewBox="0 0 32 32"`, `data-enemy-key` exato e `className` recebida. |
| Chave desconhecida não cria sprite | Os quatro componentes retornam `null` para `unknown`. `CreaturesSprite` agora usa `Object.prototype.hasOwnProperty.call(CREATURE_ARTWORK, enemyKey)` antes do lookup. | [Certo] SSR vazio para `unknown`, `__proto__`, `constructor` e `toString` em cada grupo; regressão coberta pelo teste de autor. |
| Camadas de desenho e animação | Early mantém `bossesEarly-sprite__body` com respiração CSS e coloca `scale(.5)` no `<g>` filho. Criaturas mantêm `adventure-enemy-body` e também escalam o filho. Middle/late preservam seus grupos nomeados; neles `scale(.5)` está no próprio grupo, que não recebe keyframe de `transform` nas folhas CSS atuais. A cena anima o `motion.div` externo. | [Certo] Nenhuma sobreposição atual entre escala do desenho e `transform` da camada que efetivamente anima. Esta checagem é estrutural; não mede estilo calculado em navegador. |
| Apresentação pura | Busca textual nos quatro TSX não encontrou hooks, rede, timers, `requestAnimationFrame`, imagens externas, scripts, elementos SVG animados ou IDs SVG. SSR das 72 figuras contou 1.091 elementos geométricos e zero atributos SVG `id`. | [Certo] Nenhuma nova mecânica, relógio, recompensa ou chamada externa nos sprites revisados. |
| CSS de efeitos | `git diff d23e5de..cdaaef7 -- bossesEarly.css` contém somente a remoção de `image-rendering: pixelated` de `.bossesEarly-sprite`; nenhum CSS de VFX mudou. | [Certo] Efeitos preservados no delta. |

[Certo] `aria-hidden`, `data-enemy-key`, `viewBox` e as classes públicas permanecem. Nas criaturas, a troca de desenho também remove `shapeRendering="crispEdges"` e acrescenta `focusable="false"`/`data-art-version="bestiary-2"`; são mudanças de apresentação. O refinamento early de `427c5ff432a1a2faf2399ddb18867bdb614f6498` altera o desenho e a descrição de entrega, sem tocar a assinatura ou o wrapper do componente. A revisão React não encontrou estado, efeitos ou operações de DOM nos quatro componentes; as paletas e geometrias são locais e determinísticas.

## Achado reproduzido e encerrado no alvo

**P3 — chave herdada em `CreaturesSprite` (encerrado em `cdaaef7`).** [Certo] Em `c3ee094`, o lookup por objeto literal aceitava `toString`/`constructor` como valores herdados e retornava um SVG indevido com aviso React; `__proto__` lançava erro em SSR, contrariando `unknown => null`. O padrão já existia na base `d23e5de`, e os fluxos normais da cena/galeria obtêm chaves do registry, reduzindo a exposição observada. O guard `hasOwnProperty.call` e o novo teste dos três casos em todos os grupos corrigem a reprodução no SHA final. Nenhum arquivo de código foi alterado por esta auditoria.

## Inspeção visual estática

[Provável] Em `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/`, a folha `outputs/bestiario-criaturas-v2.png` e as folhas `work/bestiario-visual-20261021/contact-middle.png`, `contact-late.png` e suas versões reduzidas mostram 12 criaturas e 40 bosses com silhuetas e materiais distinguíveis. `contact-early.png` foi comparada com `contact-early-refined.png` e a versão reduzida; os 20 early refinados apresentam olhos e contornos mais orgânicos. Esses PNGs são artefatos locais de composição estática, não teste em navegador nem aprovação do usuário. A inspeção do código final e das folhas foi feita separadamente; o PNG isolado não prova a origem do commit.

## Comandos e saídas

| Comando ou probe executado nesta worktree | Exit | Resultado |
| --- | ---: | --- |
| `git status --porcelain=v1`, `git merge-base --is-ancestor HEAD cdaaef7...`, `git merge --ff-only cdaaef7...`, `git rev-parse HEAD` | 0 | Árvore limpa antes do avanço; HEAD final `cdaaef723e75b86bdd7cfd3ec481ecd6fa6bf498`. |
| `npx --no-install vitest run src/test/EnemyAnimationCoverage.test.tsx src/test/AdventureSceneEffects.test.tsx src/test/adventureScene.test.tsx src/test/AutoAdventure.test.tsx` | 0 | 4 arquivos, 32 testes passaram, inclusive regressão das chaves herdadas. Avisos de Browserslist e React Router não foram falhas. |
| `npx --no-install eslint` nos quatro `*Sprites.tsx` revisados e em `EnemyAnimationCoverage.test.tsx` | 0 | Sem diagnósticos. |
| Probe Node em memória: bundle esbuild de `registry.ts`, React `renderToStaticMarkup`, asserts de grupo/identidade/`viewBox`/classe/geometria e quatro chaves desconhecidas | 0 | 72 SVGs; 1.091 elementos geométricos; zero IDs SVG; retornos desconhecidos vazios nos quatro grupos. Nenhum arquivo de teste criado. |
| `rg` nos quatro TSX por hooks, rede, timers, SVG externo/animado e `id=` | 0 | `NO_MATCHES` (a busca `rg` isolada retornou 1, normalizado pelo comando para indicar ausência de correspondências). |
| `git diff --check d23e5de..HEAD` | 0 | Sem problemas de whitespace no conjunto auditado. |

## Limites

[Incerto/a] Esta auditoria não repetiu o navegador do root, a medição de estilos calculados ou leitura em tela real; o root informou que faria o reteste final dos 20 early. Não executei build global ou `tsc` nesta worktree; o baseline TypeScript de 44 diagnósticos sem delta nos arquivos alterados foi informado pelo root, não é prova independente aqui. Não houve consulta a banco, API remota, Supabase ou produção. A conclusão vale apenas para o SHA de código indicado acima; commits posteriores exigem nova revisão.
