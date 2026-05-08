-- ============================================================
-- Companheiros de Combate — Stats de batalha
--
-- Os 3 companheiros iniciais (dog, cat, calopsita) são animais
-- de companhia e mantêm o sistema de humor/XP sem stats de combate.
--
-- O Ossinho (skeleton_pup) e todos os futuros companheiros
-- desbloqueados via bosses/eventos passam a ter:
--   • HP / ATK / DEF / MP próprios
--   • companion_role: 'physical' | 'magic' | 'support'
--   • equipped_item_id já existe — agora tem efeito real de stats
-- ============================================================

-- ── 1. Adicionar colunas de stats ao companions ───────────────
ALTER TABLE public.companions
  ADD COLUMN IF NOT EXISTS max_hp        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_hp    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS atk           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS def           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_mp        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_mp    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS companion_role TEXT    NOT NULL DEFAULT 'none'
    CHECK (companion_role IN ('none', 'physical', 'magic', 'support'));

-- ── 2. Definir stats iniciais para cada tipo ──────────────────
-- skeleton_pup (Ossinho): tanque físico, carrega armas
UPDATE public.companions
SET
  max_hp        = 60 + (level * 8),
  current_hp    = 60 + (level * 8),
  atk           = 12 + (level * 2),
  def           = 8  + (level * 1),
  max_mp        = 10,
  current_mp    = 10,
  companion_role = 'physical'
WHERE companion_type = 'skeleton_pup';

-- Caso futuros companheiros sejam criados via INSERT (sem stats):
-- O trigger abaixo preenche automaticamente baseado no tipo.
CREATE OR REPLACE FUNCTION set_companion_default_stats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  CASE NEW.companion_type
    WHEN 'skeleton_pup' THEN
      NEW.max_hp        := 60 + (NEW.level * 8);
      NEW.current_hp    := 60 + (NEW.level * 8);
      NEW.atk           := 12 + (NEW.level * 2);
      NEW.def           := 8  + (NEW.level * 1);
      NEW.max_mp        := 10;
      NEW.current_mp    := 10;
      NEW.companion_role := 'physical';
    -- Placeholder para companheiros mágicos futuros
    WHEN 'spirit_fox' THEN
      NEW.max_hp        := 45 + (NEW.level * 6);
      NEW.current_hp    := 45 + (NEW.level * 6);
      NEW.atk           := 8  + (NEW.level * 1);
      NEW.def           := 5;
      NEW.max_mp        := 40 + (NEW.level * 5);
      NEW.current_mp    := 40 + (NEW.level * 5);
      NEW.companion_role := 'magic';
    WHEN 'golem_guardian' THEN
      NEW.max_hp        := 100 + (NEW.level * 12);
      NEW.current_hp    := 100 + (NEW.level * 12);
      NEW.atk           := 10 + (NEW.level * 1);
      NEW.def           := 15 + (NEW.level * 2);
      NEW.max_mp        := 5;
      NEW.current_mp    := 5;
      NEW.companion_role := 'support';
    ELSE
      -- Animais iniciais (dog, cat, calopsita) ficam com max_hp=0 (sem combate)
      NULL;
  END CASE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companion_default_stats ON public.companions;
CREATE TRIGGER trg_companion_default_stats
  BEFORE INSERT ON public.companions
  FOR EACH ROW
  EXECUTE FUNCTION set_companion_default_stats();

-- ── 3. Trigger para recalcular stats ao subir de nível ────────
-- (level-up já ocorre no hook useInteractCompanion — este trigger
--  re-sincroniza max_hp/max_mp quando level muda para companheiros de combate)
CREATE OR REPLACE FUNCTION sync_companion_combat_stats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Só atualiza se for companheiro de combate e o nível mudou
  IF NEW.companion_role != 'none' AND NEW.level != OLD.level THEN
    CASE NEW.companion_type
      WHEN 'skeleton_pup' THEN
        NEW.max_hp    := 60 + (NEW.level * 8);
        NEW.current_hp := LEAST(NEW.current_hp + 8, NEW.max_hp);
        NEW.atk       := 12 + (NEW.level * 2);
        NEW.def       := 8  + (NEW.level * 1);
      WHEN 'spirit_fox' THEN
        NEW.max_hp    := 45 + (NEW.level * 6);
        NEW.current_hp := LEAST(NEW.current_hp + 6, NEW.max_hp);
        NEW.atk       := 8  + (NEW.level * 1);
        NEW.max_mp    := 40 + (NEW.level * 5);
        NEW.current_mp := LEAST(NEW.current_mp + 5, NEW.max_mp);
      WHEN 'golem_guardian' THEN
        NEW.max_hp    := 100 + (NEW.level * 12);
        NEW.current_hp := LEAST(NEW.current_hp + 12, NEW.max_hp);
        NEW.def       := 15 + (NEW.level * 2);
      ELSE NULL;
    END CASE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_companion_combat_stats ON public.companions;
CREATE TRIGGER trg_sync_companion_combat_stats
  BEFORE UPDATE ON public.companions
  FOR EACH ROW
  EXECUTE FUNCTION sync_companion_combat_stats();
