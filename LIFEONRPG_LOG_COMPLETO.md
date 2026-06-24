# LifeOnRPG — Log Completo do Aplicativo

> Documento-mestre gerado em **2026-06-24**. Objetivo: descrever **tudo** que o app faz — todas as páginas, fluxos, gatilhos, sistemas, banco de dados, mudanças recentes e ideias de futuro — para servir de base de estratégia (inclusive levar pro Claude chat).
> Repositório: `Scaffx/rpg-buddy` · Supabase project: `jfnospjxdkelxlhcwuia` · App: **LifeOnRPG** (`appId: app.lovable.6f14b44eedde41539aa41093c4284f49`).
> Versão atual: **v2.0.0** (`versionCode 15`), `IS_BETA = false`.

Legenda de confiança: **[fato]** = confirmado no código/banco · **[infer]** = inferido por nome/contexto (validar antes de decisão crítica).

---

## 1. Visão geral & stack técnica

**Conceito:** RPG de produtividade/hábitos. O usuário cria missões ligadas a atributos da vida real, completa para ganhar XP/ouro, sobe de nível, escolhe classe, evolui árvore de habilidades, luta contra bosses/portais, e gerencia saúde (sono, refeições, água, fadiga). Gamifica desenvolvimento pessoal.

**Frontend** [fato]
- **Vite + React 18 + TypeScript**, React Router (`react-router-dom`), TanStack React Query (cache/estado servidor).
- UI: **Radix UI** (32 primitivos) + componentes próprios (`src/components/ui`, 49 arquivos) + **Tailwind** (`tailwindcss-animate`, `class-variance-authority`, `tailwind-merge`).
- Animações: **framer-motion**. Ícones: **lucide-react**. Gráficos: **recharts**. Toasts: **sonner** + toaster próprio. Markdown: `react-markdown`. Forms: `react-hook-form` + `zod`.
- i18n: **i18next** + `react-i18next` + detector de idioma — **3 locales: pt, en, es**.
- Temas: `next-themes` (dark default).

**Mobile** [fato]
- **Capacitor** (`@capacitor/android`, `/ios`, `/browser`, `/core`). `webDir: dist`. APK usa build estático (servidor Lovable desativado em produção). Empacota como **LifeOnRPG**.

**Backend** [fato]
- **Supabase** (Postgres + Auth + RLS + Edge Functions Deno + Realtime).
- **68 tabelas**, **~80 RPCs** (maioria `SECURITY DEFINER`), **15 triggers**, **8 edge functions**.
- Pagamentos: **Paddle** (checkout + webhook).

**Scripts** [fato]: `dev` (vite), `build`, `build:dev`, `lint` (eslint), `preview`, `test`/`test:watch` (vitest).

---

## 2. Identidade visual & versão

- **Marca "Portal" (LifeonRPG)** [fato]: fontes Cinzel + Space Grotesk; paleta roxo `#7c4ddb` / azul `#5b7fe0` / ciano `#7fd6ee` / ouro `#e3c06a` / pergaminho `#f0ece4` / tinta `#1d1b2e`. Emblema = portal + espada + anel de runas douradas.
- Componentes de marca: `branding/LifeonRPGLogo.tsx`, `LifeonRPGSplash.tsx` (splash animado de portal), `EntrySplashGate.tsx`.
- **Favicon** `public/favicon.ico` regerado com o ícone Portal (multi-res 16→256) + assets em `public/brand/` (`appicon-*`, `portal-emblem-*`).
- Slogan: **"Sua rotina é a aventura"**.

---

## 3. Mapa de páginas & rotas

Rotas definidas em `src/App.tsx`. Proteção: `ProtectedRoute` (exige login + onboarding + assinatura ativa, exceto admin), `PublicRoute` (só deslogado), `LandingRoute` (pública/paywall).

| Rota | Página | Proteção | O que faz |
|---|---|---|---|
| `/landing` | `Landing` | pública | Pitch público + paywall p/ assinatura expirada |
| `/auth` | `Auth` | pública (deslogado) | Login / cadastro |
| `/reset-password` | `ResetPassword` | pública | Redefinir senha |
| `/onboarding` | `Onboarding` | logado | Tutorial → região → **classe** → **trilha de habilidades** → missões → conclusão (6 passos) |
| `/` | `Dashboard` | protegida | Hub: nível, rank, classe, XP, missões do dia, bônus diário, streak, lembretes, tour guiado |
| `/missions` | `Missions` | protegida | CRUD de missões, marcar/concluir, status diário |
| `/calendar` | `CalendarPage` | protegida | Visão de calendário das missões/dias |
| `/prioridade` | `PrioridadePage` | protegida | Matriz/priorização de tarefas |
| `/boss` | `BossPage` | protegida | Lista de bosses + entrada em combate (arena) |
| `/portal` | `PortalEventPage` | protegida (+ splash) | Evento de portal semanal, scan, runs, fragmentos |
| `/health` | `HealthPage` | protegida | Saúde: HP/MP, fadiga, sono, refeições, água, peso |
| `/habilidades` | `HabilidadesHub` | protegida | Hub central de habilidades (árvore + loadout de combate) |
| `/skill-tree` | `SkillTreePage` | protegida | Árvore de habilidades por classe (alocação de pontos) |
| `/feats` | `FeatsTree` | protegida | Árvore de talentos/feats |
| `/classes` | `ClassesPage` | protegida | Progressão de classes (32 na árvore, 6 tiers) + respec |
| `/progress` | `ProgressPage` | protegida | Gráficos de progresso (XP, atributos ao longo do tempo) |
| `/shop` | `ShopPage` | protegida | Loja de equipamentos/consumíveis (ouro) |
| `/npc` | `NpcPage` | protegida | NPCs: afinidade, desafios semanais, quiz da Esfinge |
| `/profile` | `ProfilePage` | protegida | Perfil: stats, inventário/equipar, configurações (sono/refeições/água/volume), classe, conquistas, Pergaminhos |
| `/companheiro` | `CompanionPage` | protegida | Companheiro (esqueleto): equipar arma/armadura, agir em combate |
| `/crafting` | `CraftingPage` | protegida | Forja/criação de itens (6 receitas) |
| `/social` | `SocialPage` | protegida | Amigos, pedidos, chat direto, desafios entre amigos |
| `/leaderboard` | `LeaderboardPage` | protegida | Rankings global/regional/por classe/semanal |
| `/virtues` | `VirtuesPage` | protegida | Virtudes (sistema de valores/atributos) |
| `/system-info` | `SystemInfoPage` | protegida | Info do sistema / changelog / versão |
| `/mobile` | `MobilePage` | protegida | Página específica mobile / download APK |
| `/admin/releases` | `ReleasesAdminPage` | protegida (admin, sem onboarding/assinatura) | Gestão de releases do app |
| `/terms` `/privacy` `/refund` | legal | pública | Páginas legais (Termos, Privacidade, Reembolso) |
| `*` | `NotFound` | — | 404 |
| (interno) | `Index`, `SystemInfoPage` | — | utilidades/redirecionamento |

---

## 4. Fluxos principais (jornada do usuário)

### 4.1 Cadastro & onboarding [fato]
1. Cadastro/login em `/auth`. Trigger `handle_new_user` cria `profiles` automaticamente; `grant_trial_subscription`/`on_profile_created_grant_trial` concede **trial** ao criar o profile.
2. `/onboarding` (6 passos): **Tutorial → Região → Classe → Trilha de Habilidades → Missões sugeridas → Conclusão**.
   - Na conclusão: cria as missões escolhidas, marca `onboarding_completed`, concede **kit inicial da classe** (arma+armadura equipadas + acessório + 2 frascos de mana + 1 de vida via `useGrantOnboardingKit`) e **aprende a 1ª habilidade** (nó-tronco da classe via `allocate_skill_node`).

### 4.2 Loop diário [fato/infer]
- Completar missões → `complete_mission` (XP, ouro, atributos, efeitos de saúde, streak, inspiração se "dia perfeito").
- Bônus diário → `claim_daily_bonus`.
- **Virada diária** (`useMidnightReset`): reseta status diário de missões/refeições/água/timers e dispara evento `daily-reset-processed`.
- **Modo descanso**: 15 min antes do horário de dormir → aviso; do horário de dormir até acordar → bloqueia tudo menos `/missions` e `/profile` (`useBedtimeLock` + `BedtimeGate`).

### 4.3 Assinatura / paywall [fato]
- Trial automático no cadastro. `has_active_subscription` valida acesso (live/sandbox). Expirou → redireciona p/ `/landing` com paywall (`SubscriptionPaywall`, `SubscriptionExpiryNotice`).
- Pagamento via **Paddle** (`usePaddleCheckout`, edge `get-paddle-price`, `payments-webhook`). Preço regionalizado (`useLocalizedPricing`).
- **Chaves de acesso** (`redeem_access_key`, `subscription_access_keys`, `GiftKeySection`) — liberação manual/gift.
- Admin é isento. **Conta do dono é ilimitada** (subscription status `active`, `current_period_end = NULL`).

### 4.4 Combate (solo) [fato]
- Entrada por `/boss` (ou portal/dungeon). `useStartActiveCombat` monta stats do jogador (atributo+nível+bônus de equipamento) e cria `combates_ativos`.
- Resolução **server-authoritative** na edge **`processar_turno`** (v32): resolve dano por turno, valida skill/arma no servidor (`resolvePlayerSkill`), gate de MP, matchup elemental, teto de dano de boss, etc.
- **Frascos estilo Elden Ring** in-combat: máx 4, divididos HP/MP (`profiles.flask_hp_count/flask_mp_count`), usados via `use_flask`.
- **Companheiro** age via `companion_act` (RPC isolada — não toca o motor de turno).
- **Cinzas de Guerra** (artes de arma) aprendidas via **Pergaminhos** (`use_scroll`).

### 4.5 Portais & Dungeons co-op [fato/infer]
- Evento de portal semanal (`create_weekly_portal_event`, `get_active_portal_event`); cor do portal rolada por nível (`_roll_portal_color`); **scan** (`scan_portal`), **runs** (`complete_portal_run`), **fragmentos** (`get_my_fragments`, reset semanal `reset_weekly_portal_fragments`).
- **Dungeons co-op**: sessões (`create_dungeon_session`, `join_dungeon_session` por código, `start_dungeon_session`), **fragment dungeons** públicas/privadas (`create_fragment_dungeon`, `join_fragment_dungeon`, `get_public_fragment_dungeons`), **parcerias** (`record_dungeon_partnership`, `get_my_partnerships`), claim pendente (`claim_pending_dungeon`).

---

## 5. Sistemas de jogo (detalhado)

### 5.1 Atributos (11) [fato]
Agilidade, Autoaperfeiçoamento, Carisma, Criatividade, Disciplina, Força, Inteligência, Relacionamento, Resiliência, Sabedoria, Vitalidade. Cada missão liga a 1 atributo principal (+ secundários). Sobem com missões concluídas; alimentam os stats de combate.

### 5.2 Missões [fato]
- Criação com atributo, dias da semana, prioridade (alta/média/baixa), horário provável, descrição. Templates por classe no onboarding.
- Concluir (`complete_mission`): XP + ouro + atributo + efeitos de saúde + streak. Desfazer (`undo_mission`/`useUndoMission`). **Falha** (`useFailedMissions`, `pay_mission_penalty`, `apply_xp_penalty`) com penalidade. Relatórios (`useMissionReports`, `ReportsPanel`).
- Páginas: `/missions`, `/calendar`, `/prioridade`.
- **Streak** de 60% (`computeSixtyPercentStreak`) + **protetor de streak** (cargas semanais).

### 5.3 XP, nível & progressão [fato]
- `get_level_from_xp` / `_v2` convertem XP→nível. `add_xp_to_user`, `xp_transactions`, `xp_history`. `LevelUpCinematic` na subida de nível.
- Trigger `sync_health_on_profile_level_change` (ajusta HP/MP máx) e `sync_talent_points_on_level_change` (pontos de talento por nível).

### 5.4 Economia [fato]
- **Ouro**: `add_gold_to_user`, `spend_gold`, `gold_history`, `user_balance`. Guard de economia (`_guard_profiles_economy`).
- **Loja** (`/shop`, 16 itens): `buy_shop_item`, `charge_for_item`, `useBuyEquipment`.
- **Itens** (`game_items`, 130): categorias weapon/armor/accessory/consumable/material; bônus atk/matk/def/hp/mp/agi/crit; raridade; sintonização (épico/lendário, máx 3, trigger `enforce_attunement_limit`); arma com `weapon_type`/`weapon_element`/`weapon_skill`. Equipar com limites de slot (armor 1, weapon 2, accessory 3).

### 5.5 Classes (32 na árvore; 6 base) [fato]
- Base/starter: **Espadachim (guerreiro), Mago, Gatuno, Ferreiro, Arqueiro, Noviço (clérigo)**. Progressão em 6 tiers / 55+ classes (texto do tour).
- Seleção no onboarding; **respec** (`perform_class_respec`, `/classes`). `grant_starter_items` (RPC server-side por classe).
- **"Aprendiz" removido como classe**: o herói é a classe escolhida desde o LV1 (fallbacks usam `starterClassDisplayName`). "apprentice" ainda existe como **rank por nível** (novice→apprentice→warrior→veteran→master→legendary), que é outro sistema.

### 5.6 Árvore de habilidades (79 nós) [fato]
- **Orçamento de pontos = NÍVEL do personagem** (`allocate_skill_node`: `available = level − Σ rank×cost`). No LV1 = 1 ponto.
- `tree` por classe = starter_class, exceto clérigo → árvore `novato` (área sagrado). Nó **tier-0 "tronco"** = 1ª habilidade (gate 0, sem prereq); tier-1 exige gate 1 + prereq tronco (LV2+).
- Reset (`reset_skill_tree`). Loadout de combate em `combat_skill_loadout` (perfil) + `CombatLoadout`.
- **Cinzas de Guerra**: árvore `cinzas` (cost 0), aprendidas por **Pergaminho** (`use_scroll`), gated por tipo/elemento de arma.

### 5.7 Talentos / Feats (16) [fato]
- `talentos_disponiveis` (16) + `talentos_jogador`; `/feats`, `useTalents`, `ActiveTalentsBadge`. Pontos de talento sincronizados por nível (`sync_talent_points_on_level_change`). **Sistema separado** da árvore de skills.

### 5.8 Combate & Bosses (60 bosses, 3 world events) [fato]
- Motor: edge `processar_turno`. Fórmulas calibradas (passe de balanceamento 1.0): bosses ~3× HP / 1.5× dano vs nível; frascos para sobreviver; teto de dano de boss.
- `bosses` (60; 3 world events), `boss_battles`, `boss_weekly_loot_claims`, `resolve_boss_battle`, loot (`useGrantBossLoot`). Arena: `CombatArena`, `DungeonArena`, `FragmentDungeonArena`.
- **Logs de combate** (`combat_turn_logs`) — atualmente vazio; balanceamento foi por modelo, validar com dados reais pós-launch.

### 5.9 Saúde [fato]
- `user_health_stats`: HP/MP atuais e máx, **fadiga**, `sleep_time`/`wake_time`, refeições-alvo, água-alvo, peso. `meal_log`, `water_log`, `body_measurements`.
- Herói "dorme" entre sleep/wake (recupera HP/MP ao acordar; sem penalidade de fome dormindo). **Descanso mínimo 6h** exigido ao salvar. **Descanso curto** (`ShortRestTimer`, 15–60 min). `claim_health_challenge`, `useAwardHealthXP`.

### 5.10 Pets & Companheiros [fato]
- `pet_catalog` (7), `buy_pet`. **Companheiro** (`companions`, esqueleto): equipar arma/armadura, agir em combate (`companion_act`), stats default e sync por triggers (`set_companion_default_stats`, `sync_companion_combat_stats`). `/companheiro`.

### 5.11 NPCs & Quiz [fato]
- `/npc`: afinidade (`npc_affinity`, `useNpcAffinity`), desafios semanais (`npc_weekly_challenges`, `npc_challenge_completions`, `undo_npc_challenge`), geração via edge `generate-npc-challenges`.
- **Quiz da Esfinge** (`quiz_questions`, 24; `SphinxQuizModal`).

### 5.12 Conquistas [fato]
- `achievements` / `user_achievements`; `claim_achievement`, `useAchievements` (auto-check montado no layout), `useAutoCheckAchievements`.

### 5.13 Social & Rankings [fato]
- Amigos (`friend_requests`, `useFriends`, `search_profiles`), **chat direto** (`useDirectMessages`, `DirectChatModal`), **desafios entre amigos** (`friend_challenges`), **presença** (`usePresence`/`usePresenceHeartbeat`, online status).
- **Leaderboards**: global, regional, por classe, semanal, regional+classe, regional semanal (RPCs `get_*_leaderboard`).

### 5.14 Notificações & lembretes [fato]
- `HeroNotificationBell` + `useHeroNotifications`; lembretes de missão (`useReminders`/`useReminderNotifications`, `RemindersCard`); alertas de sono/acordar (`useSleepWakeAlerts`); **modo descanso** (`useBedtimeLock`).

### 5.15 IA [fato]
- **Chat flutuante** (`FloatingAiChat`) via edge `ai-chat` (`ai_conversations`, `ai_messages`). Geração de desafios de NPC (`generate-npc-challenges`).

### 5.16 Diário & história [fato]
- `adventure_journal` (`useAdventureJournal`); escolhas de história do herói (`hero_story_choices`, `useHeroStoryChoices`).

### 5.17 Virtudes [fato]
- `/virtues` (`VirtuesPage`) — camada de valores/atributos.

---

## 6. Gatilhos (TRIGGERS) — todos os tipos

### 6.1 Triggers de banco (15) [fato]
| Tabela | Trigger | Função |
|---|---|---|
| `auth.users` | `on_auth_user_created` | `handle_new_user` (cria profile) |
| `profiles` | `on_profile_created_grant_trial` | `grant_trial_subscription` |
| `profiles` | `guard_profiles_economy` | `_guard_profiles_economy` |
| `profiles` | `sync_talent_points_on_level_change_trigger` | `sync_talent_points_on_level_change` |
| `profiles` | `update_profiles_updated_at` | `update_updated_at_column` |
| `companions` | `trg_companion_default_stats` | `set_companion_default_stats` |
| `companions` | `trg_sync_companion_combat_stats` | `sync_companion_combat_stats` |
| `user_inventory` | `enforce_attunement_limit_trigger` | `enforce_attunement_limit` |
| `portal_events` | `trg_portal_color_default` | `assign_portal_color_if_null` |
| `ai_conversations`, `attributes`, `combates_ativos`, `daily_tracking`, `personagens`, `plans` | `*_updated_at` | `update_updated_at_column` |

> Obs: `sync_health_on_profile_level_change` existe como função; confirmar se está ligada como trigger ou chamada por RPC. **[infer]**

### 6.2 Gatilhos de runtime (hooks montados no app) [fato]
Montados em `AppLayout` (rodam enquanto o app está aberto):
- `useMidnightReset` — virada diária.
- `useSleepWakeAlerts` — toasts de dormir/acordar.
- `useBedtimeLock` (via `BedtimeGate` global no router) — modo descanso.
- `usePresenceHeartbeat` — presença online.
- `useReminderNotifications` — lembretes de missão.
- `useAutoCheckAchievements` — checagem de conquistas.
- `useClickSound` — SFX de clique.
- `AppUpdateModal`/`useAppUpdate` — checa versão nova (`app_releases`).
- Splash em entradas de dungeon/portal (`EntrySplashGate`, splash interno em `DungeonArena`).

### 6.3 Funções de manutenção periódica [infer]
- `create_weekly_portal_event` (cria evento semanal), `reset_weekly_portal_fragments` (zera fragmentos) — **provavelmente agendadas (cron)**; confirmar agendamento no Supabase.

### 6.4 Edge functions (8) [fato]
- `processar_turno` — motor de combate por turno (server-authoritative).
- `ai-chat` — chat com IA.
- `generate-npc-challenges` — gera desafios de NPC.
- `get-paddle-price` — preço Paddle regional.
- `payments-webhook` — webhook de pagamento Paddle.
- `recover-account` — recuperação de conta.
- `admin-export-database` — exportação de dados (admin).
- `_shared` — utilitários compartilhados.

---

## 7. Banco de dados (68 tabelas) — por domínio

- **Identidade/conta:** `usuarios`, `profiles`, `personagens`, `attributes`, `user_balance`.
- **Missões:** `missions`, `missoes`, `plans`, `plan_missions`, `mission_daily_completions`, `daily_tracking`, `checklist_items`.
- **Progresso/economia:** `xp_transactions`, `xp_history`, `gold_history`, `activity_log`, `historico`.
- **Itens/loja:** `game_items`, `user_inventory`, `shop_items`, `user_crafting_materials`, `crafting_recipes`, `user_buffs`.
- **Classes/habilidades:** `classes`, `skill_tree_nodes`, `player_skill_nodes`, `talentos_disponiveis`, `talentos_jogador`.
- **Combate/bosses:** `bosses`, `combates_ativos`, `combat_turn_logs`, `boss_battles`, `boss_weekly_loot_claims`, `companions`.
- **Portais/dungeons:** `portal_events`, `player_portal_fragments`, `portal_runs`, `portal_run_participants`, `portal_scans`, `player_portal_rolls`, `fragment_dungeon_sessions`, `fragment_dungeon_players`, `dungeon_sessions`, `dungeon_session_players`, `dungeon_partnerships`, `co_op_missions`, `co_op_mission_members`.
- **Saúde:** `user_health_stats`, `meal_log`, `water_log`, `body_measurements`.
- **Social:** `friend_requests`, `friend_challenges`, `npc_affinity`, `npc_weekly_challenges`, `npc_challenge_completions`, `quiz_questions`.
- **Conquistas/diário:** `achievements`, `user_achievements`, `adventure_journal`, `hero_story_choices`.
- **Pets:** `pet_catalog`.
- **IA:** `ai_conversations`, `ai_messages`.
- **Assinatura/admin:** `subscriptions`, `subscription_access_keys`, `app_releases`, `system_update_logs`.

**RLS** habilitada em todas. ~80 RPCs (lista completa no apêndice A).

---

## 8. Internacionalização

3 idiomas completos: **pt** (principal), **en**, **es** (`src/i18n/locales/*.json`). Seletor (`LanguageSwitcher`).

---

## 9. Monetização

- **Modelo:** trial → assinatura paga (Paddle). Preço regional. Gate por `has_active_subscription`.
- **Chaves de acesso/gift** para liberação manual.
- **Admin/dono isentos** (dono ilimitado).

---

## 10. Mudanças recentes (changelog das sessões)

1. **Cinzas de Guerra + Pergaminhos** (PR #10) — artes de arma + pergaminhos que ensinam Cinzas (`use_scroll`).
2. **Balanceamento de combate 1.0** (PR #11, edge v32) — sobrevivência, matchup elemental, teto de dano, fórmulas por atributo.
3. **Companheiro (esqueleto)** — equipar arma/armadura + agir em combate (`companion_act`), isolado do motor.
4. **Frascos estilo Elden Ring** — 4 frascos HP/MP in-combat (`use_flask`).
5. **Bosses retunados** — ~3× HP / 1.5× dano (mundo lento/grindy).
6. **Conta do dono ilimitada** — assinatura ativa sem expiração.
7. **Splash de dungeon/portal** (PR #18) — transição "abrindo o portal".
8. **Ícone Portal no navegador** (PR #19) — favicon regerado.
9. **Modo descanso** (PR #19) — mínimo 6h de sono + aviso 15min + bloqueio do app na hora de dormir (só Missões/Perfil).
10. **Classe desde o LV1** (PR #20) — fim do rótulo "Aprendiz"; trilha de habilidades no onboarding; **kit inicial por classe** + 2 frascos de mana + 1 de vida + 1ª habilidade.

---

## 11. Estado para Play Store & pendências conhecidas

**Pronto/forte:** app funcional v2.0.0, Capacitor configurado, monetização Paddle, i18n 3 idiomas, conteúdo robusto (60 bosses, 130 itens, 32 classes, 79 nós de skill, 24 quizzes, 7 pets), páginas legais (Termos/Privacidade/Reembolso).

**Pendências/riscos [fato/infer]:**
- ⚠️ **Bug pré-existente**: `isFirstRespec` indefinido em `ProfilePage.tsx` (~linha 1339) — quebra o respec de classe (erro de TS + runtime). *(Flagado para fix.)*
- **`combat_turn_logs` vazio** — balanceamento por modelo, sem dados reais ainda.
- **Itens "flavor" do pedido não implementados** (faltam sistemas): aljava/munição, gazuas (baú/loot), bomba de fumaça (fuga), minério+kit de reparo, ração, e ramo do Ferreiro (alquimia/ferreiro/mech).
- **Equipamento "inerte" em alguns pontos de combate** — validar se todos os bônus de item entram no cálculo em todas as arenas.
- **Agendamento (cron) de eventos semanais** — confirmar que portal/fragmentos resetam automaticamente.
- **Sem smoke-test em browser** das últimas features (sem login disponível ao assistente) — recomendado QA manual.
- **`tsc`/build**: build passa (esbuild não faz typecheck); há erro de TS pré-existente isolado.

---

## 12. Ideias para o futuro (roadmap)

### Conteúdo & progressão
- Implementar os **itens/sistemas "flavor"**: munição (arqueiro), baú/loot com gazuas (gatuno), consumíveis de fuga (bomba de fumaça), materiais de forja + ramo do Ferreiro (alquimia/ferreiro/mech).
- Mais **tiers de classe** jogáveis com habilidades únicas (até T6).
- **Eventos sazonais** (portais temáticos, bosses de evento, recompensas limitadas).
- Sistema de **set bonus** de equipamento e itens lendários com efeitos ativos.

### Retenção & engajamento
- **Notificações push** (Capacitor) para lembretes de missão, hora de dormir, bônus diário, eventos.
- **Streaks/desafios** mais ricos (semanais, mensais, ligas).
- **Onboarding gamificado** com primeira luta guiada.
- **Diário/recap semanal** automático ("sua semana como herói").

### Social & competitivo
- **Guildas/clãs**, dungeons co-op com matchmaking, eventos PvP assíncronos.
- Leaderboards com **temporadas** e recompensas de fim de season.

### Monetização
- **Tiers de assinatura** (free limitado / premium), cosméticos (skins de herói/portal), passe de batalha.
- Otimizar **preços regionais** e teste A/B de paywall.

### Qualidade / QA / técnica
- **Popular `combat_turn_logs`** e re-balancear combate com dados reais.
- **Code-split** (bundle > 500 kB hoje) para melhorar load no mobile.
- **Testes automatizados** (vitest) cobrindo RPCs críticos e fórmulas de combate.
- **Monitoramento** (erros runtime, analytics de funil de onboarding → assinatura).
- Corrigir o **bug do respec** e auditar bônus de equipamento em todas as arenas.

### Play Store (checklist)
- [ ] Ícones/feature graphic/screenshots na identidade Portal.
- [ ] Ficha da loja (descrição curta/longa, PT/EN/ES).
- [ ] Política de privacidade pública (já há página `/privacy`).
- [ ] Data safety form (Google) — declarar dados coletados (conta, saúde básica, etc.).
- [ ] Testar APK release assinado (versionCode incrementado a cada envio).
- [ ] Fluxo de pagamento conforme política (Paddle vs Google Play Billing — **verificar exigência do Google de usar billing nativo para bens digitais**; risco de rejeição).
- [ ] QA manual completo (onboarding, combate, assinatura, modo descanso).
- [ ] Classificação etária + permissões mínimas.

> ⚠️ **Atenção monetização Play Store:** o Google exige, em geral, **Google Play Billing** para venda de conteúdo digital dentro do app. Vender assinatura via Paddle dentro do APK pode violar a política. Avaliar usar Play Billing no Android (e manter Paddle só na web) — **ponto crítico para o lançamento**.

---

## Apêndice A — RPCs (lista completa)

`_apply_mission_health_effects`, `_consume_one_shot_buff`, `_derive_mission_category`, `_get_or_roll_portal_color`, `_global_offensive_streak`, `_grant_flow_xp_buff`, `_grant_inspiration_if_perfect_day`, `_guard_profiles_economy`, `_norm`, `_roll_portal_color`, `add_gold_to_user`, `add_xp_to_user`, `allocate_skill_node`, `apply_xp_penalty`, `assign_portal_color_if_null`, `buy_pet`, `buy_shop_item`, `charge_for_item`, `claim_achievement`, `claim_daily_bonus`, `claim_health_challenge`, `claim_pending_dungeon`, `companion_act`, `complete_co_op_mission`, `complete_mission`, `complete_portal_run` (×2 overloads), `create_co_op_mission`, `create_dungeon_session`, `create_event_session`, `create_fragment_dungeon`, `create_weekly_portal_event`, `debug_sintonizado`, `enforce_attunement_limit`, `ensure_trial_subscription`, `generate_dungeon_invite_code`, `get_active_portal_event`, `get_class_leaderboard`, `get_dungeon_session_with_players`, `get_global_leaderboard`, `get_level_from_xp`, `get_level_from_xp_v2`, `get_my_fragments`, `get_my_partnerships`, `get_orphaned_profiles`, `get_public_fragment_dungeons`, `get_regional_class_leaderboard`, `get_regional_leaderboard`, `get_regional_weekly_leaderboard`, `get_weekly_leaderboard`, `grant_starter_items`, `grant_trial_subscription`, `handle_new_user`, `has_active_subscription`, `is_system_admin`, `join_dungeon_session`, `join_fragment_dungeon`, `list_system_feedback_admin`, `pay_mission_penalty`, `perform_class_respec`, `record_dungeon_partnership`, `redeem_access_key`, `reset_skill_tree`, `reset_weekly_portal_fragments`, `resolve_boss_battle`, `scan_portal`, `search_profiles`, `set_companion_default_stats`, `spend_gold`, `start_dungeon_session`, `sync_companion_combat_stats`, `sync_health_on_profile_level_change`, `sync_talent_points_on_level_change`, `undo_mission`, `undo_npc_challenge`, `update_updated_at_column`, `use_flask`, `use_scroll`.

## Apêndice B — Hooks (43) e Libs (14)

**Hooks:** use-mobile, use-toast, useAccessKeys, useAchievements, useAdventureJournal, useAppUpdate, useAuth, useBedtimeLock, useBossCombat, useClickSound, useCompanion, useCrafting, useDailyBonus, useDailyTracking, useDirectMessages, useDungeonPartnerships, useFailedMissions, useFriends, useGold, useHeroClass, useHeroNotifications, useHeroStoryChoices, useInventory, useIsAdmin, useLeaderboard, useLocalizedPricing, useMealDetails, useMidnightReset, useMissionActions, useMissionReports, useMissionsHooks, useNpcAffinity, usePaddleCheckout, usePlans, usePortalEvent, usePresence, useProfile, useReminders, useShortRestStatus, useSkillTree, useSleepWakeAlerts, useSubscription, useTalents, useUndoMission.

**Libs:** attributes, classProfiles, combat, constants, dateUtils, missionTalentRules, onboarding, paddle, progression, sfx, shortRestState, streakUtils, utils, version.

---
*Fim do log. Gerado por Claude Code a partir do código-fonte e do schema Supabase reais em 2026-06-24.*
