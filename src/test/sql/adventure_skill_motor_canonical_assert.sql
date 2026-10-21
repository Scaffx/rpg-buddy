-- Integration seam only: local stubs model the separately owned authority
-- migration. Run LAST, after the ordinary motor and clock assertions.
CREATE FUNCTION pg_temp.ok_canonical(v boolean,m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion: %',m; END IF; END $$;
CREATE FUNCTION app_private.hero_class_key(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE WHEN p_user_id='bbbbbbbb-0000-0000-0000-000000000001' THEN 'mago' ELSE NULL END
$$;
CREATE FUNCTION app_private.has_hero_class(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_user_id='bbbbbbbb-0000-0000-0000-000000000001'
$$;
REVOKE ALL ON FUNCTION app_private.hero_class_key(uuid),
  app_private.has_hero_class(uuid) FROM PUBLIC,anon,authenticated;
INSERT INTO auth.users(id) VALUES('bbbbbbbb-0000-0000-0000-000000000001');
INSERT INTO public.profiles(user_id,level,starter_class,current_class_id,combat_skill_loadout)
VALUES('bbbbbbbb-0000-0000-0000-000000000001',1,'guerreiro',NULL,
  '[{"id":"m_dardo","power":99999}]'::jsonb);
INSERT INTO public.player_skill_nodes(user_id,node_id,rank)
VALUES('bbbbbbbb-0000-0000-0000-000000000001','m_dardo',1);
SET ROLE authenticated;
SET request.jwt.claim.sub='bbbbbbbb-0000-0000-0000-000000000001';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok_canonical((SELECT hero_class='mago' AND skills->0->>'id'='m_dardo'
  AND events->0->>'skill_id'='m_dardo' AND events->0->>'effect'='arcane'
  FROM app_private.adventure_battles
  WHERE user_id='bbbbbbbb-0000-0000-0000-000000000001'),
  'private canonical helpers override editable starter and allow tier-zero mage');
SELECT pg_temp.ok_canonical(NOT has_function_privilege('authenticated',
  'app_private.hero_class_key(uuid)','EXECUTE')
  AND NOT has_function_privilege('authenticated',
  'app_private.has_hero_class(uuid)','EXECUTE'),
  'canonical helpers are private');
