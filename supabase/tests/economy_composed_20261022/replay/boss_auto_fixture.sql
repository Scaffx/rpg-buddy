-- Apply after auto_adventure_fixture.sql and 20261019194052_auto_adventure.sql.
CREATE TABLE public.bosses (
  id uuid PRIMARY KEY, name text NOT NULL, level integer NOT NULL,
  icon text NOT NULL, is_world_event boolean NOT NULL DEFAULT false
);
ALTER TABLE public.bosses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view bosses" ON public.bosses FOR SELECT USING (true);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.bosses TO authenticated;
INSERT INTO public.bosses(id,name,level,icon)
SELECT ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
  CASE n WHEN 20 THEN 'Leviatã Primitivo'
    WHEN 23 THEN 'Wyvern Relâmpago' WHEN 24 THEN 'Necromante Eterno'
    WHEN 27 THEN 'Dragão Sombrio' WHEN 29 THEN 'Kraken Abissal'
    WHEN 32 THEN 'Wyrm de Gelo Eterno' WHEN 33 THEN 'Demônio da Fome'
    WHEN 57 THEN 'Chronos, Deus do Tempo'
    ELSE 'Boss ' || n END,n,'⚔️'
FROM generate_series(1,57) n;
INSERT INTO public.bosses VALUES
('ffffffff-ffff-ffff-ffff-ffffffffffff','Evento Mundial',0,'🌍',true);

CREATE TABLE public.boss_battles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  boss_id uuid NOT NULL REFERENCES public.bosses(id),
  damage_dealt integer NOT NULL DEFAULT 0, won boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.boss_battles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can create own battles" ON public.boss_battles
  FOR INSERT TO authenticated WITH CHECK (auth.uid()=user_id);
CREATE POLICY "Users can view own battles" ON public.boss_battles
  FOR SELECT TO authenticated USING (auth.uid()=user_id);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.boss_battles TO authenticated;
INSERT INTO public.boss_battles(user_id,boss_id,won)
VALUES ('11111111-1111-1111-1111-111111111111',
        '00000000-0000-0000-0000-000000000023',true),
       ('33333333-3333-3333-3333-333333333333',
        '00000000-0000-0000-0000-000000000023',true);

CREATE FUNCTION public.resolve_boss_battle(uuid,boolean,integer)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb $$;
GRANT EXECUTE ON FUNCTION public.resolve_boss_battle(uuid,boolean,integer) TO authenticated;

CREATE TABLE public.pet_catalog (
  pet_type text PRIMARY KEY, name text NOT NULL, emoji text NOT NULL,
  role text NOT NULL, atk integer NOT NULL, def integer NOT NULL,
  hp integer NOT NULL, mp integer NOT NULL, price integer NOT NULL,
  sort integer NOT NULL, unlock_boss_id uuid REFERENCES public.bosses(id)
);
ALTER TABLE public.pet_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pet_catalog readable" ON public.pet_catalog FOR SELECT USING (true);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.pet_catalog TO authenticated;
INSERT INTO public.pet_catalog
  (pet_type,name,emoji,role,atk,def,hp,mp,price,sort,unlock_boss_id)
VALUES
  ('mini_relampago','Mini Wyvern','⚡','physical',55,18,180,40,100,1,'00000000-0000-0000-0000-000000000023'),
  ('mini_leviata','Mini Leviatã','🐉','magic',42,22,200,90,100,2,'00000000-0000-0000-0000-000000000020'),
  ('mini_kraken','Mini Kraken','🦑','support',30,32,260,100,100,3,'00000000-0000-0000-0000-000000000029'),
  ('mini_necromante','Mini Necromante','🧟','magic',48,20,200,95,100,4,'00000000-0000-0000-0000-000000000024'),
  ('mini_dragao_sombrio','Mini Dragão','🐲','physical',62,26,220,55,100,5,'00000000-0000-0000-0000-000000000027'),
  ('mini_wyrm_gelo','Mini Wyrm','❄️','magic',45,30,240,85,100,6,'00000000-0000-0000-0000-000000000032'),
  ('mini_demonio_fome','Mini Demônio','👹','physical',70,24,200,60,100,7,'00000000-0000-0000-0000-000000000033');

CREATE TABLE public.companions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  companion_type text NOT NULL, companion_role text, origin text NOT NULL,
  name text NOT NULL, atk integer, def integer, max_hp integer,
  current_hp integer, max_mp integer, current_mp integer,
  UNIQUE(user_id,origin)
);
CREATE TABLE public.inventory_forage_eligible (
  companion_id uuid PRIMARY KEY REFERENCES public.companions(id),
  user_id uuid NOT NULL, companion_type text NOT NULL, origin text NOT NULL
);
CREATE FUNCTION public._record_inventory_forage_pet() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user = 'postgres' AND NEW.companion_type='mini_demonio_fome'
    AND NEW.origin='shop' THEN
    INSERT INTO public.inventory_forage_eligible
      (companion_id,user_id,companion_type,origin)
    VALUES(NEW.id,NEW.user_id,NEW.companion_type,NEW.origin);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER record_inventory_forage_pet AFTER INSERT ON public.companions
FOR EACH ROW EXECUTE FUNCTION public._record_inventory_forage_pet();
INSERT INTO public.companions(user_id,companion_type,origin,name)
VALUES('11111111-1111-1111-1111-111111111111','mini_relampago','shop','Mini antigo');
