# VFX Aprendiz, cinzas e armas universais — 2026-10-21

## Identificação

- Base: `9817fceca8dd73b583d3d7a166a7fe0a046e5d8e`.
- Branch/worktree isolado: `Scaffx/vfx-aprendiz-20261021` / `rpg-vfx-aprendiz-20261021`.
- Commit do código: `d4c29fe56d23dad604b0bf10e8d8313835e16bf8`.
- Arquivos do código: `src/components/adventure/skills/aprendiz.tsx` e `aprendiz.css`.

## Cobertura

O snapshot commitado fornece 1 habilidade ativa de `tree=aprendiz` e 2 habilidades de `tree=cinzas`. Os três nós passivos do Aprendiz não entram na conjuração. O arquivo suplementar `weapon-skills.json` indicado pelo coordenador fornece 7 habilidades públicas de armas; seus registros serão adicionados pelo root ao catálogo de integração.

| Origem | ID | Nome | Gesto visual |
| --- | --- | --- | --- |
| Aprendiz | `a_golpe` | Golpe Improvisado | Punho irregular e estalo curto |
| Cinzas | `cinza_corte_flamejante` | Corte Flamejante | Crescente quente com fagulhas |
| Cinzas | `cinza_lamina_glacial` | Lâmina Glacial | Lâmina cristalina e lascas |
| Arma | `weapon_98bc20de-6d2f-44fd-8c8c-725dc9d3f004` | Corte Veloz | Dois cortes finos em sequência |
| Arma | `weapon_3eff6bd5-bdef-496f-91b8-de248c6acf9f` | Estocada | Linha reta e ponta de lança |
| Arma | `weapon_c432ec67-be07-4c4b-b618-fd2b0fd189b3` | Flecha Perfurante | Haste, penas e anel de chegada |
| Arma | `weapon_72bd4265-a0ba-430e-a4d9-054a3d5b0e33` | Raio Sereno | Feixes dourados e halo |
| Arma | `weapon_6806d958-c6b8-4f82-9373-8b26954ccaed` | Corte Brutal | Talho largo e dois fragmentos |
| Arma | `weapon_a08f4e9c-004f-4975-8e9f-ef499f1c3909` | Dardo Arcano | Losango violeta e três pontos |
| Arma | `weapon_db3d7bca-7d31-4445-aeb6-aa415758be1e` | Pancada | Cabeça de martelo e onda baixa |

Total: **10 IDs distintos, 10 metadados, 10 efeitos**. As cinzas e habilidades de armas são visuais universais; nenhuma delas altera dano, status, recursos ou disponibilidade no motor. ID desconhecido retorna `null`.

## Contrato visual

- A camada do efeito é absoluta com `inset: 0`, `pointer-events: none`, classes `vfx-aprendiz`, `data-skill-vfx`, `data-skill-id` e `aria-hidden`.
- Coordenadas herdadas: `--skill-source-x` (25%), `--skill-target-x` (75%) e `--skill-line-y` (62%). `target=self` substitui o destino pelo X do herói.
- Cada animação termina em até 1200 ms, incluindo atrasos. Formação ocorre até 35%, movimento entre 35–75% e contato entre 75–100%.
- `.adventure-still` e `prefers-reduced-motion` removem a animação e mostram a composição estática. Não há loop, temporizador, aleatoriedade, recurso externo ou escrita de gameplay.

## Evidência local

| Checagem | Resultado |
| --- | --- |
| Inventário do `catalog.snapshot.json` + `weapon-skills.json` contra os IDs implementados | 10 esperados, 10 únicos, 0 ausentes |
| Bundle isolado esbuild, JSX automático, React SSR dos 10 IDs, atributos, `self` e ID desconhecido | PASS, exit 0 |
| TypeScript `strict`, checagem isolada com tipos React do junction existente via Compiler API | PASS, exit 0 |
| Parser CSS esbuild | PASS, exit 0 |
| `git diff --cached --check` antes do commit do código | PASS, exit 0 |

O primeiro comando SSR falhou porque o harness esbuild usou JSX clássico; passou após configurar `jsx: automatic`. A invocação direta de `tsc` não encontrou as declarações React a partir deste worktree sem `node_modules` local; a checagem isolada passou ao apontar explicitamente para as declarações do junction existente, sem alterá-lo.

## Limites

Não houve validação visual em navegador nas larguras 320px/900px; o root fará a galeria. Não rodei suíte global, SQL ou integração de catálogo/registry. Nenhum push, merge, PR ou deploy foi feito.
