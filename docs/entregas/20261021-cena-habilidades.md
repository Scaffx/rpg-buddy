# Cena de habilidades — 21/10/2026

Base: `9a8033829c3f6dea546b4709e569958c0a046e61`. Escopo: `AutoAdventure`, `components/adventure`, testes visuais e prévia local. O MOTOR confirmou os campos opcionais de `contract.md` em 21/10; a integração com o parser/SQL dele ainda depende da composição dos worktrees.

## Contrato de exibição

`AdventureScene` recebe `stage`, `biome`, `heroClass`, `heroName`, `enemyName`, `isBoss`, `paused` e `frame`. O `frame` contém `status`, `heroHp`, `heroMaxHp`, `enemyHp`, `enemyMaxHp` e, quando presentes, `heroMp`, `heroMaxMp` e `action`. A `action` usa `id`, `actor`, `kind`, `skillName`, `effect`, `damage` e campos opcionais `mpCost`, `healing`, `rawDamage`, `damageMultiplier`, `effectNote`, `skillType`. `AutoAdventure` mapeia esses campos diretamente do evento do servidor e mostra apenas eventos cujo `at` já passou no relógio do servidor. Antes do primeiro evento de uma luta com MP, a barra parte de `hero_max_mp`; depois mostra o último `hero_mp` já publicado por um evento visível. Lutas legadas sem MP não ganham uma barra fictícia.

Cada evento `kind: skill` mostra o nome executado e, quando presentes, elemento, custo de MP, cura, dano bruto, multiplicador e nota de efeito. `kind: attack` aparece como ataque básico separado e não exibe custo de mana. A leitura do último evento permanece até o seguinte; a animação acaba após sua janela de 1,35 s. O resultado numérico continua vindo apenas do servidor. HP, MP, nomes e números ficam em painéis fora da área dos sprites. A cena informa que alterações de equipamento e habilidade valem na próxima luta iniciada, sem reescrever a luta atual.

## Movimento e efeitos

Mago e clérigo ao usar skill erguem cajado/mão, reúnem partículas e esfera, lançam projétil e mostram impacto. Arqueiro usa animação de arco e flecha. Classes de contato avançam em diagonal até alcance de golpe e retornam, sem salto de posição. Os sete elementos têm formas distintas: físico com cortes, arcano com runa, fogo com chama, gelo com cristal, raio com silhueta de relâmpago, natureza com folha e luz com raios. Pausa e preferência de movimento reduzido anulam a animação visual; relógio e eventos do servidor prosseguem. O botão de pausa usa `aria-pressed` e funciona por teclado via botão nativo.

## Prévia local para a revisão visual do root

Arquivos temporários **não rastreados**, a preservar até terminar a revisão: `.qa-effects.html` e `src/qa-effects.tsx`. No worktree desta entrega, o `node_modules` existente é junction; não instalar dependências. Rodar `npm run dev -- --host 127.0.0.1 --port 5179 --strictPort` e abrir `http://127.0.0.1:5179/.qa-effects.html`. Seletores: Classe, Efeito, Ação; botões: Repetir animação e Pausar animação. Os componentes são os reais, com dados fictícios e aviso **DADOS FICTÍCIOS / SEM RECOMPENSAS OU CONEXÃO À CONTA**. Teste HTTP local: HTML 200 e módulo TSX transformado 200. Ainda não houve inspeção por navegador ou teste humano neste worker.

## Verificação

- `npm test -- --run src/test/AdventureSceneEffects.test.tsx src/test/AutoAdventure.test.tsx`: 16/16 testes, exit 0. Exercita cast, MP, cura, resistência, sete efeitos, básico melee/arco, legado, pausa, leitura após animação e não vazamento de evento futuro.
- `npx eslint src/components/AutoAdventure.tsx src/components/adventure/AdventureScene.tsx src/test/AdventureSceneEffects.test.tsx src/test/AutoAdventure.test.tsx src/qa-effects.tsx`: exit 0.
- `npm run lint` (`eslint .`): exit 1, 590 erros e 29 avisos espalhados em arquivos fora deste escopo, por exemplo `ActiveTalentsBadge.tsx` e fontes Edge existentes. Não houve edição desses arquivos; lint dos arquivos tocados passou.
- `npx tsc --noEmit --pretty false`: exit 0.
- `npm run build`: exit 0; avisos existentes de caniuse antigo e chunks grandes.
- `git diff --check`: exit 0.

Limites: testes com fixtures e build local não validam schema/API vivos nem a renderização real em 320 px. Root fará Cua e amostras ao usuário. Acessórios visuais permanecem FUTURO, fora desta entrega.
