# Ajuste do aviso de classe no loadout — 21/10/2026

## Base e diagnóstico

Branch `Scaffx/rpg-loadout-ui-20261021`, criado do `main` `88020171fa1ab841e505d8a4bb8348e077acad4a` após `git status --short` limpo. O branch anterior `Scaffx/combate-skills-motor-20261021` e seu commit `4fcb0fc86f8e885cc05b90e6fed884a9ec24d42d` foram preservados. BUG38 já foi consultado pelo coordenador; esta execução não escreveu no Notion.

No perfil publicado do Mago Lv1, `starter_class=mago`, `current_class_id=NULL`, `m_dardo` alocado e equipado. `useHeroClass.hasClass` é verdadeiro, então `CombatLoadout` inclui a skill da árvore em `allSkills`. Um segundo predicado exigia `current_class_id` para exibir a skill sem aviso; ele mostrava `class_choice_required` duas vezes apesar de a escolha inicial estar persistida e aceita pelo servidor.

## Alteração

Removido o aviso redundante nas linhas do loadout e do catálogo. A inclusão de skills de classe continua condicionada a `hasClass`; sem escolha real, o nó de classe e uma entrada prévia no JSON do loadout não ficam disponíveis. Skills alocadas de Aprendiz continuam no caminho próprio; ordem, custo, cooldown, salvar e reset permanecem no mesmo fluxo.

O texto `app.skilltree.hint` em português e inglês agora distingue habilidades ativas equipadas com efeitos suportados de passivos e variantes que ainda não afetam a aventura. Não promete efeitos de dano contínuo, queimadura, congelamento ou área.

## Verificação local

| Comando | Exit | Resultado |
| --- | ---: | --- |
| `npx --no-install vitest run src/test/habilidadesHubReset.test.tsx` | 0 | 6 testes; regressões DOM de Mago Lv1 com classe persistida e `current_class_id=NULL`, ausência de árvore de classe sem escolha e preservação de Aprendiz; ordem/save/reset existentes passam. |
| `node -e "JSON.parse(require('fs').readFileSync('src/i18n/locales/pt.json','utf8')); JSON.parse(require('fs').readFileSync('src/i18n/locales/en.json','utf8')); console.log('pt/en JSON PASS')"` | 0 | `pt/en JSON PASS`. |
| `git diff --check` | 0 | Sem erro de whitespace. |

Os testes DOM usam mocks dos hooks e Supabase; não demonstram a sessão publicada nem validação visual no navegador. Nenhum DDL, RPC, regra de Auth/economia, dependência ou deployment foi alterado. O coordenador fará revisão, cherry-pick, PR, publicação e reteste publicado.
