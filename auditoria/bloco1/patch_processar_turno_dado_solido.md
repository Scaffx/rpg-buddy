# Patch — `supabase/functions/processar_turno/index.ts` — [DADO SÓLIDO]

Três correções no edge function (deployado v29 == origin/main, verificado por
conteúdo em 11/06/2026). Linhas referem-se ao `index.ts` do origin/main.
Reversível: cada trecho mantém o valor antigo em comentário.

---

## Fix 1 — Inflação de nível (curva antiga 200 XP/nível)  ← MAIOR IMPACTO

**Linha 1020.** A vitória de boss recalcula nível com a curva LINEAR antiga e
faz ratchet com `Math.max`. A curva canônica é `get_level_from_xp` (quadrática,
migration `20260508240000_recalc_levels_new_xp_curve.sql`: Lv4 = 2.080 XP).
Com 2.080 XP, `floor(2080/200)+1 = 11` → jogador Lv4 vira **Lv11 permanente**
na primeira vitória de boss.

```ts
// ANTES (linha 1020):
// const newLevel = Math.max(toNumber(profileRewards.level, 1), Math.floor(newXp / 200) + 1);

// DEPOIS — usa a curva canônica do banco; mantém o Math.max para nunca rebaixar:
const { data: canonicalLevel } = await supabase.rpc('get_level_from_xp', { p_xp: newXp });
const newLevel = Math.max(toNumber(profileRewards.level, 1), toNumber(canonicalLevel, 1));
```

---

## Fix 2 — Recompensas divergem do banco (e da UI)

**Linhas 1009–1010.** O servidor paga `max(50, 30×nível)` XP e `max(10, 5×nível)`
ouro, mas a tabela `bosses` define `xp_reward = 20+80×nível` e
`gold_reward = 10+15×nível` — e é ISSO que a UI anuncia (commit 98be8c5 já
corrigiu o Imortal para ler do banco). Nível 10: anunciado 820 XP, pago 300.

```ts
// ANTES (linhas 1009-1010):
// const xpReward = Math.max(50, bossLevel * 30);
// const goldReward = Math.max(10, bossLevel * 5);

// DEPOIS — fonte única = linha do boss já carregada no combate:
const xpReward = Math.max(50, toNumber((combat.bosses as any)?.xp_reward, bossLevel * 30));
const goldReward = Math.max(10, toNumber((combat.bosses as any)?.gold_reward, bossLevel * 5));
```

E acrescentar `xp_reward, gold_reward` ao select do combate (linha 447):

```ts
// ANTES: bosses!combates_ativos_boss_id_fkey(id, name, ataque_base, defesa_base, level, hp, element, skills, signature_item_name)
// DEPOIS: bosses!combates_ativos_boss_id_fkey(id, name, ataque_base, defesa_base, level, hp, element, skills, signature_item_name, xp_reward, gold_reward)
```

---

## Fix 3 — Teto de segurança na cadeia multiplicativa de dano

**Linhas 584–714.** Todos os bônus do jogador multiplicam EM CADEIA, sem teto
global: fraqueza elemental ×1.5 (l.638) → árvore elemento ×(1+8%×rank) (l.647)
→ árvore escola ×(1+7%×rank) (l.648) → Estilhaçar ×1.6+mods (l.688) → Choque
×1.5+mods (l.695) → Vulnerável ×1.2 (l.704) → vs_status ×(1+10%×rank) por CADA
status ativo (l.709–714). Produto legítimo máximo hoje ≈ ×7.3; com
`skill_power` forjado (ver Fix 4) é ilimitado. Mesma classe do bug de
multiplicação sem teto que já ocorreu antes.

O teto NÃO nerfa combo nenhum (fica acima do máximo legítimo) — só corta o
caso degenerado, alinhado ao brief ("combo manda; comprime via encontro").

```ts
// Inserir APÓS a linha 589 (logo depois do calculateDamage):
const baseDanoPosDefesa = danoPlayer; // referência pré-bônus para o teto

// Inserir APÓS a linha 714 (fim do loop vs_status), antes do decaimento:
// Teto de segurança da cadeia de bônus. Máximo legítimo com a árvore atual ≈ ×7.3.
// VALOR DO CAP (8) é calibrável — estrutura é [dado sólido], magnitude [inferência].
const DAMAGE_CHAIN_CAP = 8;
if (danoPlayer > baseDanoPosDefesa * DAMAGE_CHAIN_CAP) {
  danoPlayer = Math.floor(baseDanoPosDefesa * DAMAGE_CHAIN_CAP);
  bossEffectLog.push(`chain_cap:${DAMAGE_CHAIN_CAP}x`);
}
```

---

## Fix 4 — Mitigação imediata do gap "cliente decide poder/cura" (interina até o Bloco 3)

**Linhas 413, 570–571, 750.** `skill_power` vem do body e: (a) soma
`0.22×power` no ataque SEM clamp (l.570-571 — `power: 100000` → +22.000 de
ataque); (b) cura exatamente `power` sem teto (l.750). O fix DEFINITIVO
(servidor resolve a skill por posse real — árvore + arma equipada) é Bloco 3;
este clamp fecha a janela já:

```ts
// ANTES (linha 413):
// const requestedSkillPower = Math.max(0, toNumber(body.skill_power, 0));

// DEPOIS — maior power legítimo hoje: 64 (Ruptura) ×1.4 (rank 5) = 90; arma = 50.
// Clamp 120 dá folga p/ conteúdo futuro sem permitir exploit:
const requestedSkillPower = clamp(toNumber(body.skill_power, 0), 0, 120);
```

---

## Deploy

Os 4 fixes são no mesmo arquivo. Após aprovação:
1. aplicar no `supabase/functions/processar_turno/index.ts` (origin/main);
2. `supabase functions deploy processar_turno` (vira v30);
3. rollback = redeploy do commit anterior (v29 preservada no histórico de versões).
