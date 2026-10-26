"""Read-only PostgreSQL metadata probe for the frozen pet migration review.

Usage: py probe_catalog.py --port 55797 --database pets_review --output catalog.json
The optional --compare-live-snapshot compares the eight functions captured in
live-sources.json. All connections go to 127.0.0.1 and run SELECT only.
"""

import argparse
import json
import subprocess
from pathlib import Path


LIVE = Path(
    "C:/Users/Murillo/Documents/Codex/2026-10-15/"
    "seguinte-dentro-do-sistema-de-rpg/work/pets-combate-20261026/live-sources.json"
)
PSQL = Path("C:/Program Files/PostgreSQL/17/bin/psql.exe")


def literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def query(port: int, database: str, sql: str):
    result = subprocess.run(
        [str(PSQL), "-X", "-A", "-t", "-h", "127.0.0.1", "-p", str(port),
         "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-c", sql],
        capture_output=True, text=True, encoding="utf-8", check=False,
    )
    if result.returncode:
        raise RuntimeError(f"psql exit={result.returncode}: {result.stderr}")
    return json.loads(result.stdout.strip())


def normalize_definition(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--database", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--compare-live-snapshot", action="store_true")
    args = parser.parse_args()
    source = json.loads(LIVE.read_text(encoding="utf-8"))[0]["jsonb_build_object"]
    signatures = [
        (s["signature"] if "." in s["signature"] else "public." + s["signature"])
        for s in source["functions"]
    ]
    signatures += [
        "app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer)",
        "app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer,jsonb)",
        "app_private.adventure_battle_payload(app_private.adventure_battles,timestamptz)",
        "app_private.adventure_pet_catalog(text)",
        "app_private.adventure_pet_sustain(text)",
        "app_private.adventure_pet_at(uuid,timestamptz)",
        "public.get_adventure_pet_state()",
        "public.set_active_adventure_pet(uuid)",
    ]
    values = ",".join(f"({literal(sig)})" for sig in signatures)
    sql = f"""
    WITH requested(signature) AS (VALUES {values}),
    function_rows AS (
      SELECT r.signature, p.oid, n.nspname AS schema_name, p.proname,
             pg_get_userbyid(p.proowner) AS owner,
             p.prosecdef AS security_definer, p.proconfig AS config,
             pg_get_functiondef(p.oid) AS definition,
             ARRAY(SELECT x::text FROM unnest(coalesce(p.proacl,
               acldefault('f',p.proowner))) AS x ORDER BY x::text) AS acl,
             CASE WHEN p.oid IS NULL THEN NULL
                  ELSE has_function_privilege('anon',p.oid,'EXECUTE') END AS anon_execute,
             CASE WHEN p.oid IS NULL THEN NULL
                  ELSE has_function_privilege('authenticated',p.oid,'EXECUTE') END AS auth_execute
      FROM requested r
      LEFT JOIN pg_proc p ON p.oid=to_regprocedure(r.signature)
      LEFT JOIN pg_namespace n ON n.oid=p.pronamespace
    ),
    column_rows AS (
      SELECT a.attname, format_type(a.atttypid,a.atttypmod) AS type,
             a.attnotnull AS not_null, pg_get_expr(d.adbin,d.adrelid) AS default_expr,
             a.attacl::text AS acl,
             has_column_privilege('anon','public.companions',a.attname,'INSERT') AS anon_insert,
             has_column_privilege('authenticated','public.companions',a.attname,'INSERT') AS auth_insert,
             has_column_privilege('authenticated','public.companions',a.attname,'UPDATE') AS auth_update
      FROM pg_attribute a LEFT JOIN pg_attrdef d
        ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=to_regclass('public.companions') AND a.attnum>0 AND NOT a.attisdropped
    ),
    trigger_rows AS (
      SELECT t.tgname, t.tgenabled, t.tgfoid::regprocedure::text AS function,
             pg_get_triggerdef(t.oid,true) AS definition
      FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.companions') AND NOT t.tgisinternal
    ),
    overload_rows AS (
      SELECT n.nspname AS schema_name,p.proname,
             count(*) AS count,
             array_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text) AS signatures
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE (n.nspname,p.proname) IN (
        ('public','sync_auto_adventure'),('public','advance_auto_adventure'),
        ('app_private','sync_auto_adventure'),('app_private','advance_auto_adventure'),
        ('public','get_adventure_pet_state'),('public','set_active_adventure_pet'),
        ('public','buy_pet'),('public','choose_level3_companion'),
        ('public','_record_inventory_forage_pet'),('public','_guard_inventory_forage_pet'))
      GROUP BY n.nspname,p.proname
    )
    SELECT jsonb_build_object(
      'functions',(SELECT jsonb_agg(to_jsonb(f) - 'oid' ORDER BY signature) FROM function_rows f),
      'columns',(SELECT jsonb_agg(to_jsonb(c) ORDER BY attname) FROM column_rows c),
      'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY tgname) FROM trigger_rows t),
      'overloads',(SELECT jsonb_agg(to_jsonb(o) ORDER BY schema_name,proname) FROM overload_rows o),
      'companions_table',(
        SELECT jsonb_build_object('rls',relrowsecurity,'force_rls',relforcerowsecurity,
          'anon_insert',has_table_privilege('anon',oid,'INSERT'),
          'auth_insert',has_table_privilege('authenticated',oid,'INSERT'))
        FROM pg_class WHERE oid=to_regclass('public.companions'))
    )::text;
    """
    catalog = query(args.port, args.database, sql)
    mismatches = []
    if args.compare_live_snapshot:
        actual_by_sig = {row["signature"]: row for row in catalog["functions"]}
        for expected, signature in zip(source["functions"], signatures):
            actual = actual_by_sig[signature]
            if actual["definition"] is None:
                mismatches.append(f"missing function {signature}")
                continue
            for key in ("owner", "config", "acl"):
                left, right = expected.get(key), actual[key]
                if key == "acl":
                    left, right = sorted(left or []), sorted(right or [])
                if left != right:
                    mismatches.append(f"{signature}: {key} differs")
            if normalize_definition(expected["definition"]) != normalize_definition(actual["definition"]):
                mismatches.append(f"{signature}: full definition differs")
        if catalog["companions_table"]["auth_insert"] or catalog["companions_table"]["anon_insert"]:
            mismatches.append("companions table INSERT has drifted")
        if any(row["auth_insert"] or row["anon_insert"] for row in catalog["columns"]):
            mismatches.append("companions column INSERT has drifted")
    catalog["live_snapshot_mismatches"] = mismatches
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"CATALOG_PROBE output={args.output} mismatches={len(mismatches)}")
    for mismatch in mismatches:
        print(f"DRIFT {mismatch}")
    if mismatches:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
