\set ON_ERROR_STOP on
BEGIN;
DO $assert$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_private.adventure_battles b
    JOIN app_private.mage_inflight_marker m ON m.id=b.id
    WHERE b.user_id='a0000000-0000-0000-0000-00000000a811'
      AND b.engine_version='v4_horde' AND b.status='fighting'
      AND md5(b.events::text)=m.events_md5
      AND md5(b.rules_snapshot::text)=m.rules_md5
      AND md5(b.skills::text)=m.skills_md5
      AND NOT (b.events->2 ? 'hits'))
  THEN RAISE EXCEPTION 'MAGE_INFLIGHT_MUTATED'; END IF;
  RAISE NOTICE 'MAGE_INFLIGHT_AFTER_PASS';
END $assert$;
ROLLBACK;
