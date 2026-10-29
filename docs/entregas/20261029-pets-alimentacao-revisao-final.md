# Revisão fria final: alimentação, cuidado e bônus efetivo de pets

**Veredito [Certo]: os P1 de ACL herdada e de rótulo nominal na luta foram corrigidos no candidato congelado; o pacote ainda não deve ser liberado.** O P2 de disponibilidade após 4097 refeições vencidas segue reproduzível. Esta revisão foi somente leitura do produto: não editei SQL, cliente, testes ou estado remoto; as mutações de prova ocorreram exclusivamente em um cluster PostgreSQL 17.9 temporário que criei e parei.

## Fonte examinada

- [Certo] Checkout `rpg-auth-foco-20261026`, branch `Scaffx/rpg-hordas-continuas-20261028`, HEAD `c13d5ab3da2af18987ca2f08cd5793d4f8a10c00`, com WIP de outras frentes preservado. O coordenador confirmou o congelamento FINAL da migração após o término do dono SQL; recalculei SHA256 após normalização CRLF→LF antes e depois das provas. O hash antigo `BEBAB5937A459EB1D24589C8E14D5AF5AAD207ED52FE82619D62C91B52876927` pertence só à revisão inicial e não fundamenta este veredito.

| Fonte | SHA256 LF final |
| --- | --- |
| `supabase/migrations/20261029120000_pet_food_and_care.sql` | `DBCF6D117E0A33931641C48561D99035DAC6F85E4B501CCDA2726024A432AE7A` |
| `src/lib/autoAdventurePayload.ts` | `EB4E0B071BF6464346E88B0EE53657892898E84766CEFF4C72786E6548B5A2ED` |
| `src/components/AdventurePetPanel.tsx` | `33DB1A0AC57CA990B1C60038E88A24D67D5366A304BC5C5613ACF5AA649DDA39` |
| `src/lib/pets.ts` | `46F054C480809BEA4FFC414FE7998C18D3319141EA0C3517A56DFDD6998E87EB` |
| `src/pages/ProfilePage.tsx` | `1C4155AFCBC1A20DE1FDF52BDF694B1A61A22803BC6FAC4608CE97162450E3E2` |

## Achados e provas

### P1 fechado — ACL herdada não consegue truncar o catálogo

- [Certo, PG17 executado] O preflight em `supabase/migrations/20261029120000_pet_food_and_care.sql:58-68` percorre `pg_default_acl` e `pg_has_role(...,'MEMBER')`, inclusive membership aninhado; o postflight em `:553-614` confere privilégios efetivos das cinco tabelas e quatro funções privadas, incluindo `TRUNCATE`, além das funções públicas. No meu clone pré-target, `authenticated` herdou de dois papéis intermediários um `TRUNCATE` padrão e recebeu `USAGE` em `app_private`. A migração **rejeitou antes de DDL** com exit 3 e `PET_CARE_TABLE_OR_DEFAULT_ACL_DRIFT` na linha 96. Uma sonda separada com `EXECUTE` padrão herdado aninhado de função teve o mesmo exit 3. Em ambos, `atomic_no_target=t`: nenhuma das cinco tabelas, funções alvo ou 13 SKUs foi criada; `md5(pg_get_functiondef(sync_auto_adventure))` ficou `ac245e92bd69d87f79a26039ae618265` antes e depois.
- [Certo, PG17 executado] No banco positivo, as cinco tabelas negaram `SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN` a `anon`, `authenticated` e `service_role`; as quatro funções privadas negaram `EXECUTE` a esses papéis. A consulta de `pg_default_acl` pós-migração não encontrou grant perigoso para `PUBLIC` ou papéis herdados. Com `USAGE` temporário no esquema, `SET ROLE authenticated; TRUNCATE app_private.pet_food_catalog` foi negado e o catálogo manteve **13/13** SKUs. Os probes independentes estão em `C:/Users/Murillo/AppData/Local/Temp/rpg-pet-care-coldreview-20261029/independent/` (`inspect-table`, `inspect-function`, `pet_review_*-migration`, `pet_review_*-post`, `positive`, `truncate-positive`).
- [Certo, PG17 executado] O runner do mesmo hash terminou exit 0 em `C:/Users/Murillo/AppData/Local/Temp/rpg-pet-care-coldreview-20261029/logs/`: migração positiva, ACL/identidade, baseline, compra/recibo, batalha, seis processos concorrentes, wrappers de horda/poções e onze rejeições de drift com fingerprint antes/depois igual. A restauração do membership de teste passou. O manifesto registra os hashes LF dos quatro predecessores e da captura local do consumidor genérico.

### P1 fechado — luta mostra 5%, não 10% nominal

- [Certo, código e teste executado] `src/lib/autoAdventurePayload.ts:286-310` retém `participation`, `care_as_of`, `effective_bonus` e `effective_sustain` como quarteto; rejeita campos parciais, tipos/intervalos inválidos, stat/kind divergente e sustain incompatível. O snapshot legado sem quarteto permanece válido e não recebe campos de cuidado inventados. `src/components/AdventurePetPanel.tsx:21-41` lê o efeito efetivo **congelado** da luta: participação `0,5` com bônus nominal `10%` e sustain nominal `5%` aparece como `+5% HP máx` e `+2,5% HP/turno`. A seleção atual não altera o texto da luta; a próxima seleção em `:50` usa o rótulo `máximo`. O formato preserva zero e até quatro casas decimais no percentual para a precisão de seis casas da fração SQL. O cliente não usa relógio, catálogo ou cuidado corrente para recalcular o efeito.
- [Certo, teste executado] Rodei `npm test -- src/test/PetCareBattleSnapshot.test.ts src/test/AdventurePetPanel.test.tsx src/test/inventoryBeforeKit.test.tsx`: **3 arquivos, 25 testes, todos passaram**. O recorte inclui 50%, 75%, 100%, 62,5%, zero, campos parciais/malformados, legado e troca de seleção após montar o painel. O runner PG17 também passou `PET_CARE_BATTLE_PASS`, confirmando o snapshot e aplicação do efeito no servidor. O resultado de **667 testes**, build verde e 44 diagnósticos TypeScript de baseline é evidência declarada pelo autor da UI em `20261029-pets-bonus-efetivo-fix.md`; não repeti esses gates globais.
- [Certo, leitura do diff] `src/lib/pets.ts:16-20` reconhece somente os UUIDs reservados `...000001` a `...000013`; o SQL insere exatamente os 13 em `:107-126`. `src/pages/ProfilePage.tsx:2476-2493` mostra quantidade/estoque automático sem botão “Usar” para esses IDs. O teste montado cobriu SKU 8, uma poção comum ainda com “Usar” e equipamento preservado. O patch do painel/parser/classificador é puro; não adiciona RPC, query ou fetch. A cadência de refetch também foi alterada por outra frente no mesmo checkout e não foi atribuída a este conserto.

### P2 aberto — limite de 4096 pode bloquear a conta

- [Certo, PG17 executado] `supabase/migrations/20261029120000_pet_food_and_care.sql:235` ainda lança `54000` quando a liquidação exigiria mais de 4096 recibos. Reexecutei o probe rollback-only contra o hash final: com 4097 vencimentos e 4097 unidades, duas leituras de `get_pet_care_state`, compra e cuidado falharam; o consumo genérico recusou a comida, estoque ficou 4097 e recibos zero (`independent/cap.log`: `CAP_WEDGE_REPRODUCED failures=5 stock=4097 receipts=0`). As operações chamam o mesmo helper em `:357`, `:426`, `:465` e no início de batalha em `:520`. É um cenário extremo (~11,2 anos), mas sem saída normal documentada. Exige liquidação em lotes com progresso durável e prova de corte histórico antes de encerrar o P2.
- [Certo, PG17 executado] O probe de histórico no hash final preservou `participation=0.875000` em um corte de 36 h antes e depois de compra/cuidado tardios, com um recibo anterior ao corte e dois no total (`independent/asof.log`). Esse caso específico não resolve o wedge nem prova todos os caminhos de catch-up.

## Limites para liberação

1. [Certo] O clone é reduzido: omite `20261029054922_mission_d1_server_start_and_weekly_close.sql` porque o fixture não contém `public.complete_mission(uuid,date)`. A prova local não cobre a cadeia lexical completa. O replay também restaurou apenas o RLS conhecido de `gold_history`; os logs identificam a diferença.
2. [Certo] A amostra de benchmark do runner cobre 30 contas **sem pets**, não múltiplos pets vencidos, 256 lutas de catch-up ou 1200 eventos. Não mede o custo nem o bloqueio em produção.
3. [Certo] Ainda faltam navegador autenticado em staging para bônus reduzido, resposta perdida, consulta de recibo, duas abas, troca de conta/token e RPC ausente; preflight autorizado do estado efetivo de Primary (definições, owner, membership, ACL/RLS, `pg_default_acl`, overloads); cadeia completa em clone compatível; e decisão explícita de recuperação do P2. Nenhum teste local autoriza deploy ou SQL remoto.
4. [Certo] O cluster próprio usou porta 55947 e foi parado com `pg_ctl stop -m fast -w` exit 0; `pg_isready` depois da parada retornou 2. Não toquei o cluster do autor na porta 55946, outro processo, commit, push ou deploy.
