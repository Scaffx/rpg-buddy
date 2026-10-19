# LifeOnRPG (rpg-buddy) — leia isto antes de tocar em qualquer coisa

App que transforma a **rotina real da pessoa** em progressão de RPG. Não é um jogo com
tarefas coladas: é um tracker de hábito cuja única moeda de poder é a rotina cumprida.

**Se você é um agente entrando frio neste repo, leia nesta ordem:**

1. Este arquivo (mapa + invariantes).
2. [`DESIGN_ROTINA_TORNEIRA.md`](DESIGN_ROTINA_TORNEIRA.md) — **spec mestra**. Ganha de qualquer prompt.
3. [`docs/REGRAS_DE_NEGOCIO.md`](docs/REGRAS_DE_NEGOCIO.md) — as regras do domínio, por sistema.
4. [`MECHANICS.md`](MECHANICS.md) — fórmulas exatas (XP, ouro, combate, progressão).

---

## Hierarquia de autoridade (quando as fontes divergem)

| # | Fonte | Manda sobre |
|---|-------|-------------|
| 1 | `DESIGN_ROTINA_TORNEIRA.md` | Tudo. Se um pedido contradiz a spec, a spec ganha — levante a contradição antes de codar. |
| 2 | `docs/REGRAS_DE_NEGOCIO.md` | Comportamento de produto e limites do domínio. |
| 3 | **O código** (`supabase/migrations/` + `src/lib/`) | Fórmulas e números. Se `MECHANICS.md` divergir do código, **o código é a verdade** e a doc está desatualizada — corrija a doc no mesmo PR. |
| 4 | `docs/ROADMAP.md` | Intenção futura. Histórico de decisões, não contrato. |

**Código = o que está rodando, não o que está versionado.** Para função de banco, a verdade é a
definição viva (`pg_get_functiondef`): há drift conhecido entre `supabase/migrations/` e a
produção, e auditar economia só pelo arquivo já produziu conclusão errada. Antes de afirmar o
que uma RPC faz, confira no banco — ver `docs/REGRAS_DE_NEGOCIO.md` §2.3.

`LIFEONRPG_LOG_COMPLETO.md` é registro histórico. Consulte para entender *por que* algo é assim; nunca como especificação.

---

## Os 5 invariantes inegociáveis

Violar qualquer um destes é um bug de design, mesmo que o código funcione.

1. **Torneira única.** XP, nível, atributos e ouro **só** nascem de missão da rotina concluída.
   Combate, portais, dungeons, pets, loja e login são **ralos**: consomem recurso e devolvem
   expressão (variedade, cosmético, status, narrativa). Nunca progressão.
   *Teste de vazamento:* "isto faz o jogador querer abrir o app num dia em que ele NÃO cumpriu a
   rotina?" Se sim, é vazamento — corrija ou corte.

2. **Economia é server-authoritative.** Todo XP/ouro/nível/chave é calculado dentro de RPC
   `SECURITY DEFINER` no Postgres. O cliente **nunca** envia valor de recompensa; envia
   intenção (qual missão, qual dia). Um `.rpc()` novo que aceite `xp` ou `gold` do browser é
   uma falha de segurança, não uma conveniência.

3. **Data e hora são resolvidas pelo servidor**, sempre em `America/Sao_Paulo`. O cliente pode
   *propor* uma data (ver marcação retroativa em REGRAS_DE_NEGOCIO), mas o servidor valida a
   janela e decide. `new Date()` no browser nunca é autoridade de dia.

4. **Enquadramento de fonte, nunca de muro.** Copy correta: "sua rotina te deixa forte pra lutar".
   Copy proibida: "você não pode lutar até fazer sua rotina". Mesma mecânica, ressentimento oposto.

5. **Falha nunca humiliha.** Streak quebrada, atributo parado e missão perdida usam tom neutro ou
   convite. Vermelho é reservado a falha de missão ativa. Atributo não treinado **nunca** é alerta.

---

## Mapa do código

```
src/
  pages/         telas (Dashboard, Missions, CalendarPage, BossPage, PortalEventPage, ...)
  hooks/         estado + mutations (React Query). useProfile.tsx e useMissionsHooks.ts são o núcleo.
  lib/           regras puras e testáveis: constants.ts, progression.ts, weeklyMissions.ts,
                 combat.ts, attributes.ts, dateUtils.ts
  integrations/  cliente Supabase e tipos gerados
  i18n/          pt-BR é a língua de origem; toda string de UI passa por t()
supabase/
  migrations/    economia (ordem cronológica importa). Tem drift vs. produção — ver §2.3.
  functions/     edge functions Deno (processar_turno = motor de combate; ai-chat; ...)
android/         wrapper Capacitor (pacote com.scaffx.lifeonrpg — PERMANENTE, nunca mude)
```

### Arquivos que concentram risco

| Arquivo | Por quê |
|---|---|
| `supabase/migrations/*_priority_xp_multiplier.sql` | contém `_complete_mission_daily` e `_complete_mission_with_weekly` — o coração da torneira |
| `src/lib/constants.ts` | espelha no front os multiplicadores do servidor. **Os dois mudam juntos** ou o app promete XP que o servidor não paga |
| `src/hooks/useMissionsHooks.ts` | optimistic update de conclusão; se divergir do servidor, a UI mente |
| `supabase/functions/processar_turno` | motor de combate; **deploy é manual** via Supabase CLI (o projeto está na Vercel, não no Lovable) |

---

## Comandos

```bash
npm run dev
```
```bash
npm run test
```
```bash
npm run lint
```
```bash
npm run build
```

Typecheck precisa do projeto explícito:
```bash
npx tsc --noEmit -p tsconfig.app.json
```
`npx tsc --noEmit` **sem** `-p` lê o `tsconfig.json` da raiz, que só tem `references`: ele não
compila arquivo nenhum e sai com exit 0. Isso já foi lido como "typecheck limpo" por engano.
O projeto tem ~55 erros de tipo pré-existentes — a régua é **não adicionar erro novo** nos
arquivos que você tocar, não zerar a lista.

Preview do app: use a config `rpg-buddy` de `.claude/launch.json` (porta 8080).

**Deploy.** Front vai pra Vercel no merge da `main`. Edge functions **não** vão junto — exigem
`supabase functions deploy <nome>` manual. Migrations em produção são aplicadas pelo dono;
um agente não escreve em prod por conta própria.

---

## Como se trabalha aqui

- **Antes de editar:** cheque `git remote -v`, branch, `git status` e `git fetch`. Nunca
  `git add -A` num diretório com sujeira que não é sua.
- **Erro/stack trace:** consulte a skill `bug-tracker` (base "🐛 Bug Tracker" no Notion) **antes**
  de propor fix. Muito bug daqui já foi visto e resolvido.
- **Quem constrói não aprova.** Mudança de risco passa por revisão com contexto frio — ver a skill
  `revisao-cega`. O revisor não vê o raciocínio de quem construiu, só o diff e as specs.
- **Testar até a fronteira.** O que dá pra rodar, rode. O que ninguém consegue rodar (fluxo que
  exige app publicado, compra real, etc.) vira issue pós-deploy aberta **antes** do merge — não
  vira bloqueio do PR.
- **Idioma:** commits, docs e UI em pt-BR. Comentário de código explica *por quê*, não *o quê*.
