# Habilidades e equipamentos na aventura automática

## Comportamento entregue

O combate usa os atributos reais de equipamentos válidos e as habilidades aprendidas, na ordem do loadout salvo. O servidor define custo de mana, recarga, poder e elemento a partir do catálogo; dados enviados no JSON do perfil não substituem essas regras. As mudanças de equipamento e árvore entram na próxima luta: uma luta iniciada mantém seu snapshot.

A cena mostra HP, mana, habilidade executada, gasto de MP, dano, cura e resistência. Há efeitos visuais distintos para físico, arcano, fogo, gelo, raio, natureza e luz, preparação de magia, projétil e impacto. Cura e proteção têm efeito sobre o próprio herói. Redução de movimento e pausa visual preservam o processamento do servidor.

O loadout fica em Habilidades, com controles para ordenar. Talentos da vida real mantém sua área, sem o painel redundante de habilidades de combate. Redistribuir a árvore é gratuito até o nível 10 inclusive; a partir do 11 custa 150 ouro. XP, classe, atributos permanentes, rotinas e itens são preservados.

Mago escolhido no onboarding pode executar Dardo Arcano no nível 1, mesmo sem evolução manual para uma classe avançada. A identidade da classe passa a um registro privado no servidor; falsificar campos de perfil ou nós aprendidos não concede habilidades. Aprendiz pode aguardar a escolha humana após atingir o nível mínimo, sem promoção automática.

Asa de Brasa tem multiplicador de fogo 0,5; estar num bioma vulcânico não cria essa resistência para todas as criaturas. Vulnerabilidade, atordoamento, cura e escudo usam as regras explícitas dos cinco nós ativos correspondentes do catálogo. Combate continua sem dar XP, níveis ou atributos permanentes.

## Provas locais

Comparação independente, com fixtures reduzidas em PostgreSQL 17.9 e uma variável de equipamento por vez:

| Equipamento acrescentado | Resultado novo | Referência sem bônus |
| --- | --- | --- |
| ATK +20 | Dano causado 25 | 15 |
| MATK +20 | Dano causado 20 | 15 |
| DEF +20 | Dano recebido 4 | 14 |
| HP +20 | HP máximo 150 | 130 |
| MP +20 | MP máximo 84 | 64 |

Na versão anterior, ATK/DEF alteravam o poder agregado, mas os mesmos probes mantinham dano causado 20 e recebido 15. Estes números são testes controlados, não resultados de uma conta publicada.

O banco composto aplicou reset, motor e autoridade de classe em sequência com os corpos legados preservados byte a byte. Os asserts autenticados locais confirmaram Dardo Arcano no Mago inicial, reset grátis no nível 10 e débito de 150 no 11, manutenção de XP/classe e de snapshots, e negação de falsificação de classe/nós. Duas chamadas concorrentes de reset pago sobre saldo 200 permitiram um débito de 150; a segunda falhou por saldo insuficiente e o saldo final ficou 50.

Revisões independentes: motor `fe0b81c`, relatório em `docs/audits/20261021-motor-review.md`; classe final `d640691`, relatório em `docs/audits/20261021-class-review.md`. Cobrem relógio, ACL, concorrência, rollback, drift de RPC/catálogo, cursor offline e recibos. O motor admite até 320 eventos; empate preserva ambos vivos, sem recompensa e sem recuo. Uma derrota em modo de permanência não provoca recuos sucessivos.

Suíte integrada com a correção final de Auth `6623c4` e o teste independente: 328 testes/48 arquivos, exit 0; build exit 0. TypeScript permanece com os mesmos 44 diagnósticos da base `9a803382`, sem novo diagnóstico na comparação normalizada. O aviso de chunks grandes do Vite também permanece.

## Personas de verificação

São cenários técnicos simulados, não pesquisa com pessoas reais: iniciante que procura suas habilidades em Habilidades; jogador experiente que ordena magias por custo/recarga; usuário que compara equipamentos e preserva uma luta em andamento; usuário que navega por teclado ou pede redução de movimento. A validação visual e o uso da conta publicada devem ser registrados separadamente dos testes de DOM e banco.

## Limites desta entrega

Os efeitos secundários de queimadura, congelamento, sangramento, área e sinergias, além dos bônus de nós passivos/variantes, não foram implementados nesta rodada. A interface explicita esse limite. A aparência de acessórios equipados está registrada em `docs/roadmap/20261021-acessorios-visuais.md` para uma próxima etapa.

O bloqueio de autenticação observado no produto publicado foi incluído na rodada. A primeira proposta `2acc64d` foi reprovada pela revisão independente: um evento SIGNED_IN de recuperação do storage podia expor o usuário antes da confirmação pelo Auth. A correção `6623c4` confirma também os eventos e passou 13 testes autorais, 3 testes independentes e a suíte integrada. A revisão final `c73eac0` registra PASS local, com limite de mocks/jsdom, em `docs/audits/20261021-auth-review.md`. Essa prova não demonstra bypass de RLS nem substitui observação publicada.

## Rollout

Pendente neste checkpoint. Os três SQLs de reset/motor/classe foram congelados com LF e comparados aos hashes auditados; preflights somente leitura passaram em Primary. Isso não equivale a aplicação remota, publicação ou teste de uma sessão real. O relatório do coordenador deve registrar o PR, SHA publicado, recibos de migrations, preservação dos dados e limites do teste no navegador após a publicação.
