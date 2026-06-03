# 📖 Sistemas do RPG Buddy

> Fonte canônica das fórmulas. Em caso de divergência com a UI, o **código** manda — esta doc espelha o que está em `src/lib/` e `src/hooks/useProfile.tsx`.

---

## 🕐 Short Rest (Descanso Breve)

- **Recuperação FIXA**: 30% do HP máx + 30% do MP máx, independente do tempo.
- Timer é gamificação/meditação — não afeta o cálculo.
- Persiste em `localStorage` (`short_rest_${user.id}`); ao retornar à aba, calcula tempo offline e completa se preciso.

---

## 🎯 XP de Missão — fórmula real

Arquivo: [`src/hooks/useProfile.tsx`](src/hooks/useProfile.tsx) (função `useCompleteMission`).

```
levelMultiplier = min(3.5, 1 + floor((nível − 1) / 5) × 0.5)
buffBonus       = xpBoost(+0.5)
                + flowXp(+0.2)
                + madrugador(+0.15 se hora < 8)
                + (streakMultiplier − 1)

xpMultiplier    = levelMultiplier × (1 + buffBonus)
xpFinal         = round(xpBase × xpMultiplier) + checklistBonus
```

### `levelMultiplier` por nível (capado em 3.5×)

| Nível    | Multiplicador |
|----------|---------------|
| 1–4      | 1.0×          |
| 5–9      | 1.5×          |
| 10–14    | 2.0×          |
| 15–19    | 2.5×          |
| 20–24    | 3.0×          |
| 25+      | **3.5× (cap)** |

> O cap existe para evitar inflação de XP em níveis altos. Antes, no Lv 60 o multiplier era 7× e, combinado com buffs multiplicativos, podia chegar a ~20× em uma única missão.

### Bônus de streak (aditivo no `buffBonus`)

| Streak (dias) | Bônus     |
|---------------|-----------|
| 3–6           | +10%      |
| 7–13          | +25%      |
| 14–29         | +50%      |
| 30+           | +100%     |

### Bônus de checklist

- **XP**: cada item completo soma `xp_bonus` (default **+2 XP**).
- **Ouro**: +1 🪙 a cada 3 itens completos (até 3 🪙).

### Missões de NPC

- `npc_id` definido → **XP final = 0**, apenas ouro é concedido.

---

## 💰 Ouro de Missão

Arquivo: [`src/hooks/useProfile.tsx`](src/hooks/useProfile.tsx) (`getMissionGoldRewardFromStreakWithTalent`).

```
goldBase     = 2
streakBonus  = min(2, floor(streakConsecutivo / 3))   // 0, 1 ou 2
checklistBonus = min(3, floor(itensCompletos / 3))    // 0..3
goldFinal    = max(0, round((goldBase + streakBonus + checklistBonus) × talentGoldMultiplier))
```

- `talentGoldMultiplier` = 2× se talento `ordem_no_caos` proc-ar (20% chance em missões `casa`) ou `fotossintese` em missões `ar_livre`.
- `foco_inabalavel` (talento) estende o gap máximo entre conclusões diárias de 1 para 2 dias.

---

## 🎁 Daily Bonus

Arquivo: [`src/lib/constants.ts`](src/lib/constants.ts) (`getDailyBonusXp`, `getDailyBonusGold`).

```
xp   = 15 + (nível − 1) × 3
ouro =  5 + floor((nível − 1) / 5)
```

| Nível | XP  | Ouro |
|-------|-----|------|
| 1     | 15  | 5    |
| 5     | 27  | 5    |
| 10    | 42  | 6    |
| 20    | 72  | 8    |
| 30    | 102 | 10   |

**Investidor Anjo** (talento): +1 🪙 no 1º login do dia se streak ofensiva global > 5.

---

## 🎖️ Talentos (Feats)

### Pontos de talento ganhos

```
1 ponto a cada 5 níveis (Lv 5, 10, 15, …)
```

Trigger no banco concede automaticamente ao subir de nível.

### Talentos relevantes para balance

| Nome                  | Efeito                                                                |
|-----------------------|-----------------------------------------------------------------------|
| **Madrugador**        | +15% XP aditivo se completar antes das 8h                            |
| **Foco Inabalável**   | Combo 48h em vez de 24h                                              |
| **XP Boost / Foco Profundo** | +50% XP aditivo (via buff ativo `xp_boost`/`foco_profundo`)   |
| **Flow XP buff**      | +20% XP aditivo                                                      |
| **Mestre Mercador**   | 10% desconto na loja                                                 |
| **Ordem no Caos**     | 20% chance de 2× ouro em missões `casa`                              |
| **Fotossíntese**      | 2× ouro em missões `ar_livre`                                        |
| **Investidor Anjo**   | +1 🪙 diário se streak > 5                                            |

---

## 🏥 Saúde

| Tipo            | Duração   | Recuperação    | XP   |
|-----------------|-----------|----------------|------|
| Short Rest      | 1–60 min  | 30% HP/MP      | 0    |
| Long Rest       | Ao completar Health Challenge | 100% HP/MP | **+`getHealthChallengeXp(nível)`** |

`getHealthChallengeXp(nível) = 35 + (nível − 1) × 4`

### Penalidades dinâmicas (níveis > 15)

- Refeição faltante: −5% HP máx
- Água insuficiente: −10% MP máx
- Abaixo do nível 15: penalidade fixa (−10 HP / refeição faltante).

---

## 👹 Boss Battles

Arquivo: [`src/pages/BossPage.tsx`](src/pages/BossPage.tsx) + [`src/lib/combat.ts`](src/lib/combat.ts) (`getBossCombatStats`).

### Stats do Boss

```
base = nível × 7 + floor(hp / 10)
atk  = base + 10 + nível × 2
matk = base + 8 + (nível par ? nível × 2 : nível)
def  = base + 6 + floor(nível × 1.8)
agi  = base + 4 + floor(nível × 1.5)
threat = round((base × 1.6 + hp × 0.35) / 10)
```

### Stats do Jogador

```
hp  = 100 + nível × 12 + Força × 8 + Vitalidade × 14
mp  = 40  + nível × 8  + Inteligência × 10 + Sabedoria × 6
atk = nível × 4 + Força × 6 + Disciplina × 2
matk = nível × 3 + Inteligência × 4 + Sabedoria × 2
def = nível × 3 + Resiliência × 5 + Vitalidade × 3
agi = nível × 2 + Agilidade × 6 + Criatividade × 2
crit% = min(65, 5 + floor((Agilidade + Criatividade + Carisma) × 0.9))
```

### Recompensas

```
xpReward   = max(50, boss.xp_reward   || nível × 80 + 20)
goldReward = max(10, boss.gold_reward || nível × 15 + 10)
```

**Bug corrigido**: o cálculo de nível ao vencer usava `floor(xp/200) + 1` (pulava níveis). Agora usa `getLevelFromXp()` da tabela `XP_TABLE`.

### Inspiração no combate

- **Combat Adrenaline**: +2× multiplicador no ataque rolado.
- **Boss Debuff**: reduz `bossPowerMultiplier` para 0.8 (−20%).

### Chaves de Boss

- 1 chave a cada **5 missões** concluídas (qualquer tipo).

---

## ✨ Inspiração Semanal

- Ganha **+1 Inspiração** ao completar todas missões diárias do dia (perfect day).
- Cap: 1 inspiração por semana.
- Local: `Meu Perfil`.

---

## ⚠️ Penalidades por Missão Falhada

- **Custo**: 10 🪙 para "pagar a penalidade" (constante `MISSION_FAILURE_PENALTY_GOLD`).
- **Recuperação**: restaura o XP que seria ganho.
- Streak: não é penalizada automaticamente se recuperada.
- **Streak Protector**: até 3 cargas/semana (constante `STREAK_PROTECTOR_MAX_CHARGES`).

---

## 📊 Progressão de Nível

Arquivo: [`src/lib/progression.ts`](src/lib/progression.ts) — `XP_TABLE` (cumulativo).

```
Lv 1   →      0 XP
Lv 5   →  3 600 XP
Lv 10  → 19 200 XP
Lv 15  → 51 800 XP
Lv 20  → 106 400 XP
Lv 30  → 301 600 XP
Lv 40  → 644 800 XP
Lv 50  → 1 176 000 XP
Lv 60  → 1 935 200 XP
```

Fórmula incremental: `incremento(N) = 300·N + 20·N²`.

---

## 🔧 Atributos (11 tipos)

`Força · Agilidade · Vitalidade · Inteligência · Sabedoria · Disciplina · Carisma · Criatividade · Relacionamento · Resiliência · Autoaperfeiçoamento`

- Cada atributo tem **nível e XP próprios** (`xp` cumulativo, `level` derivado por `getLevelFromXp`).
- Missão concede XP a 1 atributo primário (XP total) + atributos secundários (12 XP fixo cada).
- Cores e mapping em [`src/lib/attributes.ts`](src/lib/attributes.ts).

---

## 🪙 Outras recompensas fixas

| Item                   | Valor                          | Onde |
|------------------------|--------------------------------|------|
| Achievement (XP/Ouro)  | 30 XP / 20 🪙                  | `constants.ts` |
| NPC weekly challenge   | Baked por challenge no DB     | tabela `npc_weekly_challenges` |
| NPC missão via chat    | 0 XP (NPC), 2 🪙 base + streak | DB default `xp_reward=25` (ignorado) |
| Respec de classe       | 120 🪙                         | `constants.ts` `RESPEC_COST` |

---

## 🧮 Resumo de escala

| Item                  | Antes (bugado/quebrado)      | Agora                                       |
|-----------------------|------------------------------|---------------------------------------------|
| XP multiplier (Lv 60) | 7× sem cap                   | 3.5× cap                                    |
| Combo buffs XP máx    | ~20× (multiplicativo)        | ~9.45× (aditivo + cap, com streak 30d)      |
| Daily Bonus           | 15 XP / 5 🪙 fixo            | Escala com nível (15→102 XP, 5→10 🪙)        |
| Checklist             | +XP apenas                   | +XP **e** +1 🪙 a cada 3 itens (até 3 🪙)    |
| Boss level on win     | `floor(xp/200) + 1` (bug)    | `getLevelFromXp(xp)` (tabela oficial)       |
