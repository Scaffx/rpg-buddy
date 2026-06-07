# RPG-Buddy — Roadmap & Notas de Design

> Documento vivo. Consolidado no fim da sessão de design. Serve para retomar o trabalho
> sem perder contexto. Marcações: ✅ feito · ⏳ planejado · ❓ a definir.

## Estado atual (já entregue)
- **Segurança/economia**: economia server-side (RPCs SECURITY DEFINER) + trava de RLS anti-cheat. ✅
- **i18n**: todas as telas pt/en/es. ✅
- **Saúde de código**: types regenerados, `as never` zerado, `as any` 401→231, `useProfile` 1961→~660 linhas (split em useBossCombat/useMissionsHooks). ✅
- **Missões / psicologia**:
  - "Nunca falhe 2×": 1ª falha perdoada (estado `grace`, alerta gentil, sem punição); 2ª consecutiva penaliza. ✅
  - XP de hábito por missão: teto em **21 dias / +75%** (3d+10% / 7d+30% / 14d+50% / 21d+75%). ✅
- **Perfil**: upload de foto (bucket `avatars` + RLS). ✅
- **Endgame fase 1**: cap de nível 60; 3 bosses de evento (Vazio Absoluto, Gaia Corrompida, Ragnarök) lvl 60 / HP 15000 fora da escada normal; Chronos = boss final; seção "Eventos Mundiais" (teaser em breve/anunciado/live). ✅
- **Endgame fase 2a (backend)**: sessões de evento até 10 jogadores, classe/curandeiro por jogador, `create_event_session` (host lvl 60), trava de ≥1 curandeiro pra iniciar. ✅ (UI jogável = pendente)
- **Pets de loja (minis de boss)**: 5 pets compráveis em ouro (`pet_catalog` + `buy_pet`). ✅

---

## ROADMAP DE CONTEÚDO (por sistema)

### 1. Sequenciamento de bosses (ordem obrigatória) — FUNDAÇÃO ✅
Não dá pra derrotar um boss sem o pré-requisito (ex.: Lobo Cinzento exige Goblin Feroz).
Cadeia linear por nível. **Base de várias mecânicas abaixo.**
- Impl.: coluna `prereq_boss_id` em `bosses` (FK self, ON DELETE SET NULL) + gate no client
  (botão "Derrote X primeiro") **e** no RPC `resolve_boss_battle` (`PREREQ_NOT_MET`, autoritativo). ✅
- Bosses condicionais (escape/fuga) **não bloqueiam** ninguém: Fênix Renascente, Guerreiro
  Imortal e o combo Fênix+Esfinge (a remover). A cadeia "pula" eles. ✅
- Derivação re-executável por window/lateral em `(level, name)`; eventos mundiais ficam sem prereq. ✅

### 2. Encadeamentos de história (boss chama outro) ✅
- **Fênix Renascente (lv10)** escapa → ao vencer a **Sphinx do Deserto (lv14)** com a Fênix já
  enfrentada (`phoenix_kill_count >= 1`), dispara a fusão: diálogo de história + `phoenix_fused=true`
  + bônus de +250 XP (o "XP devido" da Fênix, creditado server-side via `add_xp_to_user`). ✅
- **Removido** o boss-combo fixo "Fênix + Esfinge do Deserto (lv12)" (0 batalhas; vira encadeamento). ✅
- **Bug corrigido**: `handlePhoenixEscaped` gravava em `phoenix_escape_count` (coluna inexistente)
  → agora usa `phoenix_kill_count` (real). As colunas `phoenix_kill_count`/`phoenix_fused`, antes
  órfãs, foram efetivamente ligadas. ✅
- i18n pt/en/es do diálogo de fusão e toasts. ✅

### 3. Companheiros por derrota
- **Esqueleto Campeão → filhote de combate** ✅ (já existe).
- **Salamandra das Chamas (lv11) → pet NÃO-combate** (companhia, estilo cachorro/gato).
- **Tiamat, Mãe dos Dragões (lv46) → escolher 1 dragão de combate** entre 5 elementos:
  fogo, raio, escuridão, planta, água.

### 4. Pets de loja (minis de boss) ✅ + pendências
Conceito: boss "encolhe" → vai pra LOJA → compra em ouro. **7 pets no jogo** ✅:
Leviatã Primitivo, Wyvern Relâmpago, Dragão Sombrio, Kraken Abissal, Demônio da Fome,
**Necromante Eterno (lv24)** e **Wyrm de Gelo Eterno (lv32)**.
- ⏳ (Opcional) só liberar o pet na loja DEPOIS de derrotar o boss correspondente.

### 5. Cadeia épica nórdica ✅ (decisões 2026-06-06: Odin em fases / resgate = evento)
- **Golem de Adamantina (lv34)** → ao derrotar, dropa a **Picareta de Adamantina**
  (item de quest `quest_picareta_adamantina`) + flag `picareta_adamantina`. ✅
- **Resgate do Ferreiro** = **evento de história** (não mini-dungeon): com a picareta,
  diálogo liberta o Ferreiro → flag `ferreiro_rescued` + **+300 XP** (RPC). ✅
- **Fenrir (lv38)**: ao derrotar, **escolha** "Libertar das correntes" (vira aliado,
  `fenrir_allied`) ou deixá-lo. Transitivamente já é pré-requisito de Odin (cadeia linear). ✅
- **Odin (lv47)**: **encontro em fases (3v1)** reusando a engine 1v1 — HP 1296→**2400**,
  pool de golpes ganha **Mjölnir de Thor** e **Trapaça de Loki** (Loki = maldição/curse).
  Intro narrativo antes da luta; se **Fenrir aliado**, jogador entra com **Inspiração**
  (vantagem no 1º ataque). ✅
- i18n pt/en/es de todos os diálogos/toasts. ✅
- ⏳ Futuro (opcional): Fenrir como unidade aliada visível na arena; HP do Odin é tunável.

### 6. Mecânica de QUIZ (Esfinge)
- **Esfinge Guardiã solo (lv41)**: ~**20 perguntas fáceis**; golpe especial **+50% dano se errar**.
- **Djinn do Deserto Infinito + Esfinge (lv39+41)**: ~**40 perguntas mais difíceis**, aleatórias.
- Impl.: banco de perguntas (categoria/dificuldade) + UI de pergunta entre turnos.

### 7. Dungeon dos Três (base: "Templo das Areias Perdidas") ✅ definido
- Estrutura: **fase de bosses = Esfinge Guardiã + Djinn do Deserto** → **boss final = Anúbis + Rá** (2 deuses).
- Ou seja: 2 bosses (Esfinge, Djinn) e depois o duo divino (Anúbis + Rá) como final.
- ⏳ A confirmar na implementação: reformular a dungeon existente "Templo das Areias Perdidas"
  (hoje lv8, Esfinge+Djinn 650 HP) numa versão endgame, ou criar dungeon nova de alto nível.

---

## SISTEMA DE HABILIDADES (redesenho) — alta prioridade
Objetivo: combate tático com **escolhas limitadas** e **combos**, não "uso tudo".

> Decisões (sessão 2026-06-06): (A) **camada unificada incremental** (reaproveita
> tabelas existentes; sem rebuild); (B) **motor de status+combos agora**;
> (C) limites 4/5/6 valem **só para skills ativas** (passivos mantêm limite 5).

### 4c — Motor de status + combos ✅ (código; deploy pendente)
- Coluna `combates_ativos.boss_status` (JSONB) persiste status entre turnos. ✅ (migração aplicada)
- Edge function `processar_turno` reescrita de forma **ADITIVA** (combate idêntico quando
  `boss_status` vazio). Status: **Molhado, Congelado, Queimando, Sangramento, Vulnerável**. ✅ (no repo)
- Combos: **Congelar + físico → Estilhaçar** (+60% e quebra o gelo, boss perde o turno);
  **Molhado + Raio → Choque** (+50% e atordoa); **Queimando/Sangramento** = DoT por turno;
  **Vulnerável** = +20% de dano; fogo em molhado vira **Vapor** (evapora). ✅
- Elemento `raio` adicionado à detecção; água é fraca a raio. ✅
- Cliente (CombatArena): badges de status do boss + banner de combo + popups de DoT. ✅
- **⚠️ Deploy pendente**: `npx supabase functions deploy processar_turno` (fonte versionada em
  `supabase/functions/processar_turno/index.ts`). Rollback = redeploy do git anterior. Playtest necessário.

### Limites de equipe (slots de habilidade) — 4a (parcial)
- **Boss solo: até 4** (já aplicado via `MAX_COMBAT_SKILLS=4`). Constante `MODE_SKILL_LIMITS
  = { solo:4, dungeon:5, event:6 }` adicionada (`lib/constants.ts`) e exibida na árvore. ✅
- ⏳ Dungeon (5) e Evento (6) entram em vigor quando esses modos consumirem o loadout de
  skills (hoje `DungeonArena` não usa skills individuais; amarra com o endgame 2b/2c).

### 4b — Árvore unificada (UX) ✅
- Página `/feats` virou a **árvore unificada**: talentos (passivos) **agrupados por área**
  (Ofensivo/Magia/Defensivo/Foco/Economia/Social/Sorte/Vitalidade) + seção **Habilidades de
  Combate** mostrando o loadout ativo (efeito/MP) com os limites por modo e atalho pra editar
  no Perfil. Reaproveita `talentos_*` + `profiles.combat_skill_loadout`. i18n pt/en/es. ✅

### Combos / status (proposta — implementada em 4c)
Pequeno conjunto de status + skills que APLICAM vs. EXPLORAM:
- **Molhado** + Raio → dano bônus / atordoa.
- **Congelado** + Físico → "estilhaçar" (bônus de dano), pula turno do inimigo.
- **Queimando** → dano por turno (DoT).
- **Sangramento** → empilha, tica por turno.
- **Vulnerável/Marcado** → +X% de dano no próximo golpe.
- Ex.: "água → raio", "congela → golpe de gelo", "marca → burst".

### Diretrizes
- Cada skill = custo (MP/cooldown) + 1 efeito claro; combo > spam.
- Habilidades com **identidade de build** (fogo/gelo/sangramento/controle/suporte).
- Suporte/cura relevante (amarra com a trava de curandeiro dos eventos).
- **Balanceamento completo** necessário (ver abaixo).

---

## BALANCEAMENTO — achados e recomendações

### Dados atuais
- Cap nível 60 = **1.935.200 XP** total. Deltas: lv1→2 = 320; lv10→11 ≈ 5.000; lv30→31 ≈ 27.000; lv59→60 ≈ 87.320 (curva ~273× mais íngreme no fim).
- Missão: base **25 XP** × level_mult (1.0→**3.5**, teto ~lv26) × hábito (até **1.75**) × buffs.
- Boss XP: 100→4.820 (média 2.434, one-time). Boss ouro: 25→910 (média 464).
- Equipamento: ouro 384 médio / 1.469 máx. Pets: 2.800–6.000 ouro.

### Achado nº1 — curva tardia muito íngreme
Jogador consistente (5 missões, lv26+, hábito máx) ≈ 765 XP/dia de missões + bosses one-time.
→ Chegar ao 60 leva **muitos meses/anos**. Para um app de "rotina de vida" isso até combina (jornada longa, aspiracional), **mas o early-game (lv1–10) fica lento** para reter nos primeiros dias.
- **Rec.**: acelerar lv1–10 (curva mais suave no começo) para o "dopamine hit" da primeira semana; manter o late longo.

### Achado nº2 — dailies continuam sendo o núcleo ✅
XP/ouro/chaves vêm primariamente das missões diárias; bosses/eventos são **gastos** (chaves) e aspiração. "Nunca falhe 2×" + XP de hábito reforçam a rotina como batimento cardíaco. **As missões NÃO perderam o foco** — são o motor; combate é a camada de recompensa/expressão. Estrutura saudável.

### Achado nº3 — tornar o progresso de hábito VISÍVEL
O bônus de hábito existe mas é silencioso. Mostrar "você está em +50%, faltam 7 dias pro +75%" aumenta a aderência (a barra de progresso do hábito vira gancho diário).

### Retenção (ganchos atuais)
Streak + bônus diário + chaves de boss (5 missões = 1) + desafios semanais de NPC + co-op.
Sólido. Melhorias: pacing inicial, visibilidade do hábito, e metas de identidade (Prioridades já cobrem parte).

---

## TALENTOS + HABILIDADES = ÁRVORE ÚNICA ✅ (decidido)
Decisão do dono: **fundir** talentos com habilidades numa **árvore única** de escolhas
limitadas (estilo skill-tree de classe). Não haverá dois sistemas separados — talentos
e skills viram a mesma progressão. A detalhar: estrutura da árvore (por área/elemento),
quantos pontos, e como amarra com os limites de equipe (4/5/6).

## Ordem de build sugerida
1. Sequenciamento de bosses (fundação)
2. Limpeza combo Fênix+Esfinge + chain de história
3. Salamandra (pet não-combate) + Tiamat (escolha de dragão)
4. **Sistema de Habilidades + combos + limites 4/5/6** (coração do combate)
   - 4c motor de status+combos ✅ (código; **deploy do edge function pendente**)
   - 4a limites: solo=4 ✅ + constante MODE_SKILL_LIMITS; dungeon/evento 5/6 ⏳
   - 4b árvore unificada (UX) ✅
5. Quiz da Esfinge
6. Cadeia nórdica (Golem→picareta→ferreiro→Fenrir→Odin 3v1) ✅
7. Dungeon dos Três
8. Endgame fase 2b/2c: tornar as raides de evento jogáveis (lobby 10 + combate)

## Perguntas resolvidas ✅
1. Pets extras = **Necromante Eterno** + **Wyrm de Gelo Eterno** (já adicionados → 7 pets). ✅
2. Fenrir = pré-requisito de **Odin**. ✅
3. Dungeon dos Três: bosses **Esfinge + Djinn**, final = **Anúbis + Rá**. ✅
4. Talentos + Habilidades = **árvore única**. ✅
