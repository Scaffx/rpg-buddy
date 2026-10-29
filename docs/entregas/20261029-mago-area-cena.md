# Mago em área e cena sobreposta — 2026-10-29

## Escopo e estado

Checkout `Scaffx/rpg-hordas-continuas-20261028`, base `addddcb7a1d0e7a1d919107dd632a75a01bbc22d`, inicialmente limpo. Esta frente alterou somente contrato/parser/projetor e apresentação frontend, testes focados e este relatório. A migração SQL e o componente do pet foram produzidos por outras frentes; nenhuma alteração de SQL, Auth, `useAutoAdventure` ou `pets.ts` foi feita aqui.

## Contrato e cena

- `AdventureAttack`/`HordeEvent` aceitam `target_slots` e `hits` opcionais. Replays v3 e v4 sem os novos campos continuam aceitos. Para eventos v4 novos, o parser exige arrays pareados, alvos únicos e válidos (um a três, conforme o encontro), a mesma ordem entre slots/hits, primeiro alvo igual a `target_slot`, dano agregado igual à soma dos hits, e bounds de HP/MP, dano por alvo e tempo dentro da batalha. Cura e buff aceitam arrays vazios com dano zero e alvo singular nulo; eventos inimigos antigos sem arrays continuam válidos.
- O projetor preserva um único evento de cast e seus hits, filtra ações futuras pelo tempo confirmado do servidor e mantém o snapshot `battle.pet` para a cena. MP e HP são lidos do evento confirmado, sem calcular gasto ou dano no cliente.
- A horda conserva movimentos independentes do herói e dos três inimigos. Um cast sobreposto não oculta o ataque inimigo nem a reação de dano no alvo que também ataca. O número flutuante de dano usa o hit daquele slot; o readout resume dano e MP uma vez. Para vários hits, o dano bruto mostrado é a soma dos valores brutos, sem anunciar um multiplicador único que não existe para o grupo.
- Meteoro, Nova Gélida e Tornado usam um gesto de caster e impactos compactos apenas nos slots confirmados, inclusive quando restam dois ou um alvo. Bola de Fogo, Dardo, Lança de Gelo e Singularidade preservam VFX singulares. As animações mantêm a janela ativa, offsets da idade inicial e pausa/redução de movimento existentes.
- `AdventurePetCompanion` recebe apenas `frame.pet`, originado de `battle.pet`. Fica em uma âncora estável fora do sprite keyed por ação, inclusive na cena legada, para o ciclo cosmético de 15 s não reiniciar a cada golpe. Pet nulo ou desconhecido não aparece.
- O loadout continua salvando o ID da habilidade base. Quando a variante de área correspondente está aprendida na árvore do mago, o rótulo explica o efeito na próxima luta; a variante não entra como opção equipável nem altera o payload salvo.

## Evidência local

- `npm test -- --run src/test/AdventureMageArea.test.tsx src/test/CombatLoadoutMageArea.test.tsx src/test/AutoAdventureHorde.test.ts src/test/AutoAdventureHordeComponent.test.tsx src/test/AutoAdventureHordeFixture.test.ts src/test/AdventureSceneEffects.test.tsx src/test/AdventurePetCompanion.test.tsx`: 32 testes passaram. Os testes novos cobrem três e dois alvos, slot morto, chefe, quatro movimentos simultâneos, MP uma vez, danos distintos, contrato malformado, v4 sem campos, legado, pet estável, pausa, redução de movimento e evento atrasado.
- `npx eslint` nos arquivos TS/TSX novos e de cena/contrato: passou. `CombatLoadout.tsx` mantém 24 erros `no-explicit-any` já presentes no arquivo antes desta alteração.
- `npm run build`: passou. `npx tsc -p tsconfig.app.json --noEmit --pretty false`: 44 erros em arquivos fora desta frente, nenhum em arquivo tocado. O comando raiz `npx tsc --noEmit` isolado não verifica o projeto de app porque `tsconfig.json` usa referências.
- `git diff --check`: sem erro de whitespace.

## Limites

Os testes de UI usam fixtures e jsdom; eles não provam a função SQL em PostgreSQL 17, uma sessão autenticada nem VFX em navegador real. A migração é de outra frente e precisa de sua própria validação PG17; QA visual de desktop/celular e preview externo ficam com a coordenação. Nenhum commit, push ou deploy foi feito.

No rascunho SQL lido às 04:11 UTC, debuff/cc sem golpe ainda emitiam `target_slots=[]`, `hits=[]` e `target_slot` não nulo. O parser rejeita essa combinação conforme o contrato combinado; o desvio foi comunicado ao coordenador para correção pelo dono do motor antes da integração final.
