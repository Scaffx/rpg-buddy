# 📖 Explicação dos Sistemas do RPG Buddy

## 🕐 Short Rest (Descanso Breve)

### Como funciona?
- **Recuperação FIXA**: Sempre recupera **30% de HP máximo + 30% de MP máximo**, **independente do tempo definido**
- O timer é apenas um elemento de **gamificação/meditação**, não afeta o cálculo
- Exemplo: Se você tem 100 HP e 10 MP máximos:
  - Qualquer duração (5 min, 15 min, 1h) = +30 HP e +3 MP
- **Salvos automaticamente** no localStorage - continua rodando mesmo mudando de aba

---

## 🎯 Missões - XP (Experiência)

### Cálculo de XP na Missão
```
XP Base = XP da missão
Multiplicador = 1 + floor((Nível - 1) / 5) * 0.5

Exemplo:
- Nível 1-4: Multiplicador = 1.0x
- Nível 5-9: Multiplicador = 1.5x
- Nível 10-14: Multiplicador = 2.0x
- Nível 15-19: Multiplicador = 2.5x
...

Bônus Madrugador: Se completar ANTES DAS 8h, +15% XP
Exemplo: 50 XP × 1.5 (nível 10) × 1.15 (madrugador) = 86 XP
```

### Bônus Checklist
- Cada item de checklist completado = **+2 XP bônus**
- Soma ao XP total da missão

---

## 💰 Ouro (Gold) - Recompensas de Missões

### Ouro Base & Streak
```
Base: 2 🪙 por missão
Bônus por Streak: +1 ouro a cada 3 missões em sequência

Exemplo:
- 1ª missão: 2 🪙
- 2ª missão: 2 🪙
- 3ª missão: 2 🪙 + 1 = 3 🪙
- 4ª missão: 3 🪙
- 5ª missão: 3 🪙
- 6ª missão: 3 🪙 + 1 = 4 🪙 (6 ÷ 3 = 2 bônus)
```

### Talentos que afetam Ouro
- **Mestre Mercador** (10% de desconto na loja) - Não afeta recompensa de missões
- Boss drop: 10 🪙 fixo por derrota

---

## 🎖️ Talentos (Feats)

### Como ganhar Pontos de Talento?
```
Fórmula: 1 ponto a cada 5 níveis
- Nível 1-4: 0 pontos
- Nível 5-9: 1 ponto
- Nível 10-14: 2 pontos
- Nível 15-19: 3 pontos
...
```

### Talentos Disponíveis

| Nome | Efeito | Descrição |
|------|--------|-----------|
| **Madrugador** | +15% XP | Bonus aplicado se completar antes das 8h |
| **Foco Inabalável** | Combo 48h | Streak de missões continua por até 48h (normal: 24h) |
| **Mestre Mercador** | 10% desconto | Na loja de tempo/equipamentos |

---

## 🏥 Saúde (Health System)

### Health Challenge Completo
- **Requisito**: Atingir meta de refeições E hidratação
- **Recompensa**: +50 XP (uma vez por dia)

### Short Rest vs Long Rest
| Tipo | Duração | Recuperação | XP |
|------|---------|-------------|-----|
| **Short Rest** | 1-60 min | 30% HP/MP | 0 XP |
| **Long Rest** | Automático ao completar health challenge | 100% HP/MP | +50 XP |

---

## 👹 Boss Battles

### Poder do Boss
```
Poder = (Nível do boss × 100) + (XP Total do boss ÷ 10)

Exemplo:
- Boss Nível 1, XP 100 = 100 + 10 = 110 de poder
- Boss Nível 10, XP 1000 = 1000 + 100 = 1100 de poder
```

### Recompensas de Boss
- **XP**: Reduzido comparado a missões (aproximadamente nível × 30)
- **Ouro**: 10 🪙 fixo
- **Drops**: Equipamentos raros (Epic/Legendary)

---

## ✨ Inspiração (Weekly Inspiration)

### Como ganhar?
- Completa **3 missões diárias em sequência** = +1 Inspiração
- **Máximo**: 1 inspiração por semana
- **Locação**: Verificar em "Meu Perfil"

### Bônus de Inspiração
- **Combat Adrenaline**: +2x multiplicador de ataque em alguns combates
- **Boss Debuff**: Reduz poder do boss em 20% (0.8x)

---

## ⚠️ Penalidades

### Missão Fracassada
- **Custo**: 10 🪙 para "pagar a penalidade"
- **Recuperação**: Restaura o XP que seria ganho
- **Nota**: Não penaliza streak automaticamente se recuperada

---

## 📊 Progressão de Nível

### Tabela XP (Primeiros 30 níveis)
```
Nível 1: 0 XP
Nível 5: 700 XP
Nível 10: 2950 XP
Nível 15: 6200 XP
Nível 20: 10700 XP
Nível 25: 16450 XP
Nível 30: 21950 XP
```

### Ganho de Pontos de Talento ao subir nível
- Automático via banco de dados (trigger)
- Aparece em "Árvore de Talentos"

---

## 🔧 Mecânicas Importantes

### Atributos (6 tipos)
- **Força**: Missões de exercício físico
- **Agilidade**: Atividades de cardio/mobilidade
- **Inteligência**: Estudo/aprendizado
- **Sabedoria**: Meditação/reflexão
- **Disciplina**: Hábitos disciplinados
- **Resiliência**: Recuperação/resistência

Cada atributo tem seu próprio **nível e XP** (0-100 XP por nível)

### Daily Bonus (Bônus Diário)
- **Recompensa**: +15 XP + 5 🪙
- **Frequência**: Uma vez a cada 24h
- **Locação**: Dashboard (botão "Coletar")

---

## 💾 Persistência de Estado

### LocalStorage
- **Short Rest**: `short_rest_${user.id}` - Persiste tempo decorrido e estado
- **Replication Sync**: Ao retornar, calcula tempo offline decorrido e completa o descanso se necessário

---

## 📝 Resumo Rápido

| Item | Padrão | Escalável? |
|------|--------|-----------|
| **Short Rest** | 30% HP/MP | ❌ Não depende do tempo |
| **XP Missão** | Base × Multiplicador (nível) | ✅ Sim, escala com nível |
| **Ouro** | 2 + bônus streak | ✅ Sim, com streak |
| **Talentos** | 1 a cada 5 níveis | ✅ Sim, automático |
| **Health XP** | +50 (onetum/dia) | ❌ Fixo |
| **Boss Ouro** | 10 🪙 | ❌ Fixo |

