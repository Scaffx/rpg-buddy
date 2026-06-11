-- ============================================================================
-- BLOCO 1 / Migration 02 — [DADO SÓLIDO no diagnóstico] — ⚠️ NÃO RODAR AINDA ⚠️
--
-- Fecha as RLS que hoje permitem ao cliente decidir o resultado do combate.
-- SÓ pode rodar DEPOIS que os fluxos legítimos abaixo migrarem pro servidor
-- (escopo natural do Bloco 3, que já vai reescrever processar_turno):
--
--  BLOQUEADOR 1 — combates_ativos UPDATE:
--    CombatArena.tsx:633/678/1005/1055 atualiza hp_atual_boss/status direto
--    (mecânica de renascimento da Fênix/Guerreiro Imortal e reset de arena).
--    Precisa virar RPC SECURITY DEFINER ou ação do edge function.
--  BLOQUEADOR 2 — personagens INSERT/UPDATE:
--    useBossCombat.ts:231-233 faz upsert de ataque_base/defesa_base/hp_max
--    no início do combate. Precisa virar RPC iniciar_combate() server-side.
--  BLOQUEADOR 3 — user_inventory INSERT/UPDATE(quantity):
--    DungeonArena.tsx:1129-1131 (loot), BossPage.tsx:261/395 (drops de boss
--    no cliente), useInventory.ts (vários). Loot precisa ir pro servidor.
--  BLOQUEADOR 4 — user_health_stats UPDATE (current_hp/current_mp/fatigue):
--    CombatArena.tsx:756-766 persiste vitais a cada turno; useProfile.tsx:671
--    recalcula max_hp/max_mp no cliente. Vitais de combate precisam ser
--    escritos APENAS pelo processar_turno; metas de saúde (refeições, água,
--    sono) podem continuar no cliente via policy de colunas (trigger abaixo).
--
-- Evidência do risco (pg_policies em 11/06/2026):
--   combates_ativos  UPDATE qual=(auth.uid() = personagem_id)  -> hp_atual_boss=1 e "vitória"
--   personagens      UPDATE/INSERT (auth.uid() = id)           -> ataque_base=99999
--   user_inventory   INSERT (auth.uid() = user_id)             -> auto-conceder item lendário
--   user_health_stats UPDATE (auth.uid() = user_id)            -> current_mp/max_hp infinitos
-- ============================================================================

-- ── 1. combates_ativos: cliente só INICIA e LÊ; quem move o combate é o servidor ──
DROP POLICY IF EXISTS "Users can update own combats" ON public.combates_ativos;
-- ROLLBACK:
-- CREATE POLICY "Users can update own combats" ON public.combates_ativos
--   FOR UPDATE USING (auth.uid() = personagem_id);

-- ── 2. personagens: passa a ser escrito só por RPC/edge (service_role) ──
DROP POLICY IF EXISTS "Users can insert own personagem" ON public.personagens;
DROP POLICY IF EXISTS "Users can update own personagem" ON public.personagens;
-- ROLLBACK:
-- CREATE POLICY "Users can insert own personagem" ON public.personagens
--   FOR INSERT WITH CHECK (auth.uid() = id);
-- CREATE POLICY "Users can update own personagem" ON public.personagens
--   FOR UPDATE USING (auth.uid() = id);

-- ── 3. user_inventory: INSERT só server-side; UPDATE do cliente restrito a
--       equipar/sintonizar (não pode mexer em item_id/quantity) ──
DROP POLICY IF EXISTS "Users can insert own inventory" ON public.user_inventory;
-- ROLLBACK:
-- CREATE POLICY "Users can insert own inventory" ON public.user_inventory
--   FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.guard_user_inventory_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- service_role / RPCs SECURITY DEFINER passam direto
  IF current_setting('request.jwt.claims', true) IS NULL
     OR (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- cliente autenticado: só pode alterar equipped/sintonizado
  IF NEW.item_id IS DISTINCT FROM OLD.item_id
     OR NEW.quantity IS DISTINCT FROM OLD.quantity
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Somente equipar/sintonizar pode ser alterado pelo cliente';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_user_inventory_update ON public.user_inventory;
CREATE TRIGGER trg_guard_user_inventory_update
  BEFORE UPDATE ON public.user_inventory
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_inventory_update();
-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_guard_user_inventory_update ON public.user_inventory;
-- DROP FUNCTION IF EXISTS public.guard_user_inventory_update();

-- ── 4. user_health_stats: cliente não altera mais vitais de combate ──
CREATE OR REPLACE FUNCTION public.guard_health_stats_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF current_setting('request.jwt.claims', true) IS NULL
     OR (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.current_hp IS DISTINCT FROM OLD.current_hp
     OR NEW.current_mp IS DISTINCT FROM OLD.current_mp
     OR NEW.max_hp IS DISTINCT FROM OLD.max_hp
     OR NEW.max_mp IS DISTINCT FROM OLD.max_mp
     OR NEW.fatigue IS DISTINCT FROM OLD.fatigue THEN
    RAISE EXCEPTION 'Vitais de combate são alterados apenas pelo servidor';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_health_stats_update ON public.user_health_stats;
CREATE TRIGGER trg_guard_health_stats_update
  BEFORE UPDATE ON public.user_health_stats
  FOR EACH ROW EXECUTE FUNCTION public.guard_health_stats_update();
-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_guard_health_stats_update ON public.user_health_stats;
-- DROP FUNCTION IF EXISTS public.guard_health_stats_update();
