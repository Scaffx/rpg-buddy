# Pet companheiro desenhado na cena — 2026-10-29

## Entrega

- `AdventurePetCompanion` desenha SVG vetorial próprio para os 12 `companion_type` catalogados. Cada espécie tem silhueta ou detalhes distinguíveis; valores ausentes e tipos desconhecidos não renderizam nada.
- O componente é apenas apresentação do `AdventurePetSnapshot` congelado em `battle.pet`. Não lê seleção futura, catálogo para estatísticas, armazenamento local ou dados remotos. Não cria ataque, som, cura, dano ou estado de buff.
- O rótulo acessível contém nome, tipo e percentuais do próprio snapshot. O bônus usa `adventurePetBonusLabel`; sustain usa `sustainLabel` com a expressão `/turno` adaptada para a leitura da aventura, sem relacionar a animação de 15 segundos a um evento de combate. O ícone de bônus só aparece para percentual positivo confirmado.

## Contrato para integração pela frente da cena

```tsx
import { AdventurePetCompanion } from './AdventurePetCompanion';

// Filho de uma âncora estável do herói, fora do sprite track keyed por action.id.
<AdventurePetCompanion
  pet={frame.pet}
  still={still}
  heroDefeated={frame.status === 'defeated'}
/>
```

API exportada: `AdventurePetCompanion({ pet, still = false, heroDefeated = false })`, com `pet: AdventurePetSnapshot | null | undefined`. A frente da cena deve passar exclusivamente o snapshot da batalha exibida e o estado visual corrente. Em cenas sem batalha, passar `null` se não há snapshot protegido apropriado.

O CSS posiciona o nó absoluto em uma âncora estável do herói, separada do `.adventure-sprite-track` keyed por ação. O pet mede 36–48 px e fica junto ao pé direito do herói. Manter o pet fora da `.adventure-damage-shell` evita que o atraso de VFX de impacto se aplique aos relógios CSS do pet. O nó permanece montado entre golpes, preservando o ciclo de 15 s do cachorro e do dragão. A órbita do dragão cabe em 8 px horizontais e 6 px verticais; o cachorro late visualmente, sem áudio, perto do fim de cada ciclo e abana o rabo logo depois. Demais espécies têm respiração, inclinação ou flutuação pequena.

Pausa, derrota e `prefers-reduced-motion` desligam as animações cosméticas. Ao retomar, o ciclo recomeça de uma pose neutra; o latido visual e a órbita não disparam no primeiro quadro. O ícone de bônus fica estático.

## Verificação local

- `npx vitest run src/test/AdventurePetCompanion.test.tsx`: 5 testes passaram; cobrem os 12 desenhos, ausência/unknown, valores do snapshot, percentual zero e regras CSS de pausa/redução.
- `npx eslint src/components/adventure/AdventurePetCompanion.tsx src/test/AdventurePetCompanion.test.tsx`: passou.
- `npx tsc --noEmit --pretty false`: passou, mas o `tsconfig.json` raiz usa project references e esse comando isolado não comprova o app. A verificação do app exige `npx tsc -p tsconfig.app.json --noEmit --pretty false`.
- Na integração, `npx tsc -p tsconfig.app.json --noEmit --pretty false` apontou 44 erros fora dos arquivos tocados, nenhum no componente ou na cena do pet.

Não houve QA em navegador nesta frente. A posição final, legibilidade em celular e convivência com VFX dependem da integração e da QA visual da frente da cena.
