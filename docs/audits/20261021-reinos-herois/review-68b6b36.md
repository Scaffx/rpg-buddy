# Revisão independente: reinos, heróis e reação a dano

Base auditada: `68b6b36a236a3f5c15867c1ed8108a5007c290a8` (`Scaffx/revisao-reinos-20261021`, árvore limpa antes deste relatório). Referência: `origin/main` `5652d79b7eeefd68962bdb7c4f7a8549a4ec1e45`. Escopo: frontend e testes; sem SQL remoto, push ou deploy.

## Achado

**Médio — reação pode desaparecer antes do impacto quando o evento chega tarde à UI.** Em `src/components/AutoAdventure.tsx:143-145,167`, `animateAction` é verdadeiro apenas até 1.350 ms após o horário do evento e o relógio redesenha a cada 250 ms (`:45-56`). `src/components/adventure/AdventureScene.tsx:119` passa essa autorização ao hook, que remove o efeito assim que ela fica falsa (`src/components/adventure/useDamageReaction.ts:37-42,53-59`). O pico de recuo e brilho começa em 72% de 1.120 ms, cerca de 806 ms **depois da montagem**, em `src/components/adventure/damageReaction.css:11-12,41-65`. Se o primeiro snapshot visível chegar quando o evento já tem 800 ms, restam 550 ms de autorização; no máximo 250 ms depois do prazo, o próximo tick remove a reação em até 800 ms de reprodução, antes do pico. O evento real com dano positivo é consumido e não toca novamente. Esperado: alinhar o progresso visual ao horário do evento ou só iniciar um efeito cujo impacto possa ocorrer dentro da janela autorizada. Os testes atuais não cobrem primeiro recebimento tardio.

## Contratos conferidos

- `adventureBiome` em `src/lib/adventureVisuals.ts:4-12` mantém blocos 1–10 normal, 11–20 deserto, 21–30 água, 31–40 gelo, 41–50 fogo, 51 normal; o bioma do combate em curso precede o fallback. `AutoAdventure.tsx:146-155` usa `battle.stage` e `battle.biome`, preservando etapa 10 do chefe na cena.
- `creatures.data.ts:5-24`, `catalog.snapshot.json`, arte e VFX têm as seis identidades 4:0 escorpião, 4:1 cobra, 4:2 besouro, 5:0 lobo, 5:1 coruja, 5:2 golem; 0..3 continuam no registro. Correspondência por nome exato/bioma para criaturas e `bossId` exato para chefes em `enemies/registry.ts`.
- `AdventureHeroArtwork.tsx:24-87` fornece sete artes, preserva os grupos de pernas/corpo/braços/arma e escala estática `scale(.5)` dentro de `viewBox 32`; as animações CSS continuam nos grupos externos. O catálogo de skills contém 52 entradas ativas/variantes, e a prova de cobertura compara todas com o registro.
- `useDamageReaction.ts:29-59` exige evento novo, `animateAction === true`, estado de luta, dano finito positivo, sem bloqueio; direciona ao alvo oposto, encerra em 1.120 ms e consome IDs durante pausa, movimento reduzido e snapshots sem autoridade. O CSS move o herói para a esquerda e o inimigo para a direita (`damageReaction.css:41-54`), com pico nominal em ~806 ms; pausa e `prefers-reduced-motion` suprimem a animação.

## Evidência local

- `npx vitest run src/test/adventureRealms.test.tsx src/test/AdventureDamageReaction.test.tsx src/test/AutoAdventurePayload.test.ts src/test/EnemyAnimationCoverage.test.tsx src/components/adventure/heroes/AdventureHeroArtwork.test.tsx src/test/adventureScene.test.tsx src/test/AdventureSceneEffects.test.tsx`: 7 arquivos, 43 testes, saída 0.
- `npx vitest run src/test/SkillAnimationCoverage.test.tsx src/test/AutoAdventure.test.tsx src/test/AutoAdventureSync.test.tsx`: 3 arquivos, 21 testes, saída 0.
- `npx eslint` nos 12 arquivos de implementação TS/TSX alterados: saída 0, nenhum erro, um aviso `react-refresh/only-export-components` em `RealmCreaturesArtwork.tsx:3`.
- `npx tsc --noEmit -p tsconfig.app.json`: saída 2, 44 erros, nenhum nos arquivos de implementação tocados. O coordenador informa que os 44 são o baseline de `origin/main`; esta revisão não repetiu a compilação no SHA base.
- `git diff --check origin/main...HEAD`: saída 0. Nenhuma arte ou código de produto foi alterado.

## Limites

O coordenador fará QA visual no navegador e informou build aprovado e 18 criaturas/7 heróis sem overflow a 320 px; essa evidência não foi executada nesta revisão. O motor SQL será revisado em despacho posterior, após envio do SHA. A falha de tempo acima decorre do fluxo de relógio e CSS; não foi medida por captura visual cronometrada.
