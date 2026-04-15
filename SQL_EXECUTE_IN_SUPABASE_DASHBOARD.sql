-- ============================================
-- Copie e cole este SQL no Supabase Dashboard
-- Acesse: supabase.com → seu-projeto → SQL Editor → New Query
-- ============================================

-- Add comprehensive mechanics documentation to system update logs
INSERT INTO public.system_update_logs (version_tag, title, summary, details, is_highlighted) VALUES
  (
    'v0.9.0',
    'Documentação Completa de Mecânicas',
    'Guia detalhado de todos os sistemas do jogo incluindo Short Rest, XP scaling, Gold rewards, Talents e mais.',
    'Acesse "Meu Perfil" → "Informações do Sistema" → "Logs de Atualização" para consultar a tabela completa de mecânicas do RPG Buddy.',
    true
  ),
  (
    'v0.9.0',
    '⏱️ Short Rest - Descanso Breve',
    'O timer NÃO é variável. Sempre recupera 30% de HP máximo + 30% de MP máximo.',
    'A duração (1-60 minutos) serve apenas para meditação/gamificação. A recuperação é FIXA: Math.max(1, ceil(maxHp * 0.3)) + Math.max(1, ceil(maxMp * 0.3)). Exemplo: 100 HP máx = sempre +30 HP.',
    false
  ),
  (
    'v0.9.0',
    '📊 XP de Missões - Escala com Nível',
    'XP dinâmico que aumenta conforme você progride.',
    'Multiplicador = 1 + floor((nível - 1) / 5) * 0.5. Nível 1-4: 1.0x | Nível 5-9: 1.5x | Nível 10-14: 2.0x. Bônus Madrugador (+15% antes das 8h) e Checklist (+2 XP por item). Fórmula: XP_base × multiplicador × [1.15 se madrugador] + checklist_bonus.',
    false
  ),
  (
    'v0.9.0',
    '💰 Ouro - Recompensas com Streak',
    'Ouro varia conforme sua consistência nas missões.',
    'Base: 2 🪙 por missão. Bônus streak: +1 ouro a cada 3 missões consecutivas. Exemplo sequência: 2, 2, 3(3÷3=1 bonus), 3, 3, 4(6÷3=2 bonus). Talent Mestre Mercador aplica 10% desconto na loja, NÃO nas recompensas de missão.',
    false
  ),
  (
    'v0.9.0',
    '🎖️ Talentos - Ganho Automático com Nível',
    'Sistema de habilidades especiais que crescem naturalmente.',
    'Fórmula: 1 ponto a cada 5 níveis. Nível 5-9: 1 ponto | Nível 10-14: 2 pontos | Nível 15-19: 3 pontos (automático via trigger no banco). Talentos disponíveis: Madrugador (+15% XP antes 8h), Foco Inabalável (combo 48h), Mestre Mercador (10% desconto).',
    false
  ),
  (
    'v0.9.0',
    '🏥 Health Challenge - Desafio de Saúde',
    'Completar metas diárias de refeições e hidratação premia XP.',
    'Requisito: Cumprir meta de refeições AND hidratação no mesmo dia. Recompensa: +50 XP (uma vez por dia). Recuperação: 100% HP/MP automático ao completar. Acesse "Meu Perfil" → "Ajustes" para definir metas (refeições mínimas e litros de água).',
    false
  ),
  (
    'v0.9.0',
    '👹 Boss Battles - XP Reduzido + Ouro Alto',
    'Combates com recompensas balanceadas para desafio.',
    'Poder do Boss = (nível × 100) + (XP_total ÷ 10). Exemplo: Nível 1 + 100 XP = 110 poder. Recompensas: XP reduzido (~nível × 30), Ouro: 10 🪙 fixo (mais que missões comuns). Drops: equipamentos raros (Epic/Legendary).',
    false
  ),
  (
    'v0.9.0',
    '✨ Inspiração - Bônus Semanal',
    'Sistema de combo semanal que desbloqueia poderes especiais.',
    'Ganho: Completar 3 missões diárias em sequência = +1 Inspiração. Máximo: 1 por semana. Bônus: Combat Adrenaline (+2x ataque) ou Boss Debuff (reduz poder do boss em 20% = 0.8x). Visualize em "Meu Perfil" → "Aba Perfil" → Inspiração.',
    false
  ),
  (
    'v0.9.0',
    '⚠️ Penalidades - Recuperação de Missões Fracassadas',
    'Sistema de recuperação para missões não completas.',
    'Custo: 10 🪙 para pagar penalidade. Recuperação: Restaura XP que seria ganho. Nota: Streak NÃO é penalizada automaticamente se recuperada. Acesse "Missões Fracassadas" para gerir.',
    false
  ),
  (
    'v0.9.0',
    '📈 Progressão de Nível - Tabla XP Completa',
    'Acompanhe seu progresso nos primeiros 30 níveis.',
    'Nível 1: 0 XP | Nível 5: 700 XP | Nível 10: 2950 XP | Nível 15: 6200 XP | Nível 20: 10700 XP | Nível 25: 16450 XP | Nível 30: 21950 XP. Ganho de Talentos: Automático ao subir nível (trigger: pontos_talento atualizado).',
    false
  ),
  (
    'v0.9.0',
    '🎯 Atributos - 6 Tipos com XP Independente',
    'Cada atributo tem seu nível e progressão separados.',
    'Atributos: Força (exercício), Agilidade (cardio), Inteligência (estudo), Sabedoria (meditação), Disciplina (hábitos), Resiliência (recuperação). Cada um: 0-100 XP por nível. Ganho: Atribuído automaticamente ao completar missão com aquele atributo.',
    false
  ),
  (
    'v0.9.0',
    '🎁 Daily Bonus - Bônus Diário',
    'Recompensa simples e consistente por logging.',
    'Frequência: Uma vez a cada 24h. Recompensa: +15 XP + 5 🪙. Locação: Dashboard → Botão "Coletar". Visualizar countdown para próximo bônus.',
    false
  )
ON CONFLICT DO NOTHING;
