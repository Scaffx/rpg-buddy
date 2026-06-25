# LifeOnRPG — Especificação de Design: "A Rotina é a Única Torneira"

> Documento de design (não de implementação). Define **as regras** antes dos prompts de código.
> Toda decisão de PR futura deve obedecer a este doc. Se um prompt contradiz a spec, a spec ganha.
> Base: log v2.0.0 + decisões da conversa de design. Data: 2026-06-24.

---

## 0. O problema em uma frase

Existem hoje várias fontes de **progressão** (rotina, combate, portais, crafting). Quando qualquer
uma evolui mais rápido ou é mais divertida que a rotina, o jogador migra pra ela e a rotina fica
de lado. **A rotina precisa ser o único lugar de onde o poder nasce.** Todo o resto gasta esse poder
e devolve *expressão e variedade*, nunca progressão.

---

## 1. Princípio mestre (a regra que tudo obedece)

**TORNEIRA ÚNICA:** XP, nível, atributos e ouro só aumentam ao completar missões da rotina.
Nenhum outro sistema gera esses recursos.

**RALOS:** combate, portais, dungeons, loja, pets, companheiro — todos *consomem* recursos e
devolvem expressão (variedade, cosmético, status, narrativa), não progressão.

**Teste de vazamento** (aplicar a QUALQUER mecânica, nova ou existente):
> "Isto faz o jogador querer abrir o app num dia em que ele NÃO cumpriu a rotina?"
> - SIM → é vazamento. Corrigir ou cortar.
> - NÃO → ok.

**Enquadramento (não-negociável):** a dependência rotina→jogo é por *fonte*, não por *portão punitivo*.
- ERRADO: "você não pode lutar até fazer sua rotina" (gera ressentimento).
- CERTO: "sua rotina é o que te deixa forte pra lutar" (gera vontade).
Mesma mecânica, enquadramento oposto. Toda copy do app segue o enquadramento CERTO.

### 1.1 Regra de ouro refinada (resolve as zonas cinzentas)

> **Só gera XP/ouro aquilo que EXIGE a ação da rotina ser cumprida.**

- **Login NÃO exige** rotina → bônus diário **não pode** dar XP/ouro. "XP só por logar" é o vazamento mais puro: recompensa *presença*, não *hábito*. (Correção de uma versão anterior deste doc que dizia "bônus diário celebra a rotina" — está errado: ele celebra o login, que é outra coisa.)
- **Conquista de "completou 7 dias" EXIGE** rotina → essa **pode** dar XP/ouro (é a rotina cumprida, só agregada).
- **Quiz da Esfinge / desafio de NPC**: se **não exigem** rotina cumprida, são **ralos** — dão item/cosmético/acesso, não XP/ouro.

**Bônus diário (correção certa, não só zerar):** o login diário tem valor psicológico real ("que bom que voltei") e **deve continuar existindo como gancho de retorno** — mas a recompensa troca de **XP+ouro** para **item-ralo** (fragmento / chave / cosmético). Coerente com §10.3 (recompensa variável = itens-ralo) e com o enquadramento de fonte: **o login te dá acesso a conteúdo; a rotina te dá poder.**

---

## 2. Atributos (decisão: MANTER os 11)

- Cobertura real do usuário-base: 5-7 de 11 ativos por semana. Saudável. **Não cortar.**
- Atributos não-tocados = **metas aspiracionais**, nunca fracasso.
- REGRA DE UI: atributo parado nunca é vermelho/alerta. Tom neutro ou convite
  ("ainda não treinado"), jamais punição. Vermelho é reservado para falha de missão ativa.

---

## 3. O que SAI (cortes confirmados)

| Item | Decisão | Motivo | Reversível? |
|---|---|---|---|
| **Crafting (6 receitas)** | Remover do código | Redundante com a loja (130 itens); 6 receitas não sustentam sistema; rouba tempo do núcleo | Sim, futuro |
| **Classe Ferreiro (seleção inicial)** | Tirar da seleção OU marcar "em breve" | Sem crafting, classe fica oca. Não vender classe vazia. Futuro = ramo mecha (projeto separado, não feature) | Sim, futuro (mecha) |
| **Companheiro (esqueleto)** | Remover | Combate-dentro-de-combate; isolado do motor E da rotina; alto custo de manutenção (triggers de sync), zero conexão com núcleo | Sim, baixa prioridade |
| **Geração de XP/ouro por combate** | Remover a torneira | Combate vira ralo (ver §4) | Não — é o núcleo da reforma |
| **Geração de XP/ouro por portais/dungeons** | Remover a torneira | Idem | Não |

> Regra de corte: cortar do **código**, não esconder atrás de flag dormente. Flag dormente =
> peso de manutenção que nunca morre. Se vai cortar, corta de verdade.

---

## 4. O que cada sistema VIRA (torneira → ralo)

### Combate / Bosses — RALO (mantido como "porquê lutar")
- Não dá mais XP/ouro/atributo.
- Devolve: **expressão** (testar build, ver números altos), **cosmético/loot visual**,
  **status** (entrada em leaderboard), **narrativa** (avançar história do herói).
- Acesso reforça o núcleo: bosses/portais da semana abrem conforme a rotina cumprida
  (ex.: % da semana destrava o portal da semana) — mas via enquadramento de FONTE, não muro.
- Bosses "grindy" (3× HP) deixam de fazer sentido sem grind de recurso → **rebalancear**
  para encontros curtos de expressão, não de farm.

### Portais / Dungeons co-op — RALO
- Gasta fragmentos (que vêm da rotina), devolve variedade e social. Sem progressão.

### Loja — RALO (já é)
- Gasta ouro (da rotina), devolve equipamento. Equipamento dá expressão de build no combate (ralo),
  não progressão de atributo. OK como está.

### Pets — RALO
- Cosmético/companhia. OK.

### Streak + Protetor de streak — NÚCLEO (manter, é a arma mais forte)
- Aversão à perda é o motivador mais potente do app. Protetor evita o efeito "já estraguei, pra quê".
- REGRA: quebra de streak nunca humilha. Copy convida a voltar, não envergonha.

### Virtudes → RENOMEAR e PROMOVER (correção importante)
- **NÃO é camada de valores.** É um **dashboard de aderência à rotina** (concluídas/falhadas/
  recuperadas/taxa, atividade 7 dias, top missões, pontos de atenção).
- É provavelmente a tela mais importante pro objetivo de hábito. Hoje tem nome opaco e rota lateral.
- AÇÃO: renomear para **"Diário do Herói"** (decidido — ver §10.1) e colocar a **um toque
  do Dashboard**, não escondida.
- Função psicológica: orgulho da streak (verde), aversão à perda (falha visível), identidade
  ("foi isto que você cumpriu").

---

## 5. Camada psicológica (regras de produto, com base em ciência de hábito)

### 5.1 Anti-overjustification (proteger a motivação intrínseca)
- Recompensa de jogo **celebra** o hábito formado, não é o motivo dele.
- O *ritual de marcar concluído* (animação + som + "+atributo") tem que ser gostoso por si só —
  isso importa MAIS que a quantidade de XP. Investir no feedback imediato do toque.

### 5.2 Gatilho → Ação → Recompensa (o gatilho é o elo mais negligenciado)
- **Implementation intention**: deixar amarrar cada missão a uma **âncora existente** da vida
  ("depois de acordar", "ao chegar do trabalho"), não só a um horário. Maior evidência em
  formação de hábito — mais forte que motivação ou lembrete.
- **Ação = um toque.** Qualquer fricção mata o hábito mais do que recompensa o sustenta.
  Auditar quantos toques custa concluir uma missão hoje; meta = 1.
- **Recompensa = base garantida + variação leve.** Variação mantém dopamina; variação demais
  vira caça-níquel e gera ansiedade. Base fixa + drop ocasional.

### 5.3 Identidade > metas
- Progresso deve comunicar "você está se tornando alguém" (classe, rank, herói), não "acumulou número".
- Explorar o enquadramento de identidade que o RPG já permite: "você É um espadachim disciplinado".

### 5.4 A pergunta-âncora (critério final de qualquer feature)
> "Qual é a recompensa de cumprir a rotina num dia em que NÃO estou a fim de jogar o RPG?"
> Se a resposta for só "ganhar recurso pro jogo", a rotina cai junto quando o jogo cansar.
> A rotina precisa dar satisfação que não dependa de abrir as outras telas. O RPG é o bônus.

---

## 6. Dashboard (reorganização de foco)

- Hoje o Dashboard compete consigo mesmo (nível, rank, classe, XP, missões, bônus, streak,
  lembretes, tour — tudo junto).
- REGRA: **a rotina do dia é o elemento dominante** da tela. Tudo de RPG é secundário/abaixo.
- "Crônica/Sua Semana" (ex-Virtudes) a um toque.

---

## 7. Modo descanso (ajuste)

- Hoje bloqueia o app (só Missões/Perfil) da hora de dormir até acordar.
- RISCO: app de produtividade que se recusa a abrir é desinstalado por quem quer registrar às 23h;
  além disso impõe a disciplina de sono do dono como regra universal.
- AÇÃO: tornar **opt-in**; **nunca** bloquear o registro de missão; no máximo silenciar a camada
  de gamificação no horário.

---

## 8. Monetização (fora do escopo desta reforma, mas registrado)

- Paddle dentro do APK = risco real de rejeição Google (Play Billing exigido p/ bens digitais).
  Resolver ANTES de polish de conteúdo. É o item mais crítico do lançamento.
- Considerar: tracker grátis + RPG como camada premium (alinha com "rotina é o núcleo";
  dá tempo de formar hábito — 21-66 dias — antes do paywall morder).

---

## 9. Ordem de execução sugerida (cada item = 1+ prompt depois)

1. **Cortes** (crafting, companheiro, Ferreiro da seleção) — limpa a base.
2. **Torneira única**: remover geração de XP/ouro de combate/portais/dungeons.
3. **Rebalancear combate** como ralo de expressão (encontros curtos, fim do grind).
4. **Renomear + promover Virtudes** → Crônica, um toque do Dashboard.
5. **Reorganizar Dashboard** (rotina dominante).
6. **Implementation intention**: âncoras em missões.
7. **Auditar fricção de conclusão** (meta 1 toque) + polir feedback do toque.
8. **Modo descanso opt-in**, sem bloquear registro.
9. **Bug do respec** (`isFirstRespec`) + auditoria de bônus de equipamento nas arenas.
10. **Monetização** (trilha à parte).

---

## 10. Decisões fechadas (eram pendências — agora resolvidas)

### 10.1 Nome da ex-Virtudes: **"Diário do Herói"**
Comunica narrativa + identidade ("o que o herói fez"), reforçando o efeito psicológico-alvo da tela.

### 10.2 Limiar de destrave do portal: **60% da semana**
- Mesmo limiar do streak existente (`computeSixtyPercentStreak`). Decisão de coerência: um único
  conceito de "semana boa" em todo o app, em vez de vários números a decorar.
- Por quê 60 e não 80-100: limiar alto pune vida real (viagem/doença) e dispara o "já estraguei, pra
  quê". 60% = "a maioria dos dias": atingível mas não de graça.
- Reseta junto com o ciclo semanal do portal (`reset_weekly_portal_fragments`).
- Ajustável após dados reais de aderência (hoje só há o usuário-dono).

### 10.3 Recompensa variável: **base garantida + drop ocasional só de itens-ralo**
- PODE dropar (variável): fragmento de portal, chave de dungeon isolada (leva a uma dungeon
  solo de conteúdo), frasco, cosmético comum.
- NÃO pode dropar aleatório: equipamento lendário/épico. Lendário é o topo da expressão de build;
  se cai por sorte, mata loja/combate/raridade e vira caça-níquel (proibido em §5.2).
- Lendário é conquista de marco (ex.: X% de aderência no mês, derrotar boss específico),
  nunca sorteado. Raridade alta = mérito visível, não sorte.

### 10.4 Âncoras de implementation intention (lista inicial de 6 + campo livre)
Regra: âncora = evento que acontece todo dia sem o app lembrar (é nisso que o hábito gruda).
1. Ao acordar
2. Depois do café da manhã
3. Ao chegar no trabalho / começar o expediente
4. Ao chegar em casa
5. Depois do jantar
6. Antes de dormir
- **"Outro (escrever)"** — a âncora mais forte é a que a própria pessoa nomeia.
- Começar com 6 (não mais) pra não virar lista paralisante. Expandir só com evidência de uso.
