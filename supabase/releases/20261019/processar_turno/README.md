# `processar_turno` v33: patch para revisão, sem deploy

## Origem e integridade

- Fonte: `get_edge_function` no Supabase **Primary** em 19/10/2026, captura externa em `C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/sprint-20261019/live-edge-processar-turno.json`. Parsear o JSON externo e depois `content[0].text`; o código é `files[0].content` (`name=index.ts`).
- Metadados capturados: função `processar_turno`, `ACTIVE`, versão **33**, `verify_jwt=true`, `ezbr_sha256=efc225424a6c7bb7417ada4658570dd33d334d86383c414a6b0db41b9a7c54be`.
- SHA256 dos **bytes UTF-8 do conteúdo exato** de `published-v33.ts`: `c010dd703c9ebf3676252141d8893333856b38971b7b2debd6e5844851220c01`.
- SHA256 dos bytes UTF-8 de `index.ts` proposto: `6943cd24afe689cf8fb6f4b39f9a29eeb546cedfd773c38f0f2755c3cc44feba`.
- O `ezbr_sha256` é metadado do provedor; não foi tratado como hash dos bytes de `files[0].content`. `.gitattributes` desabilita a conversão de linha dos dois `.ts` para preservar os hashes após checkout.

## Diferença permitida

Partindo **somente** de `published-v33.ts`, foi removido o trecho contíguo publicado das linhas 1080–1223: o registro/recompensa da primeira vitória (`boss_battles`, `profiles.total_xp/level`, `user_balance.gold`, `activity_log` com XP) e o prêmio semanal (`boss_weekly_loot_claims`, ouro, materiais, inventário e recibo de prêmio). Inclui o `if` envolvente e a variável `isImmortalBoss`, que não têm finalidade após a retirada. O `getWeekStart` auxiliar e `lootDrop` ficam no arquivo por ser um patch mínimo; `loot_drop` continua na resposta, agora `null`. O contrato de combate, autenticação, assinatura, CORS, saúde e log de turno com `xp_gained:0` permanece byte a byte. A vitória/desbloqueio e os créditos canônicos devem vir da aventura SQL, fora deste patch.

O teste `src/test/legacyCombatRelease.test.ts` verifica que `index.ts` é exatamente `published-v33.ts` menos esse trecho, executa **ambos** os handlers com Deno/Supabase/Auth simulados e confere resposta, escrita de combate/saúde e ausência de tentativas de prêmio na proposta. Use `git diff --no-index -- published-v33.ts index.ts` para revisão humana. O resultado esperado do diff é apenas **145 linhas removidas**, nenhuma linha adicionada.

## Revisão e eventual deploy pelo coordenador

Antes de qualquer deploy, executar novamente `mcp__codex_apps__supabase_get_edge_function` com `{ link_id: "link_6abe70536ca4819193b60c2d9ba7d54a", project_id: "jfnospjxdkelxlhcwuia", function_slug: "processar_turno" }`. Comparar versão, estado, `verify_jwt`, `ezbr_sha256` e SHA256 exato de `files[0].content` com os valores acima; se qualquer um mudou, **parar e refazer o patch** sobre a nova publicação, sem sobrescrever às cegas.

Argumentos para revisão de `mcp__codex_apps__supabase_deploy_edge_function` (não executado nesta entrega):

```ts
{
  link_id: "link_6abe70536ca4819193b60c2d9ba7d54a",
  project_id: "jfnospjxdkelxlhcwuia",
  name: "processar_turno",
  entrypoint_path: "index.ts",
  files: [{ name: "index.ts", content: <conteúdo UTF-8 exato deste index.ts> }],
  verify_jwt: true
}
```

O arquivo canônico local `supabase/functions/processar_turno/index.ts` **não foi alterado**. Seu SHA256 observado na preparação era `8ab683ecc8b6f146c4c8beac87908e5f05377f6e7820c60aa16b47938cc1c21e`; ele contém mudanças locais anteriores não equivalentes à v33. Este release não afirma paridade com o canônico.

Rollback, se houver implantação futura desta proposta: confirmar a versão então publicada, depois usar os mesmos argumentos de deploy com `files[0].content` vindo de `published-v33.ts` e `verify_jwt=true`. Esse rollback reintroduz os prêmios legados e exige decisão operacional; não foi executado.
