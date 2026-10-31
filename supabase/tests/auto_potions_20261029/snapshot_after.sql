\set ON_ERROR_STOP on
DO $test$
BEGIN
  IF (SELECT count(*) FROM app_private.auto_potions_snapshot_marker)<>2 OR
    EXISTS (SELECT 1 FROM app_private.auto_potions_snapshot_marker m
      JOIN app_private.adventure_battles b ON b.id=m.id
      WHERE b.engine_version IS DISTINCT FROM m.engine_version
        OR md5(b.events::text)<>m.events_md5
        OR md5(b.rules_snapshot::text)<>m.rules_md5
        OR md5(b.skills::text)<>m.skills_md5) OR
    (SELECT count(*) FROM app_private.adventure_battles b
      JOIN app_private.auto_potions_snapshot_marker m ON m.id=b.id)<>2 OR
    EXISTS (SELECT 1 FROM app_private.adventure_auto_potion_receipts r
      JOIN app_private.auto_potions_snapshot_marker m ON m.id=r.battle_id) THEN
    RAISE EXCEPTION 'AUTO_POTION_OLD_SNAPSHOT_MUTATED'; END IF;
  RAISE NOTICE 'AUTO_POTIONS_V3_V4_SNAPSHOT_IMMUTABLE_PASS';
END $test$;
