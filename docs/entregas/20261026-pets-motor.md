# Pets autoritativos no combate automático — 2026-10-26

## Escopo e fonte

- Base: `ed51cf02e100021927feb84fc9e06c7b50895ab0`, worktree `rpg-pets-motor-20261026`.
- Migration: `supabase/migrations/20261026185325_adventure_pets_authoritative.sql`, gerada com Supabase CLI `2.121.0` (`npx --yes supabase@2.121.0 migration new adventure_pets_authoritative`, pacote apenas no cache npm; `package.json`, lockfile e `node_modules` não mudaram).
- Contrato: `contract-v1.json` e `live-sources.json` em `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/pets-combate-20261026/`.
- O preflight compara corpo normalizado, dono, ACL, search_path e volatilidade de sync, advance, simulador, payload, compra, escolha de nível 3 e guards de companions. Também exige RLS/direitos de INSERT, colunas de identidade e trigger guard ativo, sem `WHEN`, com binding exato. Qualquer drift aborta antes de DDL.

## Contrato entregue

- `public.get_adventure_pet_state()` retorna `{enabled,active_companion_id,pets}`; cada pet inclui `{id,companion_type,name,bonus:{stat,pct},sustain}`. Mesmo com `enabled=false`, `pets` lista as posses do usuário, mas `active_companion_id` é `null`.
- `public.set_active_adventure_pet(p_companion_id uuid DEFAULT NULL)` aceita somente o ID, usa `auth.uid()` e devolve o mesmo estado. Só permite um pet reconhecido e possuído. `null` remove a seleção. Repetir a mesma seleção não acrescenta histórico.
- `battle.pet` é `null` para lutas sem pet/legadas ou o snapshot imutável `{companion_id,companion_type,name,bonus,sustain,base_stats:{atk,def,hp,mp},effective_stats:{atk,def,hp,mp}}`. Os valores são guardados em `app_private.adventure_battles.rules_snapshot`, inacessível para DML do cliente.
- Os eventos mantêm `kind=attack|skill`, `actor=hero|enemy` e `effect_note` existente. Kraken, após ação inimiga sobrevivida, aumenta `hero_hp` e `healing`; Necromante aumenta `hero_mp`; Leviatã reduz `mp_cost` antes da seleção da skill. Nenhum enum novo.
- O catálogo espelha os 12 bônus de `src/lib/pets.ts`: 10% arredondado com `round` PostgreSQL nos stats iniciais, inclusive a ofensiva canônica usada por mago/clérigo. Kraken cura 5% do HP máximo, Necromante regenera 8% do MP máximo e Leviatã reduz custo em 20%; há clamp no máximo, custo mínimo conforme arredondamento atual e nenhuma ressurreição.

## Autoridade, tempo e isolamento

- O motor usa apenas `companions.id/user_id/companion_type/name` protegidos e catálogo SQL fixo; ignora `level/xp/atk/def/max_hp/max_mp/mood` editáveis. A migration revoga `EXECUTE` cliente dos dois trigger helpers antigos após validar sua fonte exata; mantém compra, escolha de nível 3, forrageio e `DELETE` legítimo. `ON DELETE SET NULL` invalida seleção ativa sem bloquear exclusão nem apagar o snapshot de uma batalha já criada.
- Seleções são registradas em `app_private.adventure_pet_selection` com relógio do servidor. Cada batalha consulta a última seleção em `started_at`; o catch-up reabre os stats base protegidos do predecessor v3 antes de aplicar a escolha daquele instante, sem empilhar bônus. Predecessor legado continua no motor legado e publica `pet:null`.
- O gate inicia com `global_enabled=false` e allowlist vazia. Histórico privado registra cada ativação/desativação global e cada entrada/remoção da allowlist com relógio do servidor. Desligar o gate só afeta batalhas cujo `started_at` é posterior ao desligamento; snapshots criados não são reescritos. Após reabilitar, é preciso selecionar novamente para ter um horário efetivo novo.
- Nenhuma função aceita dano, vitória, estágio, recompensa, relógio, tipo/atributos do pet ou identidade de outro usuário do cliente. Não há fonte de XP/nível/atributos pessoais nem multiplicador direto de ouro, drop, receita, baú ou ledger. O bônus pode alterar o resultado do combate; recompensas continuam nas regras existentes do motor.

## SQL de staging para a coordenação

Executar apenas por uma sessão administrativa autorizada, depois de verificar a migration no alvo. **Nenhuma destas escritas foi executada pelo worker.** A conta de QA precisa ter um pet obtido por `choose_level3_companion` (nível 3, escolha única) ou `buy_pet` (desbloqueio por boss e saldo), sem INSERT artificial em `companions`.

```sql
-- Liberar somente a conta de QA; enabled_at é sobrescrito pelo trigger.
INSERT INTO app_private.adventure_pet_allowlist(user_id)
VALUES ('<uuid-da-conta-qa>'::uuid)
ON CONFLICT (user_id) DO NOTHING;

-- Revogar a conta de QA prospectivamente.
DELETE FROM app_private.adventure_pet_allowlist
WHERE user_id='<uuid-da-conta-qa>'::uuid;

-- Ativação global, apenas após QA autenticado.
UPDATE app_private.adventure_pet_rollout
SET global_enabled=true,enabled_at=clock_timestamp()
WHERE singleton AND NOT global_enabled;

-- Desligamento global prospectivo. Allowlist ainda existente continua habilitada.
UPDATE app_private.adventure_pet_rollout
SET global_enabled=false,enabled_at=NULL
WHERE singleton AND global_enabled;

-- Para desligar também todas as contas excepcionadas:
DELETE FROM app_private.adventure_pet_allowlist;
```

O trigger define os instantes reais de ativação/desativação, ignorando um `enabled_at` fornecido na atualização. Desativar não revoga pet de batalha já criada; reativar exige nova seleção pelo RPC. Essas instruções são um handoff, não autorização para alterar produção.

## Verificação local

- Runner: `supabase/tests/pets_authoritative_20261026/verify-local.ps1`. PostgreSQL 17, porta própria `55899`, cluster isolado, dados e logs preservados em `C:/Users/Murillo/AppData/Local/Temp/rpg-pets-authoritative-final6-20261026/`. O runner valida SHA256 LF das cinco migrations reais no checkout e usa a composição fonte Economia referenciada em `verify-final-source-284db26.ps1`; o hash final do sync antes da nova migration é `59914430e3b78e96f69deaf770f82910`, advance `09c5c400405def35917f1c63e4f58ac8`.
- Resultado final: fonte/composição/5 migrations, migration nova, `assert`, `identity_guard` com UPDATE/DELETE direto como `authenticated`, matriz de 12 tipos, offline, mago/clérigo/legado, duas sessões de seleção duplicada e switch+sync: **exit 0**. Cinco clones com drift de corpo, binding/`WHEN`, ACL de coluna, nulidade de identidade e dono falharam no preflight: **exit 3** cada, sem DDL novo.
- Teardown: `pg_ctl stop exit=0`, `pg_isready` após parada `exit=2`.
- Limite: fixture local composta e snapshot de fonte não provam compatibilidade do projeto vivo, gateway/PostgREST ou browser autenticado. Root controla allowlist, QA autenticado, integração, publicação e gate global.
