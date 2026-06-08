# Brief de Design — Combos & Balanceamento (sessão dedicada)

> Objetivo deste doc: dar contexto COMPLETO para uma sessão futura (possivelmente fora deste
> chat) focada **só** em criar/analisar **combos, tipos de combo por classe, combos de time e
> balanceamento** de todas as habilidades. O resto do jogo já está funcional e revisado — este é
> o foco principal agora, pensando inclusive em **PvP futuro**.

## 1. Filosofia (o norte)
- **Meio-termo robusto:** nem MMORPG gigante e intimidador, nem simples demais (que enjoa).
  Profundidade suficiente pra reter quem gosta de RPG, acessível pra quem não quer complexidade.
- **Poder vem da PROFUNDIDADE, não da quantidade:** focar/maxar 2 elementos > espalhar em vários
  fracos. Pontos da árvore são limitados (1/nível). Loadout é **livre** (leva todas as upadas).
- **Identidade de classe clara** + **liberdade de armas** (Cinzas de Guerra do Elden Ring).
- **Atributos de vida real escalam o combate** (Força=pesado, Agilidade=rápido+sangramento, Int/Sab=magia).

## 2. Estado atual (baseline que JÁ existe — não rediscutir, partir daqui)
**Motor (`processar_turno` edge function, v29):** turnos d20, server-authoritative. Aplica:
- **Status (persistem entre turnos em `combates_ativos.boss_status`):**
  - 🔥 Queimadura (burning): DoT ~2.5%/turno do HP máx, dura turnos.
  - 🩸 Sangramento (bleeding): stacks (até 5), DoT ~1.5%×stacks/turno, decai 1/turno.
  - 🧪 Veneno (poison): DoT ~2%/turno.
  - 💧 Molhado (wet): habilita combo de raio.
  - ❄️ Congelado (frozen): boss perde o turno; físico estilhaça.
  - 🎯 Vulnerável (vulnerable): +20% de dano recebido.
- **Combos atuais:** Estilhaçar (físico em Congelado, +60%), Choque (Raio em Molhado, +50% + atordoa),
  Vapor (fogo em molhado evapora). Aplicação por ELEMENTO: água→molhado, gelo→congelado,
  fogo→queimadura, natureza→veneno; físico cortante→sangramento; debuff→vulnerável.
- **Matchup elemental:** sagrado +50% vs trevas/mortos-vivos; fogo↔gelo; água←raio/natureza; etc.
- **Passivos da árvore aplicados:** `element_dmg` (+% por elemento), `school_dmg` (físico/mágico),
  `combo_dmg` (Estilhaçar/Choque), `vs_status_dmg` (+% vs alvo com status), `status_dur` (+turnos).
- **Skills da arma:** a arma equipada concede 1 skill + afinidade/elemento (usada no ataque básico).

**Árvores (tabela `skill_tree_nodes`, por classe):** 6 classes-base prontas:
- Mago (fogo/gelo/raio/arcano) · Espadachim (força/sangramento/infusão-fogo) ·
  Gatuno (furtividade/sangramento/veneno) · Ferreiro (força/infusão/forja-crafting) ·
  Arqueiro (precisão/flecha-fogo/flecha-gelo) · Noviço (sagrado/suporte).
- Nós: `skill` (ativa, equipável), `passive` (mod, ranks), `variant` (transforma a skill — **ainda
  não aplicado no combate**). Gates por pontos gastos; exclusividade por `exclusive_group`; prereq.

**Limitações conhecidas do motor (a evoluir na sessão):**
- `variant` (Meteoro/Tornado/etc.) ainda NÃO transforma a skill no combate.
- Sem mods de cura/defesa/HP/crit aplicados (Noviço suporte e crit de Gatuno/Arqueiro ficam fracos).
- Combos hoje são SOLO (1 jogador aplica e explora). **Combos de time não existem ainda.**
- Combate co-op (`DungeonArena`) é separado e não usa o motor de status/combo.

## 3. Eixos de combo a desenhar (o coração da sessão)
1. **Intra-classe (foco-2):** capstones que premiam investir fundo em 2 galhos.
   - Cross-element do MESMO jogador: **Gelo+Raio → Tornado Gélido**, **Fogo+Arcano → meteoro+estrelas**,
     **Fogo+Gelo → choque térmico**, etc. (nó que exige rank em ambos os galhos).
2. **Por classe (identidade):**
   - Mago: encadeia elementos (aplicar status → explorar). Espadachim: sangramento rápido + estilhaçar.
   - Gatuno: marca (vulnerável/stealth) → burst. Arqueiro: precisão/crit + flechas elementais.
   - Noviço: suporte (cura/escudo/taunt). Ferreiro: pesado + forja.
3. **Combos de TIME (2v2 / dungeon 4) — novo:** um aplica status, outro explora.
   - Ex.: Mago **congela** → Espadachim **estilhaça**. Gatuno **marca (vulnerável)** → time toda
     ganha +dano. Arqueiro **molha**? (água) → Mago dá **Choque**. Noviço **buffa/taunta**.
   - Requer o combate co-op (`DungeonArena`) compartilhar o `boss_status` entre os jogadores.
4. **PvP (futuro):** triângulo dano/tank/suporte; caps de status (anti-stun-lock); duração de DoT
   menor vs players; healer/tank relevantes. Pensar cedo pra não retrabalhar.

## 4. Framework de balanceamento (alavancas + números atuais)
- **DoT:** queimadura 2.5% · sangramento 1.5%×stack · veneno 2% (do HP máx/turno).
- **Combos:** Estilhaçar +60% · Choque +50% · Vulnerável +20%. **Passivos** +6~12%/rank.
- **Pontos:** 1/nível (~60 no cap). Maxar 1 galho (skill+2 passivos+variante) ≈ vários pontos →
  não dá pra maxar tudo → escolhas importam.
- **Anti-tank (bosses tanky, Odin 2200/eventos 15000):** DoT % e sangramento brilham; recompensa builds rápidas.
- **Alvo de sensação:** lutas de ~4–10 turnos no solo; combos viram o "momento de ouro".

## 5. Perguntas em aberto (decidir na sessão)
- Como o combate de time compartilha status do boss? (mesma `combates_ativos`? nova tabela co-op?)
- `variant` no combate: como representar (multiplicador? AOE? recast?).
- Mods de cura/defesa/crit no motor (pro Noviço/Gatuno/Arqueiro): adicionar?
- Sangramento estilo Elden Ring (medidor→proc de % HP) — manter stacks-DoT ou trocar? (Fase 2b)
- Escala por atributo no dano (Força/Agilidade/Int) — quanto? (Fase 2b)
- PvP: status caps, redução de DoT/cura vs players, matchmaking por nível.

## 6. Agenda sugerida da sessão dedicada
1. Travar a filosofia de números (tabela mestra de status/combo/passivo).
2. Desenhar a "gramática de combos" (aplicar→explorar) e listar combos por classe.
3. Combos de time (2v2/dungeon) + o que o motor co-op precisa.
4. Implementar `variant` + mods faltantes (cura/def/crit) no motor.
5. Balancear (planilha) e validar com testes transacionais/playtest.
6. Esboço de PvP (regras de balanceamento específicas).

---
*Tudo o que já foi construído está em `docs/ROADMAP.md`. Este brief é o ponto de partida do
trabalho focado de combos/balanceamento.*
