# LifeOnRPG — Regras de negócio

> **O que este documento é:** o contrato de comportamento do domínio, sistema por sistema.
> **O que não é:** tabela de fórmulas (isso é [`MECHANICS.md`](../MECHANICS.md)) nem princípios de
> design (isso é [`DESIGN_ROTINA_TORNEIRA.md`](../DESIGN_ROTINA_TORNEIRA.md), que ganha daqui em caso de conflito).
>
> Regra de manutenção: mudou o comportamento, muda este arquivo **no mesmo PR**. Doc que
> atrasa vira mentira, e mentira em doc custa mais caro que doc nenhuma.

---

## 1. Missões — o único gerador de progressão

### 1.1 Tipos

| Tipo | Como se define | Como se conclui |
|---|---|---|
| **Diária** | `frequency_type = 'daily'` + `days_of_week` não vazio | uma vez por dia agendado; estado em `missions.daily_status` (mapa `data → 'completed'`) |
| **Semanal flexível** | `frequency_type = 'weekly'` + `target_count` (1–6) e `max_count` (target..7) | N vezes na semana, em dias à escolha; contagem em `mission_weekly_progress` (uma linha por `mission_id + week_start`) |
| **Avulsa (one-shot)** | `days_of_week` vazio, `due_date` opcional | uma vez; marca `completed = true` |
| **De NPC** | `npc_id` preenchido | **XP final = 0**, só ouro. NPC não é torneira. |

Semana começa na **segunda** (ISO), fuso `America/Sao_Paulo`. A linha da semana é criada
preguiçosamente na primeira conclusão — não há cron de reset e não há carry-over de cota.

### 1.2 Prioridade

`alta 1.5×` · `media 1.0×` · `baixa 0.7×`, multiplicando o XP base **antes** de nível/buff/streak.

- Teto de **4 missões de prioridade alta por dia** (`MAX_HIGH_PRIORITY_PER_DAY`), validado no
  formulário. Semanal flexível ocupa vaga em **todos** os dias, porque fica disponível até bater a meta.
- Missões legadas acima do teto continuam válidas; o teto só impede criar mais.
- Prioridade nula ou desconhecida cai em `media`.
- **Ouro não escala por prioridade.**

### 1.3 Marcação retroativa (janela D-1)

Esquecer de marcar é falha de registro, não falha de hábito. O sistema distingue as duas.

- A pessoa pode marcar missões de **ontem**. Anteontem e além, **não**.
- Vale para diária **e** semanal flexível (uma semanal 4×/semana pode receber a execução de ontem
  desde que ontem ainda não tenha sido registrado e a cota da semana não tenha estourado).
- A janela é validada **no servidor**. O cliente propõe a data; o servidor recusa fora de `[hoje−1, hoje]`.
- **Recompensa retroativa:** XP e ouro cheios, streak conta normalmente. Não concede bônus que
  dependem do relógio no instante da marcação (`madrugador`, que exige conclusão antes das 8h).
  Motivo: o registro tem que ser honesto sem virar brecha pra otimizar buff marcando no dia seguinte.
- Bônus que dependem da **data** (fim de semana) usam a data marcada, não a de hoje — é a data que
  define se aquela execução caiu num sábado.
- Enquanto o dia está na janela, ele **não** é julgado: a varredura de falha diária (graça,
  protetor, sequência reiniciada) só alcança anteontem em diante, e o fechamento da semana só
  roda a partir de terça, quando o domingo dela já saiu da janela. Julgar um dia que ainda é
  registrável é exatamente converter falha de registro em falha de hábito.
- Uma semanal marcada em D-1 pertence à semana **daquela data**. Marcar domingo na segunda credita
  a semana que fechou, não a que começou.
- Idempotência: um dia já registrado não pode ser registrado de novo. Para trocar, desfaça
  (`undo_mission`, que aceita a mesma janela) e marque outra vez.

**Desfazer (`undo_mission`) na semanal flexível:**

- Devolve **exatamente** o que foi creditado. A parcela de execução é lida de
  `mission_daily_completions`, nunca estimada.
- Libera a vaga na cota: `current_count` decrementa e `last_completed_date` é recalculado a
  partir do `daily_status` já sem o dia — sem isso o mesmo dia não podia ser remarcado, e a
  troca de dia prometida acima não se sustentava.
- A semana afetada é a **da data desfeita**, não a de hoje. Desfazer domingo na segunda devolve
  a vaga na semana que fechou.
- O bônus de meta (+50%) só é devolvido quando a contagem cai **abaixo** de `target_count`:
  desfazer uma execução que estava acima da meta mantém a meta batida e mantém o bônus, porque
  quem fez a mais não é cobrado por isso. Pela UI esse caso não aparece — o formulário grava
  `max_count = target_count` e a contagem não passa da meta; a regra vale para linhas legadas
  com `max_count > target_count`. Quando é devolvido, volta pelo valor exato pago, guardado em
  `mission_weekly_progress.milestone_xp` / `milestone_gold`.
- Sai da cota exatamente a execução que entrou nela: quem decide é o carimbo que a concessão
  deixa na execução (`mission_daily_completions.weekly_week_start`), não a data. Dia concluído
  enquanto a missão ainda era **diária** não sai da cota porque nunca entrou; já uma marcação
  retroativa feita depois da conversão entra na cota (a concessão credita) e sai dela ao
  desfazer, mesmo que a data seja anterior a `weekly_started_at`.
- Semana já fechada como `met` que deixa de bater a meta volta a `pending` e é reavaliada no
  próximo fechamento — desfazer o domingo na segunda não pode deixar a semana registrada como
  cumprida. Semanas fechadas em `grace`/`protected`/`failed` **não** reabrem: desfazer só faz a
  contagem cair, e reavaliá-las cobraria o mesmo fracasso duas vezes (inclusive gastando outra
  carga de protetor de streak).
- Execuções semanais anteriores à migration `20260821140000` não têm o valor pago persistido e
  **não podem ser desfeitas**: o undo recusa em vez de inventar o número. A vaga delas sai da
  cota quando a semana virar. Pelo mesmo motivo, desfazer uma execução que derrubaria abaixo da
  meta uma semana cujo bônus foi pago antes dessa migration (`milestone_xp` nulo) também é
  recusado: devolver zero liberaria o bônus para ser pago de novo, e confiscar um valor
  desconhecido é pior.

### 1.4 Checklist

Item concluído soma `xp_bonus` (default +2 XP). A cada 3 itens, +1 🪙, até 3 🪙.

### 1.5 Âncora (implementation intention)

Missão pode grudar num evento da vida ("ao acordar", "depois do jantar") em vez de num horário.
Lista de 6 âncoras + campo livre — a âncora mais forte é a que a própria pessoa nomeia.
Não expandir a lista sem evidência de uso: lista longa paralisa.

### 1.6 Falha e recuperação

- Missão falhada volta a contar para a sequência pela recuperação: sem custo em ouro, **sem XP e
  sem ouro**, teto de **2 recuperações por dia**. Recuperar reabilita o dia, não paga por ele —
  quem paga é a torneira única (`complete_mission`), e ela só alcança a janela D-1.
- Pagar 10 🪙 para restaurar o XP perdido **não existe mais**. `MISSION_FAILURE_PENALTY_GOLD` e a
  RPC `pay_mission_penalty` continuam no repositório mas não são chamadas por ninguém: restaurar
  XP com ouro é um escritor de XP fora do `complete_mission`, o que o invariante da torneira única
  proíbe. **Não reimplemente.**
- **Streak protector**: **2 cargas** por semana no reset. A 3ª existe, mas só comprando na loja —
  `streak_protector_max` é o teto e vale 3. Existe para matar o efeito "já estraguei, pra quê".
- Copy de falha convida a voltar. Nunca envergonha.

---

## 2. Economia

### 2.1 Torneira e ralos

Única torneira: missão da rotina concluída. Tudo o mais é ralo.

| Sistema | Papel | Devolve |
|---|---|---|
| Combate / bosses | ralo | expressão de build, cosmético, status em leaderboard, narrativa |
| Portais / dungeons co-op | ralo | variedade e social |
| Loja | ralo | equipamento (expressão no combate, não atributo) |
| Pets | ralo + utilidade fora da torneira | bônus de sustain/forrageio, companhia |
| Bônus de login diário | **gancho de retorno** | **1 fragmento de portal** — zero XP, zero ouro |
| Conquistas que não exigem rotina | ralo | fragmento de portal (ver §2.2) |

> O bônus diário **não pode** pagar XP/ouro: recompensa presença, não hábito. Uma conquista de
> "7 dias cumpridos" **pode**, porque exige a rotina — é a rotina agregada.

> ⚠️ **Cuidado ao auditar isto pelo repositório.** A migration
> `20260531003000_claim_daily_bonus_rpc.sql` mostra a versão ANTIGA, que pagava
> `15 + (nível−1)*3` de XP e ouro por nível. A troca por `1` fragmento (`xp: 0, gold: 0`) foi
> aplicada direto no banco e só ficou versionada em
> `20260821200000_claim_daily_bonus_fragmento.sql` — que é a **última** a definir a função e,
> portanto, a que vale. Ler a de 2026-05-31 isolada continua dando a conclusão errada.
> **Confira funções de economia contra o banco (`pg_get_functiondef`), não contra
> `supabase/migrations/`.** Ver §2.3.

### 2.2 Conquistas

Só paga XP/ouro a conquista que **exige a rotina cumprida** — ela é a rotina agregada, não uma
fonte nova:

| Exigem rotina → XP/ouro | Não exigem → fragmento de portal |
|---|---|
| `missions_total`, `missions_streak` | `boss_kills` (combate é ralo) |
| `water_streak` (âncora de saúde: ação diária real) | `friends_total` (social) |
| `level_reached` (o nível só vem da rotina) | `loadout_full` (equipar não é cumprir) |
| | `journal_entries` (escrever não é cumprir) |

`achievements.fragment_reward` é a coluna do ralo; quando ela é usada, `xp_reward` e `gold_reward`
ficam em `0`. A UI omite o que vale zero — nunca mostre "+0 XP".

Ressalva registrada: `level_reached` passa na regra de ouro, mas é XP pago por ter acumulado XP,
ou seja, amplificação da própria torneira. Fica como está; é o primeiro lugar a revisitar se a
curva de progressão for reaberta.

### 2.3 O repositório de migrations não é o retrato da produção

Houve pelo menos três divergências em que o banco foi alterado sem migration versionada:

- `claim_daily_bonus` — hoje paga fragmento; a migration de 2026-05-31 mostra XP/ouro.
  **Registrada** em `20260821200000_claim_daily_bonus_fragmento.sql`.
- `player_portal_fragments` — em produção tem `weekly_fragments`, `week_start`,
  `pending_dungeon`, `dungeon_revealed_at`, `dungeon_expires_at`, `dungeon_reveal_level`;
  o `CREATE TABLE` versionado tem apenas as quatro primeiras colunas. **Registrada** na mesma
  migration, com `ADD COLUMN IF NOT EXISTS`.
- `_anchor_status_today(uuid, date)` — helper que `claim_daily_bonus` chama e que **nenhuma**
  migration cria. Ainda em aberto: num ambiente novo o bônus diário levanta, mas quebra na
  chamada. Precisa da definição viva copiada do banco.

Consequência prática: **auditar economia lendo `supabase/migrations/` produz conclusão errada.**
Uma revisão de código concluiu que o bônus diário vazava a torneira lendo exatamente o arquivo
obsoleto. Antes de afirmar o que uma função faz, leia a definição viva.

### 2.4 Recompensa variável

Base garantida + drop ocasional, **só de itens-ralo** (fragmento, chave, frasco, cosmético comum).
Equipamento lendário/épico **nunca** é sorteado — é conquista de marco. Raridade alta é mérito
visível, não sorte. Sorteio de topo transforma o app em caça-níquel (proibido).

### 2.5 Segurança da economia

- Toda concessão passa por RPC `SECURITY DEFINER`. Helpers internos (`_complete_mission_*`) são
  `REVOKE`ados de `authenticated`; só o wrapper público é exposto.
- O cliente envia **intenção** (mission id, data proposta). Nunca valores.
- Optimistic update no front é espelho, não fonte. Se `src/lib/constants.ts` divergir da migration,
  a UI promete o que o servidor não paga — os dois mudam juntos.

---

## 3. Streak

- Streak de missão vive em `daily_status`; gap de até 2 dias não quebra (o talento `foco_inabalavel`
  estende o gap do ouro de 1 para 2 dias).
- Multiplicador de XP por streak satura em **21 dias** (janela de formação de hábito), pico +75%.
- Conversão de diária → semanal preserva a streak: a mudança de formato é pontada uma única vez
  (bridge de conversão), sem afrouxar gaps posteriores.
- 60% da semana = "semana boa". Um único limiar em todo o app (destrave de portal, streak).
  Limiar alto pune vida real; 60% é atingível sem ser de graça.

---

## 4. Saúde

- Refeição e água são **condição de saúde**, não missão. Registro em `meal_log` / `water_log`,
  visível no Perfil.
- **Opt-in** por `profiles.health_anchors_enabled` (default `false`). Desligado, nenhuma penalidade
  de saúde se aplica e a UI não cobra.
- Penalidades só a partir do nível 15 (refeição faltante −5% HP máx; água insuficiente −10% MP máx).

## 5. Modo descanso

- **Opt-in**, default OFF (`rest_mode_enabled`). Janela entre `sleep_time` e `wake_time`.
- **Nunca bloqueia o registro de missão.** No máximo silencia a camada de gamificação e avisa que
  vai desacelerar. Um app de produtividade que se recusa a abrir é um app desinstalado.

## 6. Notificações

- **Locais** (Capacitor), não push. Permissão pedida no login.
- Teto de **3 por dia** (`MAX_PER_DAY`), respeitando quiet hours e modo descanso.
- Categorias silenciáveis individualmente: `missions_pending`, `fatigue_high`, `hp_low`, `water`,
  `meal`, `journal_empty`. Chave geral em `profiles.notifications_enabled`.
- `notification_log` sustenta o teto entre aparelhos e mede o que traz alguém de volta
  (`opened_at`) — sem isso, calibrar vira chute.
- Voz do herói, não voz do app.

---

## 7. Social e moderação

- Bloquear e denunciar usuário; exclusão de conta apaga todas as colunas de dono.
- Bucket `body-photos` é **privado**.
- Exclusão de conta é irreversível e cobre storage — qualquer coluna nova que referencie o usuário
  precisa entrar na rotina de exclusão, senão vira órfã (já aconteceu duas vezes).

## 8. Publicação e monetização

- Pacote Android `com.scaffx.lifeonrpg` é **PERMANENTE**. Nunca mude.
- Bens digitais dentro do APK exigem **Play Billing**. Paddle sai; Paddle dentro do APK é risco
  real de rejeição.
- `versionCode` só cresce; um código já enviado está queimado para sempre.

---

## 9. Tom e UI

- Atributo não treinado é **meta aspiracional**, nunca fracasso. Nunca vermelho, nunca alerta.
- Vermelho é exclusivo de falha de missão ativa.
- A rotina do dia é o elemento **dominante** do Dashboard. Todo o RPG vem abaixo.
- Concluir uma missão deve custar **um toque**. Fricção mata hábito mais rápido do que recompensa
  sustenta.
- pt-BR é a língua de origem; toda string passa por `t()`.
