# Fixture composta Receitas → Economia → Baús (PG17 local)

## Escopo e fontes

Este complemento parte do replay reduzido e congelado dos 12 arquivos PR70 em
`supabase/tests/economy_composed_20261022/replay/`. O replay mantém o motor
`app_private.sync_auto_adventure()` real com MD5 `ef8da5af1aa65460a92f160df438462b`.
Os 12 SHA256, mais os snapshots, scripts e SQLs consumidos, estão em
`supabase/tests/economy_composed_20261022/sha256.json` (28 entradas, texto
normalizado para LF). O runner confere todos os hashes antes de iniciar
PostgreSQL; `.gitattributes` preserva LF no checkout do pacote.

Depois do replay, a extensão de Economia `sources/economy_live_extension_fixture.sql`
(SHA256 `B40D7D81ECD97BFA29C2EE5A490BF5846A0851B3EC9FB2D74CF18C229AF8E76F`)
adapta o schema reduzido para inventário, catálogo, loja, pets e identidade
privada. Ela é uma cópia exata de entrada da frente Economia, não uma segunda
implementação da extensão. O seed de saldos da mesma frente tem SHA256
`15EC30910037EC1FDCF3D56F61310E736EF2384F345A786F08AA0E57174DB561`.
Todos os perfis e saldos usados nos testes são fictícios; os snapshots JSON só
contêm metadados, definições de função e catálogo, sem perfis reais.

`20261022_crafting_prepare_live_source.ps1` foi reutilizado sem edição: com
`live-source-snapshot.json`, `live-source-supplement.json` e a cópia da migration
de classe, ele instalou as quatro fontes exatas exigidas por Receitas. Hashes
`pg_get_functiondef` conferidos: `sync ef8da5af1aa65460a92f160df438462b`,
`hero_class_key da6e71eb8c5a2087a1cd4296a5418652`,
`class_path_matches 883c77c3a430855102403124f67c790d`,
`set_inventory_equipped ba16fefce62bc1a6d06c30ef32c40813`. O SQL gerado
corresponde a `real_sources.sql` SHA256
`FDDFD1B6628B134D58BE927EFA3E140CB5376103ACF34C71BA235FAE04439A85`.
Também se verificaram as fontes pré Economia `purchase_game_item
c87e285ceb35e67951a1a1b72f6d1a25`, `buy_shop_item
cdb81d6e2dd7197db4e0c67d263a68b5`, `buy_pet
664ec81b0a86f65aad2cf7cc38db7b1b` e `has_boss_unlock
ff5c308462ba3096ac23d37b6fb08b1a`. A leitura do catálogo do projeto
Primary confirmou esses MD5s e owner/RLS relevantes, somente via SELECT.

`20261022_economy_composed_supplement.sql` (SHA256
`B705C881AE52CAB6A0A243E93A977E9F2EA8DF222E3DDDF80FF0104B89CD47A3`)
completa RLS de `game_items`, saldo legado de materiais, quatro identidades
fictícias e uma vitória histórica privada em um registro de battle com formato
v3 completo. Ele faz preflight de oito corpos exatos, sem substituir `sync` por
stub ou mudar as migrations. Deixa os três saldos do seed de Economia intactos
para conferir a transição 100→3800, 321→12198 e 848→32224.

## Ordem e resultado executado

Runner: `powershell -NoProfile -ExecutionPolicy Bypass -File
supabase/tests/economy_composed_20261022/run-composed.ps1 -Port 55789
-RunDirectory "$env:LOCALAPPDATA/Temp/rpg-economy-composed-20261022-canonical"`.
PostgreSQL local `17.9`, banco `economy_composed_verified`; logs preservados
em `C:\Users\Murillo\AppData\Local\Temp\rpg-economy-composed-20261022-canonical\logs`.

1. `auto_adventure_fixture.sql`, `20261019194052_auto_adventure.sql`,
   `boss_auto_fixture.sql`, `20261019205224_boss_auto_entitlements.sql`,
   `20261019211310_auto_adventure_reachable_catalog.sql`,
   `continuous_adventure_fixture.sql`,
   `20261020040128_continuous_adventure_battle_engine.sql`,
   `adventure_skill_motor_fixture.sql`,
   `adventure_skill_motor_legacy_setup.sql`,
   `20261021142812_continuous_adventure_skill_stats_engine.sql`,
   `20261021222452_five_realm_adventure_cycle.sql`,
   `20261022013316_adventure_catchup_retreat.sql`: **12 saídas 0**.
2. Extensão Economia, seed de saldos, quatro fontes exatas preparadas e
   `20261022_economy_composed_supplement.sql`: **4 saídas 0**.
3. `20261022022416_boss_recipes_crafting_salvage.sql`, snapshot
   `20261022022614_economy_victory_shop.sql` SHA256
   `0D6BAA8CE2DE26F5714FE482DEC567F5B9AED83F43EAFC2CE63452BA112EC2A2`,
   snapshot `20261022022726_adventure_chests_offline.sql` SHA256
   `32116EA170AEE83B4421F8D42C5BC945E07ED24E883EA58B466488A5DE682885`:
   **3 saídas 0**. O corpo Baús no root integrado tem SHA bruto distinto por
   CRLF, mas ambos têm SHA256 canônico LF
   `32116EA170AEE83B4421F8D42C5BC945E07ED24E883EA58B466488A5DE682885`;
   `git diff --no-index` não encontrou mudança
   semântica.
4. `sources/economy_assert.sql` e `composed_assert.sql`: **ambos exit 0**;
   `COMPOSED_ASSERT_PASS`, com rollback final para não alterar o banco de base.

Após as migrations: `sync 59914430e3b78e96f69deaf770f82910`,
`register_boss_recipe 859d52e06b6f95a3947a033116d71026` e
`advance_auto_adventure 09c5c400405def35917f1c63e4f58ac8`.
Receitas mantém a origem `register_boss_recipe` MD5
`c700ca0445ea165be93cf197bc4d85f4` até Economia aplicar o preço final
`min(200000,80000+3000*(stage/10-1))` em `022614`, incluindo catálogos já
abertos e geração futura. O guard de origem da Economia é executado antes de
qualquer escrita econômica.

O assert composto verificou o direito histórico sem materiais fabricados;
RLS/ACL; ancestralidade e identidade de classe reais; uma vitória `fighting→won`
gerando receita, dois recibos de material e um baú; craft com custo final,
replay sem débito adicional, equipamento pelo RPC real, início e replay do baú,
rejeição de resgate antecipado, rejeição de outra identidade, resgate maduro e
recibo/ledger único. Para simular tempo, o teste usa savepoint que devolve o
baú a `queued`, depois a transição permitida `queued→opening` com data passada;
o trigger de imutabilidade permanece habilitado. A linha de battle é sintética
e clonada de um registro v3 do replay para preservar o shape completo.

## Teardown e limites

`pg_ctl stop -m fast -w` saiu `0`; `pg_isready` na porta 55789 saiu `2`,
sem listener. Também foram encerradas as portas próprias 55784 e 55785;
55786, 55787 e 55788 tiveram teardown `0/2` pelo runner. A porta 55783 do root
permaneceu ativa e não foi modificada. Diretórios de dados e logs foram
preservados. A primeira tentativa automática na porta 55786 falhou por
PowerShell tratar um `NOTICE` do `psql` como erro antes de conferir exit; o
runner foi corrigido para decidir pelo exit do `psql`. A primeira checagem
canônica falhou antes de iniciar o banco porque Windows PowerShell não oferece
`Convert.ToHexString`; o cálculo SHA256 foi tornado compatível. A execução
íntegra na porta 55789 passou.

O snapshot Economia ainda veio de WIP não commitado no worktree irmão. Esta
execução comprova **exatamente os 28 arquivos hash-pinned deste pacote**, não
o commit final futuro da frente. Quando Economia congelar o commit, comparar
SHA256 canônico LF de suas fontes com `sha256.json`; se diferir, atualizar a
cópia explicitamente e repetir o runner em porta/diretório novos antes de
promover a composição. A fixture é schema reduzido e não prova todos os
objetos e dados vivos, PostgREST autenticado, concorrência entre chamadas,
interface montada, deploy ou produção. Não houve escrita remota, push ou merge.
