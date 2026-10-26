DROP TRIGGER guard_inventory_forage_pet ON public.companions;
CREATE TRIGGER guard_inventory_forage_pet BEFORE UPDATE ON public.companions
FOR EACH ROW WHEN (NEW.name IS DISTINCT FROM OLD.name)
EXECUTE FUNCTION public._guard_inventory_forage_pet();
