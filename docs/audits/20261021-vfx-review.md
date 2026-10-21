# Revisão independente — VFX da aventura e galeria

## Escopo e conclusão

- Worktree: `rpg-continuo-motor-20261020`, branch `Scaffx/audit-vfx-20261021`. Base de comparação `4897714`; alvo inicial `5aa4da219f400e580eb875a8c4882e527dda0133`; **alvo completo auditado `bdef3b898d1e18402aef54f042fd3f2e9e6c6e69`**.
- Resultado: **PASS parcial local no alvo completo**, sem regressão nova confirmada. A autoria Aprendiz ausente no SHA inicial entrou no SHA completo; nunca foi classificada como defeito. O PASS cobre leitura de código/CSS e testes jsdom focados, não QA visual, banco remoto ou aprovação de publicação.
- Ownership da auditoria: somente este relatório. Nenhum arquivo de código foi alterado. Sem consulta a ambiente Supabase remoto, navegador ou Notion.

## Verificações no alvo completo

| Contrato | Evidência local | Resultado |
| --- | --- | --- |
| VFX específico só para evento de skill do herói, no tempo visível | `AutoAdventure.tsx` filtra `event.at <= serverTime`, escolhe `activeEvent` por `< 1350` ms e encaminha `skillId` só quando `kind === 'skill'`; `AdventureScene.tsx` procura `findSkillAnimation` só para `actor === 'hero'` e `kind === 'skill'`. | Evento futuro não aparece; expirado mantém readout sem VFX; ataque básico e inimigo seguem efeito genérico. Cobertura por inspeção, testes focados e SSR independente para os ramos de render. |
| HUD e readout da luta | `AdventureScene.tsx` lê HP/MP/dano de `frame`; `AutoAdventure.tsx` usa o último evento visível para HP/MP e texto e mantém `animateAction` separado. | Nenhum valor de combate novo calculado pelo VFX. O teste com evento futuro conserva HP/MP anterior. |
| Classe e alvo | `registry.ts` restringe ID à classe corrente ou aos IDs compartilhados de Aprendiz/arma; `AdventureScene.tsx` usa `heroClass` da batalha e alvo `self` para cura/buff; `clerico.tsx` define `n_cura`, `n_escudo` e `n_sup_var` como `self`. | Classe errada não é convertida em outra; cura e proteção miram o herói. |
| Galeria isolada | `SkillAnimationGallery.tsx` importa catálogo local, monta quadro ilustrativo, muda somente URL/estado de prévia e usa apenas timer de repetição local. A rota `/previa-habilidades` é pública. Busca textual por `fetch`, RPC, `.from`, URLs externas e timers nos arquivos de galeria/VFX não encontrou outro acesso ou timer. | Sem hook de perfil/inventário, grant, equip, rotina ou chamada a API na galeria/VFX. URL pública contém somente seleção de catálogo. Os timers já existentes em `AutoAdventure.tsx` são do relógio/transições da aventura e não foram adicionados por este trabalho. |
| Cobertura de catálogo e variantes | O snapshot tem 90 nós: 35 skills, 17 variantes e 38 passivos. Registry implementa 52 IDs únicos (42 das seis classes e 10 de Aprendiz/cinzas/armas). Galeria rotula variantes como prévia; o SQL local `20261021142812_continuous_adventure_skill_stats_engine.sql` exige `n.node_type='skill'` e forma IDs de arma como `weapon_ || i.id`. | Metadados/efeitos correspondem ao snapshot no teste; variantes não entram na rotação pelo SQL lido. Não é prova de schema remoto. |
| Movimento | Os sete CSS possuem regras para `.adventure-still` e `prefers-reduced-motion`. Máximos por declaração CSS: Mago/Guerreiro/Clérigo 1100 ms, Arqueiro 1040+140=1180 ms, Gatuno 1080+80=1160 ms, Ferreiro 1080 ms, Aprendiz 1150+100=1250 ms. | Todos cabem em 1350 ms por inspeção estática. PostCSS analisou os sete arquivos sem erro de sintaxe. A aparência e os estados calculados pelo navegador ainda dependem de QA visual. |

## Achados

Nenhum defeito novo confirmado em `bdef3b898d1e18402aef54f042fd3f2e9e6c6e69`. Nenhuma correção de código foi proposta ou aplicada.

## Provas executadas

| Comando | Resultado |
| --- | --- |
| `npx --no-install vitest run src/test/SkillAnimationCoverage.test.tsx src/test/AdventureSceneEffects.test.tsx src/test/AutoAdventure.test.tsx` | Exit 0; 3 arquivos, 23 testes. Inclui cobertura de IDs, `self`, troca de classe na galeria, VFX expirado, evento futuro e recursos da timeline. São testes existentes dos autores, executados por esta revisão. |
| `PowerShell here-string \| node` com esbuild em memória e React SSR de `AdventureScene` | Exit 0; 7 cenários independentes: skill válida, inimigo, ataque básico, classe divergente, janela expirada com readout/HUD conservados, cura `self`, `weapon_UUID` compartilhada em Guerreiro. Nenhum arquivo de teste criado. |
| `node -e "...postcss.parse(...)..."` sobre os sete CSS de skills | Exit 0; 130 blocos `@keyframes` analisados no total. Somente sintaxe CSS, sem render visual. |
| `git diff --check 4897714 bdef3b898d1e18402aef54f042fd3f2e9e6c6e69` | Exit 0. |

### Harness independente reproduzível

Executado no root deste worktree com PowerShell. O bundle é compilado em memória, sem alterar o repositório:

```powershell
@'
const path = require('path');
const assert = require('assert/strict');
const Module = require('module');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const esbuild = require('esbuild');
const file = path.resolve('src/components/adventure/AdventureScene.audit.cjs');
const built = esbuild.buildSync({ entryPoints: ['src/components/adventure/AdventureScene.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', loader: { '.css': 'empty' }, alias: { '@': path.resolve('src') }, external: ['react', 'react-dom', 'framer-motion'] });
const loaded = new Module(file, module);
loaded.filename = file;
loaded.paths = module.paths;
loaded._compile(built.outputFiles[0].text, file);
const { AdventureScene } = loaded.exports;
const base = { stage: 3, biome: 'floresta', heroClass: 'mago', heroName: 'Herói', enemyName: 'Alvo', isBoss: false, paused: false };
const hp = { status: 'fighting', heroHp: 87, heroMaxHp: 120, heroMp: 19, heroMaxMp: 30, enemyHp: 71, enemyMaxHp: 100 };
function html(action, overrides = {}, frame = {}) { return renderToStaticMarkup(React.createElement(AdventureScene, { ...base, ...overrides, frame: { ...hp, ...frame, action } })); }
const valid = { id: 'evt', actor: 'hero', kind: 'skill', skillId: 'm_bola_fogo', skillName: 'Bola de Fogo', damage: 9 };
assert.match(html(valid), /data-animation-skill="m_bola_fogo"/);
assert.doesNotMatch(html({ ...valid, actor: 'enemy' }), /data-animation-skill=/);
assert.doesNotMatch(html({ ...valid, kind: 'attack' }), /data-animation-skill=/);
assert.doesNotMatch(html(valid, { heroClass: 'guerreiro' }), /data-animation-skill=/);
const expired = html(valid, {}, { animateAction: false });
assert.doesNotMatch(expired, /data-animation-skill=/);
assert.match(expired, /Bola de Fogo/);
assert.match(expired, /Herói: 87 de 120 HP/);
assert.match(html({ id: 'heal', actor: 'hero', kind: 'skill', skillId: 'n_cura', damage: 0, healing: 12 }, { heroClass: 'clerico' }), /data-animation-target="self"/);
const weapon = 'weapon_98bc20de-6d2f-44fd-8c8c-725dc9d3f004';
assert.match(html({ id: 'weapon', actor: 'hero', kind: 'skill', skillId: weapon, damage: 4 }, { heroClass: 'guerreiro' }), new RegExp('data-animation-skill="' + weapon + '"'));
console.log('Independent SSR probes: 7 cases PASS');
'@ | node
```

## Limites da evidência

Não executei suíte global no SHA inicial porque o import `./aprendiz` ausente causaria falha esperada de compilação. O root executa suíte global/build/TypeScript e QA em navegador separadamente. Esta revisão não demonstra aparência visual em 320/900 px, comportamento de leitor de tela, aplicação de SQL em banco local, schema/API remoto ou publicação. O snapshot de catálogo público foi conferido com o registry local, não com o banco vivo.
