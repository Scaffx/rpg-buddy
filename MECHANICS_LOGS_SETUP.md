# 📋 Como Ativar os Logs de Mecânicas no Sistema

A documentação dos sistemas do RPG Buddy foi adicionada aos **Logs de Atualização**. Para ativá-la, escolha um dos métodos abaixo:

## Opção 1: Via Supabase Dashboard (Recomendado para testes rápidos) ✅

1. Acesse o Supabase Dashboard: https://supabase.com/projects
2. Selecione seu projeto: `rpg-buddy`
3. Vá para **SQL Editor** → **New Query**
4. Abra o arquivo `SQL_EXECUTE_IN_SUPABASE_DASHBOARD.sql` neste repositório
5. Copie **TODO** o conteúdo SQL
6. Cole no SQL Editor do Supabase Dashboard
7. Clique em **Run** (ou Ctrl+Enter)

✅ Pronto! Os logs aparecem em: **Meu Perfil → Informações do Sistema → Logs de Atualização**

---

## Opção 2: Via Supabase CLI (Recomendado para produção)

Se você tiver o Supabase CLI instalado:

```bash
cd c:\Users\Murillo\Desktop\RPG-Buddy\rpg-buddy
supabase migration up
```

Isso executará automaticamente a migração `20260415234500_add_mechanics_update_logs.sql`.

---

## Opção 3: Via Supabase Link (Automático em Deploy)

Se o projeto está linkado via `supabase link`:

```bash
supabase db push
```

Todas as migrations pendentes (incluindo a de mecânicas) serão aplicadas.

---

## 📖 O que será adicionado?

**12 logs de atualização cobrindo:**
- ⏱️ **Short Rest** - Explicação do timer (30% HP/MP fixo)
- 📊 **XP de Missões** - Como escala com nível
- 💰 **Ouro** - Sistema de streaks
- 🎖️ **Talentos** - Ganho automático
- 🏥 **Health Challenge** - Desafio de saúde
- 👹 **Boss Battles** - Mecânicas de combate
- ✨ **Inspiração** - Bônus semanal
- ⚠️ **Penalidades** - Recuperação de missões
- 📈 **Progressão** - Tabela XP
- 🎯 **Atributos** - 6 tipos com XP independente
- 🎁 **Daily Bonus** - Bônus diário

---

## ⚠️ Importante

- A primeira execução pode gerar conflitos se os logs já existem
- Veja em `supabase/migrations/20260415234500_add_mechanics_update_logs.sql` para o código completo
- Use `ON CONFLICT DO NOTHING` para evitar duplicatas

---

## 🔍 Como Visualizar (Após Ativação)

1. Abra o app RPG Buddy
2. Clique em **Meu Perfil** (icone do usuário)
3. Vá para **Informações do Sistema**
4. Visualize os **Logs de Atualização**

Pronto! Todos os sistemas estão documentados e explicados! 🎉
