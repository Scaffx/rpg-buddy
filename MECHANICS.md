# 📖 Sistemas do RPG Buddy

> Contrato da reforma local de 19/10/2026. Para recompensas já publicadas, confirme as funções
> vivas; migrations novas deste pacote ainda não demonstram aplicação em produção.

---

## 🕐 Short Rest (Descanso Breve)

- **Recuperação FIXA**: 30% do HP máx + 30% do MP máx, independente do tempo.
- Timer é gamificação/meditação — não afeta o cálculo.
- Persiste em `localStorage` (`short_rest_${user.id}`); ao retornar à aba, calcula tempo offline e completa se preciso.

---

## 🎯 XP de Missão — fórmula real

Fonte da concessão: RPC `complete_mission`; `src/hooks/useProfile.tsx` consome o total confirmado.

```
levelMultiplier = min(3.5, 1 + floor((nível − 1) / 5) × 0.5)
buffBonus       = xpBoost(+0.5)
                + flowXp(+0.2)
                + madrugador(+0.15 se hora < 8)
                + (streakMultiplier − 1)

priorityMult    = alta 2.0× | media 1.0× | baixa 0.2×
xpMultiplier    = levelMultiplier × (1 + buffBonus)
xpFinal         = round(xpBase × priorityMult × xpMultiplier) + checklistBonus
```

### Prioridade da missão

`xpBase` é o `xp_reward` da missão — na prática sempre o DEFAULT `25`, já que o app
nunca preenche a coluna. A prioridade é o que diferencia uma missão da outra:

| Prioridade | Multiplicador | XP base (com `xp_reward = 25`) |
|------------|---------------|--------------------------------|
| Alta 🔥    | 2.0×          | 50                             |
| Média 🛡️   | 1.0×          | 25                             |
| Baixa 🍺   | 0.2×          | 5                              |

- Aplicado nas RPCs `_complete_mission_daily` e `_complete_mission_with_weekly`
  após `20261019200215_mission_priority_daily_caps.sql`. Prioridade nula ou
  desconhecida cai em `media`.
- Espelhado no front em `PRIORITY_XP_MULT` / `getMissionBaseXp()`
  ([`src/lib/constants.ts`](src/lib/constants.ts)) — **os dois precisam mudar juntos**,
  senão o app promete um XP que o servidor não paga.
- **Teto por dia agendado:** 4 altas, 8 médias, baixas sem limite. Servidor valida
  criação, edição, reativação e pagamento; a prévia do formulário mostra as vagas.
  Semanal flexível reserva todos os dias. Legado acima do teto é preservado, mas
  conclusões não podem usar uma sequência de desfazer/refazer para furar o limite.
- Ouro **não** escala por prioridade — a economia segue o balanceamento 1.0.

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

### Bônus de streak (aditivo no `buffBonus`, como `streakMultiplier − 1`)

| Streak (dias) | Multiplicador | Bônus     |
|---------------|---------------|-----------|
| 3–6           | 1.1×          | +10%      |
| 7–13          | 1.3×          | +30%      |
| 14–20         | 1.5×          | +50%      |
| 21+           | **1.75× (teto)** | +75%   |

> O teto é em **21 dias** (janela de formação de hábito), não em 30. Fonte: `v_streak_mult` em
> `supabase/migrations/20260821120000_marcacao_retroativa_d1.sql`, espelhado por
> `getStreakXpMultiplier` / `getStreakXpBonusLabel` em `src/hooks/useProfile.tsx`.

### Bônus de checklist

- **XP**: cada item completo soma `xp_bonus` (default **+2 XP**) somente na conclusão
  da missão. Alternar checklist isoladamente não credita progressão.
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

Na definição viva consultada em 19/10/2026, `claim_daily_bonus` concede **0 XP, 0 ouro e
1 fragmento**. Constantes locais antigas abaixo são histórico, não contrato atual.

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

Login isolado não evolui XP, nível nem atributos. Verifique talentos de login no corpo vivo
antes de anunciar qualquer crédito adicional.

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
| Long Rest       | Ao completar Health Challenge | 100% HP/MP | 0 XP de desafio isolado |

O caminho publicado de cura permanece; a migration de progressão local remove o escritor
de 35 XP que não exigia conclusão da rotina.

### Penalidades dinâmicas (níveis > 15)

- Refeição faltante: −5% HP máx
- Água insuficiente: −10% MP máx
- Abaixo do nível 15: penalidade fixa (−10 HP / refeição faltante).

---

## 👹 Aventura automática e bosses

A rota `/boss` exibe uma cena 2D de aventura automática. O servidor define cada
sequência de ataques, habilidades, HP e resultado; a interface reproduz essa
sequência pelo relógio recebido. O jogador não precisa comandar os golpes.
Etapas 10, 20, 30 etc. são chefes do catálogo regular em ordem `(level,id)`, com
ciclo após o último. Etapa não equivale a nível.
No motor v4 de aventura automática, encontros normais têm três criaturas reais
simultâneas com 34 HP cada; etapas de chefe mantêm um único chefe com 150 HP.
O herói age pela primeira vez em 1,5 s e a cada 2,8 s. Os inimigos agem
inicialmente em 0,8/1,2/1,7 s e repetem a cada 2,9/3,4/3,8 s, respectivamente.
Cada evento usa o próximo relógio de um combatente vivo; um alvo morto deixa
de agir. Vitória exige zerar todas as barras inimigas; a morte do herói causa
derrota. Sem conclusão até 15 minutos simulados, o resultado é empate. O
limite de 1.200 eventos fica acima do máximo matemático de 1.134 ações nesses
15 minutos, portanto não corta vitórias defensivas antes do relógio. A linha
do tempo usa um único snapshot servidor de atributos, equipamento, skills e
pet elegível: o pet pode aumentar um atributo em 10% e sustentar HP, MP ou
reduzir custo de MP na ação do herói. A troca posterior de pet não altera uma
batalha iniciada. O dano inimigo normal é dividido pelos três integrantes da
horda antes do piso de 1; o chefe preserva a fórmula de poder anterior. Sem
skills inimigas, o dano básico da horda por ação é
`max(1, round((9+(poder-defesa)/2)/3))`; seu DPS inicial é esse dano multiplicado
por `(1/2,9+1/3,4+1/3,8)`. Para chefe, não há divisão por três e seu relógio
é 2,9 s. Um herói que causa apenas 1 dano a cada 2,8 s vence o chefe de
150 HP em 418,7 s, antes do empate.
Poder inimigo normal `min(380,20+floor(1.5*etapa))`; chefe
`min(400,30+floor(1.5*etapa))`. Estes são tetos da calibração inicial local.

Cada vitória completa na aventura paga de 1 a 48 ouro, conforme etapa, duração e
nível do herói, sem teto diário de ouro. Itens diretos têm limite de 2 por dia
em São Paulo. Derrota não retira XP/atributos. Combate jamais paga XP,
nível ou atributos permanentes. Ouro de missões continua.

A aventura considera o tempo fora do aplicativo e apresenta um resumo no retorno,
limitado à janela de 24 horas. A conciliação ocorre em lotes. Derrota causa recuo
automático de uma etapa (mínimo 1); o personagem continua enfrentando inimigos
nessa etapa, sem avançar após vitórias, até o jogador pedir para avançar novamente.
Essa permanência também vale fora do aplicativo. Ações de avanço validam o estado
atual e não aceitam uma etapa arbitrária. Batalhas repetidas podem conceder ouro e
itens conforme o limite diário e a cadência de itens diretos, sem duplicar
o pagamento de uma batalha ou o desbloqueio de um chefe. Golpes e encontros são
contínuos; o intervalo de 30 minutos condiciona apenas o drop direto de item,
não o crédito de ouro por vitória completa.
Pausar as animações não pausa o personagem nem altera o tempo elegível. Movimento
reduzido mantém o estado da luta legível sem obrigar o usuário a acompanhar efeitos.

### Portais cooperativos

Portais exigem de 2 a 4 jogadores e nível mínimo conferido pelo servidor para
todos os integrantes. O grupo é fixado ao iniciar a expedição. Os chefes são
sorteados do catálogo existente; um encontro com dois chefes mantém ambos em
combate, em vez de representar duas lutas separadas. Companheiros pertencentes
aos integrantes podem acompanhar o grupo. Pets não concedem XP, ouro ou
multiplicadores.

Composição: fácil `[1]`, média `[1,1]`, difícil `[1,2]`, lendária `[2,1]`.
Os números representam chefes simultâneos em cada encontro. Ultra lendária
`[2,2,1]` é uma calibração inicial da equipe. Níveis mínimos
`1/20/30/40/50` preservam os requisitos das dungeons existentes, com fácil
disponível no nível 1; são ajustáveis pela configuração.
Nenhuma alegação de vitória, dano, nível ou prêmio enviada pelo cliente autoriza
recompensa. XP e atributos continuam exclusivos das rotinas.

### Fórmulas do combate manual legado

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

Essas fórmulas visuais não autorizam recompensa no fluxo novo. A Edge manual legada
`processar_turno` exige auditoria de callers e publicação antes de qualquer uso; a UI solo
manual saiu da rota. `bosses.xp_reward` não é pago pela aventura.

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

- **Custo**: nenhum. Pagar 10 🪙 para restaurar XP foi **removido** — era um escritor de XP fora
  do `complete_mission`. `MISSION_FAILURE_PENALTY_GOLD` e a RPC `pay_mission_penalty` seguem no
  repositório sem chamador; ver `src/hooks/useFailedMissions.tsx` (`usePayPenalty REMOVIDO`).
- **Recuperação**: reabilita o dia para a sequência e **não concede XP nem ouro**. Teto de
  **2 recuperações por dia**.
- Streak: não é penalizada automaticamente se recuperada.
- **Streak Protector**: **2 cargas/semana** no reset; a 3ª só comprando na loja.
  `STREAK_PROTECTOR_MAX_CHARGES = 3` é o **teto**, não a concessão semanal.

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
| Combo buffs XP máx    | ~20× (multiplicativo)        | ~9.98× = 3.5 × (1 + 0.5 + 0.2 + 0.15 + 0.25 + 0.75), streak no teto de 21d |
| Daily Bonus           | 15 XP / 5 🪙 em versão antiga | Definição viva lida: 0 XP, 0 ouro, 1 fragmento |
| Checklist             | +XP apenas                   | +XP **e** +1 🪙 a cada 3 itens (até 3 🪙)    |
| Boss level on win     | combate manual legado       | Aventura não concede XP nem muda nível      |
