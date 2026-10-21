-- Run on isolated PostgreSQL 17 after the v3 migration. One batch of 24
-- 320-event heal/control stalemates approximates the maximum JSON timeline.
\timing on
WITH timelines AS MATERIALIZED (
  SELECT app_private.adventure_simulate_v3(
    '2026-10-21 12:00Z'::timestamptz,20,512,1130,1064,400,150,
    '[{"id":"heal","name":"Cura","power":40,"effect":"light","type":"heal","mp_cost":8,"cooldown":3}]'::jsonb,
    '{}'::jsonb,'physical',0) AS events
  FROM generate_series(1,24)
)
SELECT count(*) AS battles,min(jsonb_array_length(events)) AS min_events,
  max(jsonb_array_length(events)) AS max_events,
  max(octet_length(events::text)) AS max_json_bytes,
  sum(octet_length(events::text)) AS total_json_bytes
FROM timelines;
