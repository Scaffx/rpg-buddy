-- Read-only model using the exact v3 PostgreSQL simulator and new gold formula.
-- Attributes are routine-earned scenario assumptions (1 + floor(level/5));
-- gear bonuses represent none or a suitable shop kit, not production telemetry.
WITH personas(class_key,hero_level,stage,gear_attack,gear_defense,gear_hp,skill_power) AS (
  VALUES
    ('guerreiro',1,1,0,0,0,0),('mago',1,1,0,0,0,0),
    ('gatuno',1,1,0,0,0,0),('clerico',1,1,0,0,0,0),
    ('guerreiro',5,5,0,0,0,0),('guerreiro',5,5,12,11,12,0),
    ('mago',5,5,0,0,0,0),('mago',5,5,12,5,0,40),
    ('gatuno',5,5,12,11,12,40),('clerico',5,5,12,5,0,40),
    ('guerreiro',10,10,0,0,0,0),('guerreiro',10,10,12,11,12,40),
    ('mago',10,10,12,5,0,40),('gatuno',10,10,12,11,12,40),
    ('clerico',10,10,12,5,0,40),
    ('guerreiro',20,20,0,0,0,0),('guerreiro',20,20,24,19,25,40),
    ('mago',20,20,24,10,0,40),('gatuno',20,20,24,19,25,40),
    ('clerico',20,20,24,10,0,40),
    ('guerreiro',40,40,0,0,0,0),('guerreiro',40,40,43,32,50,40),
    ('mago',40,40,43,17,0,40),('gatuno',40,40,43,32,50,40),
    ('clerico',40,40,43,17,0,40),
    ('guerreiro',40,1,43,32,50,40),('mago',40,1,43,17,0,40),
    ('guerreiro',100,200,43,32,50,40),('mago',100,200,43,17,0,40),
    ('guerreiro',200,200,43,32,50,40),('mago',200,200,43,17,0,40),
    ('guerreiro',165,330,43,32,50,40),('mago',165,330,43,17,0,40),
    ('guerreiro',330,330,43,32,50,40),('mago',330,330,43,17,0,40)
), stats AS (
  SELECT p.*,1+p.hero_level/5 AS attr,
    round(14+p.hero_level*2+0.45*(CASE
      WHEN class_key IN ('gatuno') THEN 6*(1+p.hero_level/5)+2*(1+p.hero_level/5)
      WHEN class_key IN ('mago','clerico') THEN 4*(1+p.hero_level/5)+2*(1+p.hero_level/5)
      ELSE 6*(1+p.hero_level/5)+2*(1+p.hero_level/5) END))::integer
      +gear_attack AS attack,
    round(8+p.hero_level*1.4+0.35*(5*(1+p.hero_level/5)+3*(1+p.hero_level/5)))::integer
      +gear_defense AS defense,
    round(100+p.hero_level*12+0.8*(8*(1+p.hero_level/5)+14*(1+p.hero_level/5)))::integer
      +gear_hp AS hp,
    40+p.hero_level*8+16*(1+p.hero_level/5) AS mp,
    CASE WHEN stage%10=0 THEN least(400,30+floor(1.5*stage)::integer)
         ELSE least(380,20+floor(1.5*stage)::integer) END AS enemy_power,
    CASE WHEN stage%10=0 THEN 150 ELSE 100 END AS enemy_hp
  FROM personas p
), simulated AS (
  SELECT s.*,app_private.adventure_simulate_v3(
    now(),attack,defense,hp,mp,enemy_power,enemy_hp,
    CASE WHEN skill_power=0 THEN '[]'::jsonb ELSE jsonb_build_array(
      jsonb_build_object('id','fixture-strike','name','Golpe','type','dano',
        'power',skill_power,'mp_cost',0,'cooldown',2,'effect','physical')) END,
    '{}'::jsonb,'physical',0) AS events
  FROM stats s
), outcomes AS (
  SELECT *,jsonb_array_length(events) AS event_count,
    extract(epoch FROM ((events->-1->>'at')::timestamptz-now())) AS duration_s,
    (events->-1->>'enemy_hp')::integer=0 AS won,
    (events->-1->>'hero_hp')::integer=0 AS defeated
  FROM simulated
), rewarded AS (
  SELECT *,CASE WHEN won THEN greatest(1,least(48,floor(
    (12+least(stage,50)::numeric/25
       + CASE WHEN stage%10=0 THEN 2 ELSE 0 END)
    * sqrt(greatest(duration_s,0.1)/20)
    * least(1.1,greatest(0.1,stage::numeric/greatest(hero_level,1)))
  )::integer)) ELSE 0 END AS gold_per_battle,
    duration_s+1 AS cycle_s
  FROM outcomes
)
SELECT class_key,hero_level,stage,gear_attack,skill_power,
       CASE WHEN won THEN 'won' WHEN defeated THEN 'defeated' ELSE 'draw' END AS outcome,
       event_count,round(duration_s,1) AS duration_s,gold_per_battle,
       round(cycle_s,1) AS cycle_s,
       round(gold_per_battle*3600/cycle_s) AS gold_hour,
       floor(86400/cycle_s)::integer AS offline_wins_24h,
       round(gold_per_battle*86400/cycle_s) AS gross_day,
       greatest(0,round(gold_per_battle*86400/cycle_s)-2500) AS net_day_one_upgrade,
       greatest(0,round(gold_per_battle*86400/cycle_s)+1920-2500) AS net_day_if_48_common_chests,
       CASE WHEN gold_per_battle=0 OR gold_per_battle*86400/cycle_s<=2500 THEN NULL
         ELSE round(600000/(gold_per_battle*86400/cycle_s-2500),1) END AS first_pet_days,
       CASE WHEN gold_per_battle=0 OR gold_per_battle*86400/cycle_s<=2500 THEN NULL
         ELSE round(4000000/(gold_per_battle*86400/cycle_s-2500),1) END AS legendary_days
FROM rewarded ORDER BY hero_level,stage,class_key,gear_attack,skill_power;
