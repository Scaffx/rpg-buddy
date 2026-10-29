# Missões Principais: Hoje e Ontem

Pedido: duas páginas para o dia atual e o anterior, permitindo registrar uma atividade esquecida dentro da janela D-1, com transição discreta e identidade visual atual.

## Coordenação e limites

- Base: `710b2c9552016607b3e368b194785310853c72d7`, branch `Scaffx/rpg-hordas-continuas-20261028`, PR #77 em rascunho.
- Orca Run: `run_cec36d22f976`. Workers confirmados pelo recibo como `gpt-6-sol`, esforço `xhigh`.
- Checkout primário com WIP preservado; nenhuma instalação no `node_modules` compartilhado.
- Coordenação integra e testa; produto, auditoria e testes têm proprietários separados.
- Leituras remotas de metadados/funções não equivalem a teste autenticado nem a aplicação de migration.

| Tarefa | Dispatch | Responsabilidade | Resultado |
| --- | --- | --- | --- |
| `task_ba69448d8a97` | `ctx_fa14fa6f0401` | Página, navegação, elegibilidade e transição | Succeeded; worker liberado; 5 testes de helper e QA autenticada abaixo |
| `task_d197361d9f48` | `ctx_5922e7a9cad7` | Auditoria read-only do contrato D-1 e fechamento semanal | Succeeded; agente reutilizado para correção; [relatório](20261029-missoes-d1-servidor.md) |
| `task_1486edd7a1a2` | `ctx_34260901875a` | Testes da página montada com hooks reais e fronteira Supabase simulada | Succeeded; agente reutilizado; 7 testes iniciais |
| `task_7ce70e14b14e` | `ctx_41ac2ac1fb0a` | Intervalo autônomo, clique com data expirada e semana nova | Succeeded; worker liberado; suíte ampliada para 9 testes |
| `task_ff734ac58faf` | `ctx_628b23dbc95a` | Correção do servidor e prova PG17 | Succeeded; worker liberado; [prova e limites](20261029-missoes-d1-correcao-servidor.md) |
| `task_a30f6b99e07f` | `ctx_10770c48cc7a` | Revisão independente da migration e de seu contrato | Succeeded; worker liberado; [revisão](20261029-missoes-d1-revisao.md) |

## Verificação inicial

O App real em `http://127.0.0.1:5190/missions` abriu com a conta de teste existente. Ao escolher Ontem, a versão inicial mantinha “para hoje” e “Missões de Hoje” e misturava tarefas futuras e falhas antigas. Captura externa: `work/missoes-d1-20261029/antes-ontem.png` no workspace deste chat.

O servidor publicado tem `complete_mission(uuid,date)` e `undo_mission(uuid,date)` com janela hoje/ontem. A auditoria encontrou diferença entre o avaliador semanal vivo e a correção local de agosto: o vivo pode avaliar domingo na segunda enquanto o D-1 ainda está aberto. Isso exige correção isolada e prova PostgreSQL local antes de liberação.

Baseline visível da conta: nível 1, 69 XP e 184.313 ouro. Há missões sintéticas de QA já existentes; não criar níveis, atributos, estoque ou liberações artificiais.

## Registro de bugs

Consultado o [Bug Tracker](https://www.notion.so/0b1b17f5060a4fbba17faefbdbd1483b) pela skill local `bug-tracker`. BUG-20 trata agenda no servidor e é distinto dos rótulos por dia. Novos registros:

- [Página Ontem mistura rótulos e missões de Hoje](https://app.notion.com/p/408812ac94d881e09a74cc79ab9a14ed).
- [Fechamento semanal antecipa recuperação de domingo](https://app.notion.com/p/408812ac94d881a380f2ffd31eb0d68d).
- [Conclusão não valida existência da missão no dia proposto](https://app.notion.com/p/408812ac94d8816f8466c01f37270885).

## QA autenticada e revisão da interface

O coordenador testou o **App real local** com a sessão existente da conta de teste e os serviços Supabase publicados, em 29/10/2026, aproximadamente 05:49–06:00 UTC. Essa evidência antecede o novo incidente de indisponibilidade observado na manhã de 29/10 e não prova a saúde atual do Auth. Não copiou tokens ou senhas, não criou missões/níveis/itens e não utilizou SQL de mutação. A missão sintética já existente `[QA 15-10] Estudo semanal` foi marcada pela interface em **Ontem, 28/10/2026**:

- O servidor criou exatamente **um** ledger de execução com `completion_date=2026-10-28`, `weekly_week_start=2026-10-26`, `xp_earned=25`, `gold_earned=2`, `credited_total_verified=true`.
- O marco semanal completou a recompensa: XP total da conta passou de **69 para 107**. A tela mostrou “Concluída ontem” uma única vez; em Hoje, Concluídas permaneceu vazia.
- O desfazer pela interface em Ontem removeu o ledger (consulta read-only posterior: contagem zero), devolveu a meta semanal a `0/1` e o XP a **69**.
- O histórico de ouro dessa missão teve `weekly_regular +2`, `weekly_milestone +1`, `mission_undo -3`: **efeito líquido zero**. O saldo global de ouro continuou mudando pela aventura automática; não foi usado como prova isolada de reversão.
- Renovação real de sessão pelo overlay externo de QA: “Sessão renovada e confirmada”; **Ontem permaneceu selecionado**.
- Tela de celular a 390 × 844: `innerWidth=390`, `documentElement.scrollWidth=375`, sem rolagem horizontal da página. Datas e navegação acessíveis; override removido no fim.
- Revisão React: mutação fixa a data clicada, guarda síncrona evita duplo envio, navegação bloqueia durante conclusão, consultas da semana são invalidadas só na virada do dia, filtros/formulário ficam fora da animação e `useReducedMotion` zera a transição. Não houve ensaio com leitor de tela humano nem em dispositivo físico.

Capturas no diretório externo `work/missoes-d1-20261029` deste chat: `antes-ontem.png`, `conclusao-ontem-conta-teste.png`, `ontem-celular.png`, `hoje-ontem-final.png`.

Esta QA comprova a nova interface sobre as RPCs **já publicadas** em uma quinta-feira; não executou pela via PostgREST a migration corretiva ainda local nem o cenário vivo de domingo/segunda. Essa fronteira continua separada da prova PG17.

## Checks integrados

- `npm test`: **635/635**, 92 arquivos; exit 0 após a tradução adicional de `MISSION_BEFORE_START`. Log externo `vitest-final.log`.
- `npm run build`: exit 0; aviso preexistente de tamanho de chunks. Log `build-final.log`.
- `tsc --noEmit -p tsconfig.app.json`: **44 diagnósticos globais**, mesmo total da base; nenhum em `Missions.tsx`, `missionDayPages.ts`, `weeklyMissions.ts` ou testes novos. Não declarar typecheck global limpo. Log `tsc-app-final.log`.
- ESLint: helper e testes novos passam; `Missions.tsx` tem 45 erros de débito existente (`any`), contra 51 na base reportada pelo worker. Nenhuma limpeza global foi incluída.
- `git diff --check`: passou.

## Servidor e revisão

A migration final `20261029054922_mission_d1_server_start_and_weekly_close.sql` está congelada em UTF-8/LF, SHA-256 `ab018e8c3d97a256cd5d5714beac9505effcb80c57caab106a5f3765703ab02b`. O preflight usa o catálogo vivo relido em 29/10, incluindo quatro policies PUBLIC e cinco triggers BEFORE; não presume que a migration histórica descreva o objeto publicado.

O worker executou em PostgreSQL 17.9 a instalação transacional, seis grupos funcionais, cinco grupos de fechamento semanal, seis perturbações negativas e concorrência complete/complete, além de complete e undo contra o fechamento semanal. O avaliador toma o lock advisory antes de travar o perfil. O coordenador conferiu os logs funcionais/semanais e o encerramento do cluster; os resultados de concorrência estão no relatório e transcript do worker. A revisão independente não deixou achado material pendente no arquivo final. Fixture reduzida e relógios instrumentados localmente não representam teste integrado em produção.

## Fechamento

As seis tarefas Orca foram concluídas e os terminais de workers liberados. A entrega segue no PR #77 em rascunho. Nenhuma migration remota, merge ou promoção de produção foi realizada. Faltam aplicação transacional com preflight/postflight no ambiente integrado e validação autenticada via GoTrue/PostgREST, inclusive domingo/segunda; o incidente atual de Auth deve ser tratado antes desses testes.
