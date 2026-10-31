# Revisão fria da cena de hordas — 2026-10-28

## Escopo e evidência

- Base Git: `d787af6499dfed0a0ea75f7431d57294d633a634`.
- Fonte: os quatro arquivos de `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/hordas-20261028/freeze-scene`. Não foram usados relatórios dos builders nem navegador nesta revisão.
- SHA256 do manifesto conferido antes e depois da leitura: `AdventureScene.tsx` `709B142E49EA6BBA0BDE53BC9C6A4D2B71B3E7E2972BABE14583AA046D712079`; `adventureScene.css` `83EEE22D45DD8621959AF75137EE1448EC91C4BD9A62419A83F6E655F4578E6B`; `BossPage.tsx` `4E8DCE98B7C397BDE44879FE14377D3EE6BE5D69DE40548EF78561C1E4061C76`; `AdventureHordeScene.test.tsx` `8969A2444C919EA13833254100E9016E6033EB7AE67C8CA3CA6F77C48D29945C`.
- Teste local: `node_modules/.bin/vitest.cmd run src/test/AdventureHordeScene.test.tsx --reporter=dot` — 10/10 passaram. A cena e seu teste no worktree tinham os mesmos hashes do congelamento antes da execução.

## Achado acionável

### P1 — VFX do Clérigo ignora o alvo por slot na horda

**Cenário.** Em horda de três inimigos, um evento confirmado `n_luz` ou `n_sag_var` do Clérigo contra `targetSlot: 0` deve terminar no inimigo da primeira coluna inimiga, em 38% da largura. Em `src/components/adventure/adventureScene.css:108-110,142-143` (arquivo congelado), a camada recebe `--horde-target-x: 38%` e repassa esse valor por `--skill-target-x`. `src/components/adventure/AdventureScene.tsx:307-317` monta o VFX registrado dentro dessa camada. Porém o elemento interno `.vfx-clerico` redefine `--skill-source-x: 25%` e `--skill-target-x: 75%` em `src/components/adventure/skills/clerico.css:1-3` (importado, lido somente para entender o efeito). Variáveis definidas no próprio filho prevalecem sobre as herdadas: a estrela/coluna termina em 75%, independentemente do `targetSlot`, e a fonte surge em 25% em vez de 13%. `n_cura` e demais efeitos de suporte também aparecem em 25%, fora do herói da horda. A HP e a reação por ID podem apontar corretamente para o slot 0 enquanto o VFX mostra outro local, quebrando a identidade visual do alvo.

**Correção sugerida.** No CSS da cena congelada, sobrescrever os valores no próprio `.vfx-clerico` dentro de `.adventure-horde-event-layer`, usando `var(--horde-source-x)` e `var(--horde-target-x)`, e preservar `target='self'` para que o alvo seja a origem. Cobrir em teste os valores calculados do efeito do Clérigo para `targetSlot: 0`, `1`, `2` e suporte próprio; o teste congelado atual verifica presença e offsets gerais, mas não esse VFX interno.

## Limite do parecer

Esta revisão aceita somente o recorte congelado da cena, sujeito ao P1 acima. Não avalia mudanças concorrentes no core/servidor, integração, dados remotos nem a experiência visual em navegador; a inspeção de CSS e os 10 testes locais sustentam o achado, não um aceite de release.
