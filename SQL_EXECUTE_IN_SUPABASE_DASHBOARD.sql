-- ============================================
-- Copie e cole este SQL no Supabase Dashboard
-- Projeto: jshauyvknqgxhzmslnoc
-- Acesse: https://app.supabase.com/project/jshauyvknqgxhzmslnoc/sql
-- ============================================

-- ============================================================
-- PASSO 1: Adiciona colunas ausentes (idempotente - IF NOT EXISTS)
-- Resolve: "combat_skill_loadout column not found in schema cache"
-- Resolve: "column user_inventory.sintonizado does not exist"
-- ============================================================

-- 1a. profiles: loadout de habilidades de combate
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS combat_skill_loadout jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 1b. user_inventory: flag de sintonização de itens mágicos
ALTER TABLE public.user_inventory
  ADD COLUMN IF NOT EXISTS sintonizado boolean NOT NULL DEFAULT false;

-- 1c. game_items: flag de item que exige sintonização
ALTER TABLE public.game_items
  ADD COLUMN IF NOT EXISTS requer_sintonizacao boolean NOT NULL DEFAULT false;

-- Marca épicos/lendários como exigindo sintonização
UPDATE public.game_items
SET requer_sintonizacao = true
WHERE lower(coalesce(rarity, '')) IN ('epico', 'lendario')
  AND requer_sintonizacao = false;

-- Índice para consultas de sintonização por usuário
CREATE INDEX IF NOT EXISTS idx_user_inventory_user_sintonizado
  ON public.user_inventory (user_id, sintonizado)
  WHERE sintonizado = true;

-- ============================================================
-- PASSO 2: Garante permissões nas tabelas alteradas
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_inventory  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_items      TO anon, authenticated;

-- ============================================================
-- PASSO 3: Recarrega o cache do PostgREST
-- (obrigatório após ALTER TABLE para as colunas ficarem visíveis)
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PASSO 4: Cria tabelas de talentos ausentes no banco
-- Resolve: talentos_disponiveis e talentos_jogador não existem
-- ============================================================

-- Ponto de talento no perfil
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pontos_talento integer NOT NULL DEFAULT 0;

-- Catálogo de talentos disponíveis
CREATE TABLE IF NOT EXISTS public.talentos_disponiveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  descricao text NOT NULL,
  efeito text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Talentos adquiridos por cada jogador
CREATE TABLE IF NOT EXISTS public.talentos_jogador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  personagem_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  talento_id uuid NOT NULL REFERENCES public.talentos_disponiveis(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

-- ============================================================
-- PASSO 8: Registrar release v1.6.0 para atualização in-app
-- Resolve: download da APK mais nova no modal de atualização
-- ============================================================
INSERT INTO public.app_releases (version, version_code, apk_url, changelog, is_mandatory)
VALUES (
  '1.6.0',
  7,
  'https://github.com/Scaffx/rpg-buddy/releases/download/v1.6.0/lifeonrpg-v1.6.0.apk',
  'Correções de combate e sincronização completa de HP/MP/Fadiga entre Perfil e Boss. Ajustes de recuperação de MP por poções e short rest.',
  false
)
ON CONFLICT (version) DO UPDATE SET
  version_code = EXCLUDED.version_code,
  apk_url = EXCLUDED.apk_url,
  changelog = EXCLUDED.changelog,
  is_mandatory = EXCLUDED.is_mandatory;
  UNIQUE (personagem_id, talento_id)
);

ALTER TABLE public.talentos_disponiveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talentos_jogador ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='talentos_disponiveis' AND policyname='Anyone can view talentos disponiveis') THEN
    CREATE POLICY "Anyone can view talentos disponiveis" ON public.talentos_disponiveis FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='talentos_jogador' AND policyname='Users can view own talentos') THEN
    CREATE POLICY "Users can view own talentos" ON public.talentos_jogador FOR SELECT TO authenticated USING (auth.uid() = personagem_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='talentos_jogador' AND policyname='Users can insert own talentos') THEN
    CREATE POLICY "Users can insert own talentos" ON public.talentos_jogador FOR INSERT TO authenticated WITH CHECK (auth.uid() = personagem_id);
  END IF;
END $$;

-- Seed: talentos base
INSERT INTO public.talentos_disponiveis (nome, descricao, efeito) VALUES
  ('Madrugador',          '+15% XP antes das 8h.',                             'madrugador'),
  ('Foco Inabalavel',     'Combo dura ate 48h entre conclusoes.',               'foco_inabalavel'),
  ('Mestre Mercador',     '10% de desconto na loja.',                           'mestre_mercador'),
  ('Rato de Biblioteca',  'Bonus de XP em tarefas de estudo e leitura.',        'rato_biblioteca'),
  ('Corpo de Ferro',      'Aumenta resistencia para rotinas fisicas intensas.',  'corpo_de_ferro'),
  ('Sorte de Principiante','Pequena chance de recompensa extra em missoes.',     'sorte_de_principiante'),
  ('Cacador de Titas',    'Melhora desempenho contra desafios de alto nivel.',   'cacador_de_titas'),
  ('Pele de Pedra',       'Aumenta defesa base em situacoes de risco.',          'pele_de_pedra'),
  ('Sifao de Mana',       'Recupera uma porcao de MP ao concluir tarefas.',      'sifao_de_mana'),
  ('Investidor Anjo',     'Aumenta ganho de ouro em conclusoes consistentes.',   'investidor_anjo'),
  ('Alquimista Amador',   'Melhora efeitos de consumiveis e buffs.',             'alquimista_amador'),
  ('Pulmoes de Aco',      'Eleva desempenho em atividades de resistencia.',      'pulmoes_de_aco'),
  ('Ordem no Caos',       'Bonus quando ha varias tarefas em paralelo.',         'ordem_no_caos'),
  ('Estado de Fluxo',     'Aumenta eficiencia em sequencias de foco.',           'estado_de_fluxo'),
  ('Presenca Inspiradora','Fortalece bonus de suporte e motivacao.',             'presenca_inspiradora'),
  ('Fotossintese',        'Recuperacao leve passiva de energia ao longo do dia.','fotossintese')
ON CONFLICT (efeito) DO UPDATE SET nome = EXCLUDED.nome, descricao = EXCLUDED.descricao;

-- Trigger para ganhar pontos de talento ao subir de nível
CREATE OR REPLACE FUNCTION public.sync_talent_points_on_level_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_chunks integer;
  new_chunks integer;
  gain integer;
BEGIN
  old_chunks := floor(COALESCE(OLD.level, 1) / 5.0);
  new_chunks := floor(COALESCE(NEW.level, 1) / 5.0);
  gain := GREATEST(0, new_chunks - old_chunks);
  NEW.pontos_talento := COALESCE(NEW.pontos_talento, 0) + gain;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_talent_points_on_level_change_trigger ON public.profiles;
CREATE TRIGGER sync_talent_points_on_level_change_trigger
BEFORE UPDATE OF level ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_talent_points_on_level_change();

-- Backfill de pontos para usuários existentes
UPDATE public.profiles
SET pontos_talento = GREATEST(COALESCE(pontos_talento, 0), floor(COALESCE(level, 1) / 5.0));

-- Permissões
GRANT SELECT ON public.talentos_disponiveis TO anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.talentos_jogador TO authenticated;

-- ============================================================
-- PASSO 5: Corrige persistência do Diário de Aventura
-- Resolve: "Erro ao salvar diário" (tabela/policies ausentes)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.adventure_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  content text NOT NULL DEFAULT '',
  mood text CHECK (mood IN ('feliz', 'neutro', 'cansado', 'motivado', 'ansioso')) DEFAULT 'neutro',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_date)
);

CREATE INDEX IF NOT EXISTS idx_adventure_journal_user_date
  ON public.adventure_journal (user_id, entry_date DESC);

ALTER TABLE public.adventure_journal ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'adventure_journal'
      AND policyname = 'users_own_journal'
  ) THEN
    CREATE POLICY "users_own_journal" ON public.adventure_journal
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.adventure_journal TO authenticated;

-- Recarrega o cache para a nova tabela aparecer imediatamente via API
NOTIFY pgrst, 'reload schema';

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

-- ============================================================
-- PASSO 6: Cria tabela de desafios de NPC
-- Resolve: "Could not find the table 'public.npc_challenge_completions' in the schema cache"
-- ============================================================

CREATE TABLE IF NOT EXISTS public.npc_challenge_completions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  npc_id       text        NOT NULL,
  challenge_id text        NOT NULL,
  week_token   text        NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  xp_earned    int         NOT NULL DEFAULT 0,
  gold_earned  int         NOT NULL DEFAULT 0,
  UNIQUE (user_id, npc_id, challenge_id, week_token)
);

CREATE INDEX IF NOT EXISTS idx_npc_completions_user_week
  ON public.npc_challenge_completions (user_id, week_token);

ALTER TABLE public.npc_challenge_completions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'npc_challenge_completions'
      AND policyname = 'users_own_npc_completions'
  ) THEN
    CREATE POLICY "users_own_npc_completions" ON public.npc_challenge_completions
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, DELETE ON public.npc_challenge_completions TO authenticated;

-- ============================================================
-- PASSO 7: Cria funções RPC usadas pela página de NPC
-- Resolve: "add_xp_to_user" e "add_gold_to_user" não existem
-- ============================================================

-- Tabela de XP necessário por nível (espelha src/lib/progression.ts)
CREATE OR REPLACE FUNCTION public.add_xp_to_user(p_user_id uuid, p_xp int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_xp  int;
  v_new_xp      int;
  v_new_level   int;
  xp_table      int[] := ARRAY[
       0,   80,  180,  300,  440,  600,  775,  960, 1155, 1360,
    1575, 1800, 2040, 2295, 2565, 2855, 3165, 3495, 3850, 4230,
    4640, 5080, 5555, 6065, 6615, 7205, 7840, 8520, 9250,10035,
   10875,11775
  ];
  i             int;
BEGIN
  SELECT COALESCE(total_xp, 0) INTO v_current_xp
    FROM public.profiles WHERE user_id = p_user_id;

  v_new_xp := v_current_xp + p_xp;

  -- Calcula nível a partir da tabela de XP
  v_new_level := 1;
  FOR i IN REVERSE array_length(xp_table, 1)..2 LOOP
    IF v_new_xp >= xp_table[i] THEN
      v_new_level := i;
      EXIT;
    END IF;
  END LOOP;

  UPDATE public.profiles
    SET total_xp = v_new_xp,
        level    = v_new_level
  WHERE user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_gold_to_user(p_user_id uuid, p_gold int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.user_balance
    SET gold       = COALESCE(gold, 0) + p_gold,
        updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_xp_to_user(uuid, int)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_gold_to_user(uuid, int) TO authenticated;

NOTIFY pgrst, 'reload schema';
