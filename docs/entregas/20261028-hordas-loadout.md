# Loadout: recarga da aventura automática em segundos

- Branch `Scaffx/rpg-hordas-continuas-20261028`, base `d787af6`. Alterações limitadas a `CombatLoadout.tsx` e às chaves `app.habhub.skill_cost_cooldown` de `pt.json` e `en.json`.
- O motor agenda a disponibilidade após `(cooldown + 1) * 2800 ms`. O loadout agora apresenta `2,8 s`, `5,6 s`, `8,4 s` etc. com separador decimal do idioma, custo em MP e rótulo explícito da aventura automática, tanto na lista equipada como nos cartões. O valor de `cooldown` salvo no perfil permanece o contador legado.
- `npm run build`: passou. `vitest run src/test/habilidadesHubReset.test.tsx`: 6 testes passaram. ESLint do componente: 24 erros `no-explicit-any`, os mesmos 24 presentes em `HEAD`; nenhum diagnóstico novo nos trechos alterados. `git diff --check`: passou.
- O mock de tradução em `habilidadesHubReset.test.tsx` ainda lê `turns`; está fora deste ownership e seus testes não validam o texto traduzido. Verificação visual no navegador fica com a coordenação.
