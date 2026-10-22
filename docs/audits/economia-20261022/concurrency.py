"""Two autocommit RPC sessions per pair, held behind a third profile lock."""
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

PORT = int(sys.argv[1])
LOGS = Path(sys.argv[2])
PSQL = Path("C:/Program Files/PostgreSQL/17/bin/psql.exe")
BASE = [str(PSQL), "-X", "-h", "127.0.0.1", "-p", str(PORT),
        "-U", "postgres", "-d", "economy_independent_review",
        "-v", "ON_ERROR_STOP=1"]
UID = "11111111-1111-1111-1111-111111111111"


def call(label, sql):
    argv = BASE + ["-c", "SET ROLE authenticated",
                   "-c", f"SET request.jwt.claim.sub='{UID}'",
                   "-c", "SET lock_timeout='10s'", "-c", sql]
    result = subprocess.run(argv, text=True, capture_output=True, timeout=30,
                            encoding="utf-8", errors="replace")
    (LOGS / f"{label}.out").write_text(result.stdout + result.stderr,
                                         encoding="utf-8")
    return {"label": label, "exit": result.returncode,
            "output": result.stdout[-700:], "error": result.stderr[-700:]}


def pair(name, first, second):
    blocker = subprocess.Popen(BASE + ["-c",
        "BEGIN; SELECT 1 FROM public.profiles WHERE user_id='" + UID +
        "' FOR UPDATE; SELECT pg_sleep(1.5); COMMIT;"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        encoding="utf-8", errors="replace")
    time.sleep(0.25)
    with ThreadPoolExecutor(max_workers=2) as executor:
        a = executor.submit(call, name + "_a", first)
        b = executor.submit(call, name + "_b", second)
        results = [a.result(), b.result()]
    blocker_out, blocker_err = blocker.communicate(timeout=30)
    if blocker.returncode != 0:
        raise RuntimeError(f"{name} blocker failed: {blocker_err}")
    if any(item["exit"] != 0 for item in results):
        raise RuntimeError(f"{name} RPC failure: {results}")
    return {"name": name, "results": results,
            "blocker_exit": blocker.returncode,
            "blocker_output": blocker_out[-300:]}


craft = "SELECT public.craft_boss_recipe(md5('craft:recipe:guerreiro:10')::uuid,'00000000-0000-0000-0000-000000000092')"
purchase = "SELECT public.purchase_game_item((SELECT id FROM public.get_economy_shop() WHERE category='weapon' AND level_required=5 LIMIT 1),'00000000-0000-0000-0000-000000000093')"
claim = "SELECT public.claim_adventure_chest('00000000-0000-0000-0000-000000000090')"
sync = "SELECT public.sync_auto_adventure()"

if len(sys.argv) > 3 and sys.argv[3] == "dual_claim":
    other_claim = "SELECT public.claim_adventure_chest('00000000-0000-0000-0000-000000000095')"
    results = [pair("dual_claim", other_claim, other_claim)]
    output_name = "dual_claim_results.json"
else:
    results = [pair("craft_purchase", craft, purchase),
               pair("claim_sync", claim, sync)]
    output_name = "concurrency_results.json"
(LOGS / output_name).write_text(
    json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
print("REVIEW_RPC_RACES_PASS " + ("dual_claim" if output_name.startswith("dual")
                                  else "craft+purchase claim+sync"))
