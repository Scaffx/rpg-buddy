-- Run after adventure_skill_motor_state_assert.sql in the same isolated DB.
CREATE FUNCTION pg_temp.ok_draw(v boolean,m text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion: %',m; END IF; END $$;
CREATE FUNCTION pg_temp.forward_ready_draw(u uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_delta interval;
BEGIN
  SELECT clock_timestamp()-interval '2 seconds'-b.ends_at INTO STRICT v_delta
  FROM app_private.adventure_battles b WHERE b.id=(SELECT current_battle_id
    FROM public.adventure_state WHERE user_id=u);
  UPDATE app_private.adventure_battles b
    SET started_at=b.started_at+v_delta,ends_at=b.ends_at+v_delta,
        events=(SELECT jsonb_agg(jsonb_set(e,'{at}',
          to_jsonb((e->>'at')::timestamptz+v_delta)) ORDER BY ord)
          FROM jsonb_array_elements(b.events) WITH ORDINALITY x(e,ord))
  WHERE b.id=(SELECT current_battle_id FROM public.adventure_state WHERE user_id=u);
END $$;

-- The first boss must finish even when it needed more than eight hero turns.
INSERT INTO auth.users(id) VALUES('abababab-0000-0000-0000-000000000001');
INSERT INTO public.profiles(user_id,level,starter_class)
VALUES('abababab-0000-0000-0000-000000000001',10,'guerreiro');
INSERT INTO public.game_items(id,category,rarity,is_consumable,effect,level_required,
  atk_bonus,matk_bonus,def_bonus,hp_bonus,mp_bonus)
VALUES('abababab-0000-0000-0000-000000000002','armor','comum',false,NULL,1,
  0,0,20,100,0);
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped,sintonizado)
VALUES('abababab-0000-0000-0000-000000000001',
       'abababab-0000-0000-0000-000000000002',1,true,false);
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at)
VALUES('abababab-0000-0000-0000-000000000001',10,0,clock_timestamp());
SET ROLE authenticated;
SET request.jwt.claim.sub='abababab-0000-0000-0000-000000000001';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok_draw((SELECT jsonb_array_length(events)>16
  AND (events->-1->>'hero_hp')::integer>0
  AND (events->-1->>'enemy_hp')::integer=0
  FROM app_private.adventure_battles WHERE user_id='abababab-0000-0000-0000-000000000001'),
  'first boss continues past eight turns and dies to real damage');
SELECT pg_temp.forward_ready_draw('abababab-0000-0000-0000-000000000001');
SET ROLE authenticated;
SET request.jwt.claim.sub='abababab-0000-0000-0000-000000000001';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok_draw((SELECT stage=11 AND adventure_mode='progressing'
  AND last_result->>'status'='won'
  FROM public.adventure_state WHERE user_id='abababab-0000-0000-0000-000000000001'),
  'first boss awards real win and advances');
SELECT pg_temp.ok_draw((SELECT status='won' AND gold_awarded=12
  FROM app_private.adventure_battles WHERE user_id='abababab-0000-0000-0000-000000000001'
  AND status<>'fighting'), 'boss win stored with 12 gold');
SELECT pg_temp.ok_draw((SELECT count(*)=1 FROM public.boss_battles
  WHERE user_id='abababab-0000-0000-0000-000000000001' AND won),
  'boss win grants one entitlement');
SELECT pg_temp.ok_draw((SELECT current_battle_id IS NOT NULL AND stage=11
  FROM public.adventure_state WHERE user_id='abababab-0000-0000-0000-000000000001'),
  'boss win starts next stage');

-- An exceptionally defensive healer may still reach the 320-event guard.
INSERT INTO auth.users(id) VALUES('abababab-0000-0000-0000-000000000003');
INSERT INTO public.profiles(user_id,level,starter_class,combat_skill_loadout)
VALUES('abababab-0000-0000-0000-000000000003',1,'guerreiro',
  '[{"id":"aprendiz-cura"}]'::jsonb);
INSERT INTO public.player_skill_nodes(user_id,node_id,rank)
VALUES('abababab-0000-0000-0000-000000000003','aprendiz-cura',1);
INSERT INTO public.game_items(id,category,rarity,is_consumable,effect,level_required,
  atk_bonus,matk_bonus,def_bonus,hp_bonus,mp_bonus)
VALUES('abababab-0000-0000-0000-000000000004','armor','comum',false,NULL,1,
  0,0,500,1000,1000);
INSERT INTO public.user_inventory(user_id,item_id,quantity,equipped,sintonizado)
VALUES('abababab-0000-0000-0000-000000000003',
       'abababab-0000-0000-0000-000000000004',1,true,false);
INSERT INTO public.adventure_state(user_id,stage,attempt,last_tick_at)
VALUES('abababab-0000-0000-0000-000000000003',250,0,clock_timestamp());
SET ROLE authenticated;
SET request.jwt.claim.sub='abababab-0000-0000-0000-000000000003';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok_draw((SELECT jsonb_array_length(events)=320
  AND (events->-1->>'hero_hp')::integer>0
  AND (events->-1->>'enemy_hp')::integer>0
  FROM app_private.adventure_battles WHERE user_id='abababab-0000-0000-0000-000000000003'),
  'healer and boss remain alive at guard bound');
SELECT pg_temp.forward_ready_draw('abababab-0000-0000-0000-000000000003');
SET ROLE authenticated;
SET request.jwt.claim.sub='abababab-0000-0000-0000-000000000003';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok_draw((SELECT stage=250 AND adventure_mode='progressing'
  AND last_result->>'status'='draw' AND last_result->>'end_reason'='turn_limit'
  FROM public.adventure_state WHERE user_id='abababab-0000-0000-0000-000000000003'),
  'turn limit draws without false retreat');
SELECT pg_temp.ok_draw((SELECT count(*)=0 FROM public.gold_history
  WHERE user_id='abababab-0000-0000-0000-000000000003' AND type='adventure'),
  'draw pays no gold');
SELECT pg_temp.ok_draw((SELECT count(*)=0 FROM public.boss_battles
  WHERE user_id='abababab-0000-0000-0000-000000000003' AND won),
  'draw grants no boss entitlement');

-- A real death while already holding must not cascade into another retreat.
SELECT pg_temp.forward_ready_draw('11111111-1111-1111-1111-111111111111');
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT public.sync_auto_adventure();
RESET ROLE;
SELECT pg_temp.ok_draw((SELECT stage=249 AND adventure_mode='holding'
  FROM public.adventure_state WHERE user_id='11111111-1111-1111-1111-111111111111'),
  'repeated death stays at holding stage');
