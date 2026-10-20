# Portais cooperativos — entrega local

Base de trabalho: `c60476a45302b12df44b972536726471ae3ce6f3`. Esta entrega ainda **não foi aplicada em produção**.

## Estado e drift verificados

- `PortalEventPage` usava `DungeonArena` para o portal diário e `FragmentDungeonArena` para fragmentos. Ambos podiam declarar vitória no cliente. O lobby antigo aceitava atributos enviados pelo cliente e até 8 jogadores.
- A migração histórica `20260508210000_daily_portal_redesign.sql` concedia fragmentos e dungeon pendente ao executar `complete_portal_run` após uma vitória alegada. A consulta **readonly** ao projeto `jfnospjxdkelxlhcwuia` em 2026-10-20 encontrou 2 overloads: o de 3 argumentos ainda executável por `authenticated`, mas seu corpo ativo grava XP/ouro/fragmentos como zero e não concede recompensas; o de 5 não é executável. O novo caminho não depende dessa função. A revogação da assinatura ativa impede um registro de conclusão solo, não corrige uma concessão ativa de recompensas.
- `20260531007000_per_player_portal_rarity.sql` mudou a cor para `player_portal_rolls` por jogador. A dificuldade da sala diária segue a cor persistida do **host** por `_get_or_roll_portal_color`. Cada vencedor recebe seu próprio `portal_runs.portal_color` e a chance de fragmento correspondente à própria cor.
- A consulta readonly confirmou `guard_profiles_economy` e `guard_profiles_progression_insert`, ambos habilitados (`tgenabled='O'`): o primeiro impede `authenticated`/`anon` de alterar nível/XP; o segundo exige nível inicial 1 e XP inicial zero. A fixture local reproduz os guardas e seus bindings. Nenhum trigger novo de progressão é criado.
- `portal_runs` e `player_portal_fragments` já negavam escrita direta no projeto ativo. O lobby antigo ainda concedia INSERT/UPDATE nas tabelas de sessão/jogadores. Os únicos callers de `complete_portal_run`, `create_fragment_dungeon`, `join_fragment_dungeon` e `claim_pending_dungeon` no código cliente estão no hook legado `usePortalEvent`; a nova página não os usa. O SQL revoga as assinaturas exatas e a escrita direta nas duas tabelas de lobby. `get_active_portal_event`, `scan_portal` e `get_public_fragment_dungeons` são funções `SECURITY DEFINER` de owner `postgres` e continuam executáveis apesar da revogação de `_get_or_roll_portal_color` para o cliente.
- O gate inicial da migration compara as 5 assinaturas antigas e `_get_or_roll_portal_color` com owner, `SECURITY DEFINER`, ACL e MD5 do corpo (normalizado para LF). Também exige os dois triggers de progressão ativos. Qualquer drift observado bloqueia a migration antes de criar objetos.

## Contrato novo

| Dificuldade | Nível mínimo de todos | Encontros |
| --- | ---: | --- |
| Fácil (`blue`) | 1 | 1 boss |
| Médio (`yellow`) | 20 | 1 boss, depois 1 boss |
| Difícil (`red`) | 30 | 1 boss, depois 2 juntos |
| Lendário (`legendary`) | 40 | 2 juntos, depois 1 |
| Ultralendário (`ultra`, fragmentos) | 50 | 2 juntos, depois 2 juntos, depois 1 |

Os limites e as sequências são **provisórios e reversíveis** em `portal_coop_config`. A cor diária só produz fácil/médio/difícil/lendário; ultralendário é invocado com fragmentos. O host paga 10 fragmentos na criação da sala de fragmentos. Se houver dungeon pendente do mesmo tier, a criação a consome. O inventário legado permanece na mesma tabela.

`portal_coop_create`, `portal_coop_join`, `portal_coop_start`, `portal_coop_state`, `portal_coop_my_sessions` e `portal_coop_action` são as assinaturas RPC públicas: wrappers `SECURITY INVOKER` com execução só para `authenticated`. Os corpos `SECURITY DEFINER SET search_path=''` ficam em `app_private`, com checagens de `auth.uid()` e membership; o helper de snapshot também é privado e não tem `EXECUTE` para clientes. Não aceitam atributos, dano, HP, boss ou vitória do cliente. A sala aceita no máximo 4, e start exige no mínimo 2; o lock da linha da sala serializa join/start/turnos. O host inicia, mas os convidados permanecem membros e podem reabrir a sala em `my_sessions`. O roster e as estatísticas são recarregados de perfis e companheiros reais no start e depois ficam congelados. O `companion_id` é uma seleção explícita de loadout do portal, validada por dono, papel de combate e HP; ausência de companheiro é permitida. Não existe flag de companheiro equipado no banco atual (`equipped_item_id` equipa um item no companheiro), portanto a seleção do portal é a fonte de verdade para este combate.

Os bosses são sorteados sem repetição do catálogo `public.bosses` numa faixa compatível com a dificuldade, excluindo finais e eventos mundiais. A ação do jogador usa ataque básico mais assistência limitada do companheiro; as habilidades específicas do catálogo ainda não têm interpretação no motor de portal e **não são simuladas**. O servidor calcula dano, contra-ataques, HP, expiração em 30 minutos, passagem automática ao encontro seguinte e linha do tempo. Repetição do mesmo `action_id` devolve o resultado gravado. A vitória diária insere `portal_runs` para cada vencedor com XP/ouro zero, usa a cor pessoal para a chance de fragmentos e sorteia dungeon pendente somente para novos vencedores. Uma vitória paralela já registrada não recebe recompensa de novo. Fragmentos não concedem XP, ouro, nível ou atributos; pets também não concedem multiplicadores desses recursos.

## Evidência local

- PostgreSQL 17.9 local descartável, porta 56248: fixture → migração → `src/test/sql/portal_coop_assert.sql`, `psql -v ON_ERROR_STOP=1`, **exit 0**. O SQL cobriu 2, 3 e 4 jogadores; bloqueio solo, quinto jogador e nível insuficiente; níveis 1/20/30/40/50; cor pessoal; boss duplo e encontros sequenciais; dono do companheiro; membro externo; replay de ação/criação; zero XP/ouro; guardas reais de `profiles`; grants de wrappers públicos, core privado e helper; permissões legadas fechadas.
- Gate de drift negativo: após alterar `complete_portal_run(uuid,integer,integer)` para `SECURITY INVOKER` em fixture separada, a migration falhou com **exit 3** e `portal_coop_config` não foi criada.
- SHA-256 da migration testada: `8C0898DDE09862C5C6A99EE568624C4C978AC93E4D14895BAE5A2E75B84EF43B`.
- Concorrência real com duas conexões `psql` simultâneas sobre sala de 3 integrantes: um join **exit 0**, o outro **exit 1** com `Sala cheia: máximo 4 jogadores`; consulta posterior confirmou contagem **4**. O primeiro cliente segurou a transação por 2 segundos para testar o lock.
- `vite build`: **exit 0** com dependências por junction para execução. `eslint` dos dois arquivos TypeScript alterados: **exit 0**. `tsc -p tsconfig.app.json`: **44 erros preexistentes em outros arquivos**, nenhum em `PortalEventPage.tsx`/`useCoopPortal.ts`.
- Estado dos artefatos locais: PostgreSQL parado por `pg_ctl stop -m fast`, cluster preservado em `C:\Users\Murillo\AppData\Local\Temp\portal-coop-pg-task_8374598ba6d4-v2` (porta 56248) e log em `C:\Users\Murillo\AppData\Local\Temp\portal-coop-pg-v2.log`. A junction `node_modules` permanece no workspace, apontando para `C:\Users\Murillo\Desktop\RPG-Buddy\rpg-buddy\node_modules`; nenhum dado ou dependência foi apagado.
- Nenhuma migration, função ou dado foi escrito no projeto ativo. O teste usa fixture local de schema mínimo, não comprova aplicação no schema completo de produção.

## Antes de promover

1. Comparar hashes/assinaturas, owners, corpos e grants das funções legadas do ambiente alvo novamente; a consulta acima é um retrato de 2026-10-20. Bloquear aplicação se houver drift. Os guardas de `profiles` existentes devem permanecer ativos.
2. Aplicar a migration em uma cópia local do schema completo e repetir o SQL de aceitação, incluindo os triggers de fragmentos e revelação reais. O teste de fixture não carrega o histórico integral de migrations.
3. Validar com usuários autenticados distintos via API e dois navegadores: convite, reconexão, scanner, HP e história da interface. A UI foi compilada, mas não recebeu teste de navegador com sessão real.
4. Revisar balanceamento: os números de nível, HP, ataque básico, defesa, chance de fragmentos e sequência ultra são provisórios. A trilha mantém `pending_dungeon`, mas não reproduz o item lendário antigo nem efeitos de habilidades de boss/companheiro.
