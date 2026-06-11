# Auditoria de Combate — Bloco 1 (11/06/2026)

Fontes: **origin/main e490245** (local estava 173 commits atrás — tudo lido do
origin via worktree temporário), edge function **deployada v29** (conteúdo
idêntico ao origin/main, conferido), e o banco real **LIifeinRPG**
(`jfnospjxdkelxlhcwuia`) via MCP.

## ⚠️ Estado dos dados: combat_turn_logs está VAZIA

`COUNT(*)` real: `combat_turn_logs = 0`, `boss_battles = 0`, `combates_ativos = 0`,
`personagens = 0`, `usuarios = 1`. **Não existe nenhum turno de combate logado
neste banco.** Toda análise que dependia de log (sobrevivência por nível,
skill dominante/morta, curva real de dano, comportamento de compra) está
marcada **SEM DADOS** — entram aqui como inferência estática, sem mudança de
número às cegas.

---

## 1. Inventário (trechos reais)

### Bosses (60 linhas — curvas lineares)
| Nível | Exemplo | HP | ATK | DEF | XP (banco) | Ouro (banco) | Chaves |
|---|---|---|---|---|---|---|---|
| 1 | Goblin Feroz | 93 | 11 | 9 | 100 | 25 | 1 |
| 10 | Fênix Renascente | 280 | 33 | 23 | 820 | 160 | 5 |
| 30 | Imperador Draconiano | 790 | 83 | 56 | 2.420 | 460 | 15 |
| 47 | Odin (3v1, outlier) | **2.200** | 126 | 86 | 3.780 | 715 | 24 |
| 57 | Chronos (boss final) | 1.576 | 151 | 103 | 4.580 | 865 | 29 |
| 60 | 3 eventos mundiais | **15.000** | 153–158 | 105–107 | 4.660–4.820 | 880–910 | 29–30 |

Fórmulas: HP ≈ 93+18×(N−1) com degrau +25 a cada 5 níveis; ATK ≈ 11+2,5/nível;
DEF ≈ 9+1,7/nível; xp_reward = 20+80×N; gold_reward = 10+15×N; keys = ⌈N/2⌉.
(Obs. menor: coluna `difficulty` está com lixo de encoding — `"\t+P+P"`.)

### skill_tree_nodes (76 nodes, 6 árvores)
- **Ativas tier-0 "tronco" (inatas):** mpCost **0**, power 30–36, +10%/rank
  (ex.: `m_dardo` Dardo Arcano power 30; `g_golpe` Golpe Marcial 34).
- **Ativas tier-1 (com custo):** power 46–64, mpCost 5–9, cooldown 2–3
  (ex.: `m_estouro` power 62 / 9 MP; `g_ruptura` power 64 / 6 MP; `n_cura`
  heal 40 / 8 MP). Power escala +10%/rank no cliente (`CombatLoadout.tsx:62`);
  **o mpCost não escala** → custo-por-dano cai com rank.
- **Passivas (mod):** `element_dmg` 8%/rank (máx 3), `school_dmg` 7–8%/rank,
  `vs_status_dmg` 10%/rank, `combo_dmg` (Sobrecarga/shock) 12%/rank,
  `status_dur` +1 turno/rank. Lidas **server-side** (index.ts:496–515) ✔.
- **Variants (tier-3, 2 pontos):** `bonus_pct` 40–60 — **não aplicadas em
  lugar nenhum do combate** (CombatLoadout filtra `node_type==='skill'`;
  processar_turno não as conhece). Ponto gasto sem efeito. (O brief já admite.)

### Jogador no combate ativo (server)
`personagens` é **upsertado pelo cliente** na largada (useBossCombat.ts:222–229):
`hp_max = 120+8×nível`, `ataque_base = 14+2×nível`, `defesa_base = 8+1,4×nível`.
**Atributos, equipamento (atk/def/crit_bonus) e classe NÃO entram** no motor
server — só nível. Acerto/esquiva/crit **não existem** no motor (d20 só modula
dano; nunca erra). MP/HP vivem em `user_health_stats` (linha real do único
usuário: max_hp 144, max_mp 69, fadiga 35) — atualizados pelo **cliente** a
cada turno (CombatArena.tsx:756–766). Fadiga: o servidor só ESCREVE
(index.ts:928–964); nada no motor a lê para modificar dano.

### Itens e loja
- `game_items` (128): armas comum 20–40 ouro / ~4,6 atk; rara 140–312 / ~10,9;
  épica 315–668 / ~15,1; lendária 520–1.469 / ~44,6 atk.
- **Só as 7 armas iniciais comuns têm `weapon_skill`/`weapon_element`**
  (Corte Brutal 42/4MP, Pancada 50/5MP, Raio Sereno 36/5MP sagrado, etc.).
  Nenhuma rara/épica/lendária concede skill ou afinidade.
- `shop_items` (16, custo em %): só 2 tocam combate — Adrenalina (35%) e
  Buff Boss (55%) — e ambos só atuam em `useFightBoss()` (useBossCombat.ts:78),
  que **nenhuma página chama** (código morto). Na arena real não fazem nada.

---

## 2. Achados ranqueados por impacto

### #1 [dado sólido] Inflação de nível — curva antiga no processar_turno
`index.ts:1020`: `newLevel = max(level, floor(newXp/200)+1)`. Curva canônica é
`get_level_from_xp` (quadrática; Lv4 = 2.080 XP). Com 2.080 XP a vitória num
boss promove o jogador a **Lv11** (canônico: Lv4) e o `Math.max` torna isso
permanente. Quebra progressão, gates de classe, ranking e a dificuldade
relativa de todos os bosses. **Fix pronto:** `patch_processar_turno_dado_solido.md` (Fix 1).

### #2 [dado sólido] Servidor confia no cliente (o "gap de mana" continua aberto, e é maior)
- Mana: o check usa `current_mp` e `skill_mp_cost` **do body** (index.ts:411–432).
- Poder: `skill_power` do body soma `0,22×power` no ataque sem clamp
  (index.ts:570–571) e cura `power` direto (l.750). `skill_element`/`effect_type`
  também são do body. **Posse da skill nunca é checada.**
- RLS (pg_policies): cliente pode `UPDATE combates_ativos` (setar
  `hp_atual_boss=1`), upsert `personagens` (ataque arbitrário), `INSERT
  user_inventory` (auto-loot), `UPDATE user_health_stats` (MP/HP infinitos),
  `INSERT combat_turn_logs` (forjar a própria fonte de auditoria).
**Fixes:** `migration_01` (segura hoje — trava forja de logs);
`migration_02` (pronta, mas **gateada no Bloco 3** — lista os 4 fluxos de
cliente que precisam migrar antes); patch Fix 4 (clamp interino de power).

### #3 [dado sólido] Recompensa paga ≠ recompensa anunciada
Servidor paga `30×nível` XP / `5×nível` ouro (index.ts:1009–1010); banco/UI
anunciam `20+80×nível` / `10+15×nível`. Nível 10: anunciado 820 XP, pago 300.
**Fix pronto:** patch Fix 2 (ler `xp_reward`/`gold_reward` da linha do boss).

### #4 [dado sólido na estrutura] STACKING: multiplicativo sem teto
Resposta direta à pergunta do bloco:
- **Bônus de dano do jogador: MULTIPLICATIVO em cadeia, sem teto** —
  fraqueza ×1,5 (l.638) → árvore elemento (l.647) → escola (l.648) →
  Estilhaçar ×1,6+ (l.688) → Choque ×1,5+ (l.695) → Vulnerável ×1,2 (l.704) →
  vs_status por **cada** status ativo (l.709–714). Máximo legítimo ≈ ×7,3;
  com exploit do #2, ilimitado. É a mesma família do bug que você já teve.
- **Armadura: subtrativa, aplicada 1×** (`− floor(def×0,5)`, l.148) — sem stacking.
- **Acerto/esquiva: não existem** no motor; crit só no caminho morto (cap
  aditivo 65, combat.ts:165).
**Fix pronto:** patch Fix 3 — teto ×8 na cadeia (acima do máximo legítimo:
não nerfa combo, corta degenerado; valor do cap é calibrável).

### #5 [dado sólido] Loja/itens: caro estruturalmente inútil
(a) stats de equipamento não entram no combate ativo (ver inventário);
(b) armas raras+ (até 1.469 ouro) concedem MENOS função que as comuns
iniciais — zero `weapon_skill`/afinidade; (c) Adrenalina/Buff Boss mortos na
arena; (d) variants (2 pontos da árvore) sem efeito. **Sem migration de número:**
(b) é exatamente o sistema de **Cinzas de Guerra** (Bloco 2) — preencher
`weapon_skill` das armas altas é o veículo natural do buff, decidido lá.
(a), (c) e (d) entram como requisitos de design no Bloco 2/3.

### #6 [SEM DADOS → inferência estática] Sobrevivência, mana, curva de boss
`combat_turn_logs = 0`. O que a matemática estática sugere (validar com a view):
- **TTK cresce, TTD não:** tempo pra morrer ≈ 5 turnos constante em todo
  nível; tempo pra matar (sem status) ≈ 1,8t no nível 1 → ~7t no 20 → ~12,6t
  no 50. Cruzamento ≈ nível 12–15: daí em diante só ganha quem joga
  status/DoT (% do HP máx) e cc/cura — coerente com o brief ("DoT brilha
  anti-tank"), mas significa que **ataque básico/skill neutra vira inviável
  na cauda**, e classes sem DoT forte (Noviço) dependem de mods de cura que o
  motor ainda não aplica.
- **Mana quase nunca aperta:** pool real 69 MP vs custos 0–9; tronco custo-0;
  custo não escala com rank; rotação automática round-robin
  (CombatArena.tsx:770–792) já rotaciona o loadout — não há "escolha de skill"
  dentro da luta, logo dominância/morte de skill é decidida no LOADOUT, não no turno.
**Nenhum número alterado.** `migration_03` cria `vw_combat_balance` pra
próxima auditoria responder isso com dados.

---

## 3. Entregáveis
| Arquivo | Tipo | Status |
|---|---|---|
| `migration_01_dado_solido_lock_turn_logs.sql` | RLS | **Pronta, segura hoje** |
| `patch_processar_turno_dado_solido.md` | Edge function (4 fixes) | Pronta p/ aplicar+deploy |
| `migration_02_dado_solido_rls_POS_BLOCO3.sql` | RLS | Pronta, **gateada** (4 bloqueadores listados) |
| `migration_03_inferencias_instrumentacao.sql` | View | Pronta (só instrumentação) |

Nada foi aplicado no banco nem deployado.
