# Pets no combate automático — integração

Estado: implementação e revisão local concluídas; QA autenticado e publicação pendentes.

## Comportamento

O servidor persiste um pet próprio selecionado por usuário. Cada luta guarda o pet e os atributos base/efetivos em snapshot protegido; trocas só afetam lutas posteriores ao horário da escolha. Os 12 tipos usam seus bônus atuais de 10% em HP, MP, defesa ou ofensa da classe (ATK/MATK). Kraken regenera HP, Necromante regenera MP e Leviatã reduz custo de mana. Atributos editáveis do companheiro não definem poder. XP, nível e atributos pessoais continuam ligados às rotinas; nenhum multiplicador direto de ouro ou itens foi acrescentado.

A interface diferencia o pet da luta atual da escolha para a próxima, mostra os valores antes/depois e mantém erros de consulta/seleção visíveis. O texto de cura após ataque inimigo explicita que o herói recuperou HP. Batalhas legadas sem pet continuam aceitas.

## Evidência executada

- Base real: `ed51cf02e100021927feb84fc9e06c7b50895ab0`.
- Produto auditado: `d453783f21650cc3f4e71f5eaaaa99eaa2b09ffb`. Commits posteriores desta integração acrescentam relatório/probes de revisão, estabilização de teste e este handoff; não alteram o código do produto auditado.
- Migração: `20261026185325_adventure_pets_authoritative.sql`; SHA256 LF `B49428C7C96A99234C7695AEFA98480275286EDE20CA6EC5379E06447433671B`.
- Suíte completa integrada: 390 testes, zero falhas. Build aprovado. TypeScript: 44 diagnósticos na base e na integração, delta semântico zero ao normalizar posição e quantidade de membros da união gerada de RPCs.
- PG17 autor e revisor independente: 12 tipos, três sustains, arredondamento/clamp/derrota, posse/identidade, legado, relógios, compra/ledger, snapshots e concorrência. O autor rejeitou oito drifts; o revisor rejeitou sete, incluindo ACL nula, sobrecarga de RPC e permissões herdadas. Rejeições ocorreram antes de DDL. Teardown stop0/isready2; portas de teste conferidas sem listener.
- O preflight da fonte congelada passou na Primary em transação somente leitura. Isto verifica compatibilidade de metadados do alvo; não equivale a aplicação da migração ou prova de Auth/PostgREST.
- A revisão encontrou uma corrida em teste legado de avanço, sem alteração anterior no teste ou hook do produto. A correção integrada `4b8b03a` aguarda a Promise real da mutação dentro de act e preserva todas as assertions de recompensas. Conjunto relacionado30/30 e caso antes intermitente12/12; suíte completa390/390 reexecutada depois do ajuste.
- Os 24 arquivos WIP originais do checkout primário mantêm seus hashes.

## Estado remoto e próximo passo

Nenhuma migração, seleção de pet, fixture, concessão de acesso ou alteração de perfil foi aplicada ao produto remoto nesta entrega. Produção segue no commit `ed51cf02`. O PR deve permanecer em rascunho até cumprir o teste autenticado exigido pelo usuário.

Prévia local: `http://127.0.0.1:5190/auth`. A entrada na conta de teste foi solicitada; QA autenticado ainda não foi executado. Não copiar senha, token ou armazenamento de sessão. O histórico da conta de teste indica trial vencido e ausência de pets; confirmar a identidade e as condições atuais antes de preparar acesso/fixtures de QA, sem alterar XP, nível ou rotinas.

Após autenticação: repetir o preflight atual, aplicar a migração com gate global desligado e allowlist vazia, liberar somente a conta de teste confirmada e verificar bônus/sustain reais, seleção persistida, luta congelada após troca, comportamento entre abas e invariância de progressão pessoal. Fixtures temporárias eventualmente necessárias devem ficar restritas a essa conta, com IDs registrados e limpeza guardada. Só depois do teste aprovado liberar globalmente e publicar o frontend.

PG17 usa fixture composto reduzido: cobre aquisição, ledger e elegibilidade de forrageio; a RPC de forrageio ponta a ponta não está presente nele. Não há alegação de QA de navegador ou de produção com base em testes locais.

Relatórios detalhados: `20261026-pets-motor.md`, `20261026-pets-ui.md`, `20261026-pets-healing-readout.md`, `20261026-adventure-sync-test.md` e `../audits/pets-20261026/REPORT.md`. A coordenação preserva as evidências externas em `work/pets-combate-20261026` no diretório do chat.
