"""Compare before/after PG17 catalogs for contracts the pet migration preserves."""

import argparse
import json
from pathlib import Path


def by_signature(rows):
    return {row["signature"]: row for row in rows}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--before", required=True, type=Path)
    parser.add_argument("--after", required=True, type=Path)
    args = parser.parse_args()
    before = json.loads(args.before.read_text(encoding="utf-8"))
    after = json.loads(args.after.read_text(encoding="utf-8"))
    failures = []
    for field in ("columns", "triggers", "companions_table"):
        if before[field] != after[field]:
            failures.append(f"{field} changed")
    old = by_signature(before["functions"])
    new = by_signature(after["functions"])
    preserved = (
        "app_private.advance_auto_adventure(uuid)",
        "app_private.adventure_simulate_v3(timestamptz,integer,integer,integer,integer,integer,integer,jsonb,jsonb,text,integer)",
        "public.buy_pet(text)",
        "public.choose_level3_companion(text,text)",
    )
    for signature in preserved:
        if old[signature] != new[signature]:
            failures.append(f"preserved function changed: {signature}")
    for signature in (
        "public._guard_inventory_forage_pet()",
        "public._record_inventory_forage_pet()",
    ):
        for field in ("definition", "owner", "config", "security_definer"):
            if old[signature][field] != new[signature][field]:
                failures.append(f"trigger helper {field} changed: {signature}")
        if new[signature]["anon_execute"] or new[signature]["auth_execute"]:
            failures.append(f"trigger helper retains client EXECUTE: {signature}")
    if failures:
        for failure in failures:
            print(f"CATALOG_REGRESSION {failure}")
        raise SystemExit(1)
    print("PRESERVED_FUNCTIONS_COLUMNS_TRIGGERS_PASS")


if __name__ == "__main__":
    main()
