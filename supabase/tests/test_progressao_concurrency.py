"""Two real PostgreSQL sessions for completion and undo, on local port only."""

import argparse
import json
import os
import subprocess
import time
import uuid


parser = argparse.ArgumentParser()
parser.add_argument("--psql", default=r"C:\Program Files\PostgreSQL\17\bin\psql.exe")
parser.add_argument("--port", type=int, default=55441)
parser.add_argument("--database", default="postgres")
args = parser.parse_args()
if args.port == 5432:
    raise SystemExit("Refusing default PostgreSQL port")

base = [args.psql, "-h", "127.0.0.1", "-p", str(args.port), "-U", "postgres",
        "-d", args.database, "-v", "ON_ERROR_STOP=1", "-At"]
env = dict(os.environ, PGCLIENTENCODING="UTF8")


def sql(query: str) -> str:
    run = subprocess.run(base + ["-c", query], capture_output=True, text=True, env=env)
    if run.returncode:
        raise AssertionError(f"psql exit {run.returncode}: {run.stderr}")
    return run.stdout.strip()


for mode in ("daily", "weekly", "unique"):
    uid, mid = str(uuid.uuid4()), str(uuid.uuid4())
    days = "'[\"scheduled\"]'::jsonb" if mode == "daily" else "'[]'::jsonb"
    frequency = "weekly" if mode == "weekly" else "daily"
    sql(f"INSERT INTO auth.users(id,email) VALUES ('{uid}','concurrency-{uid}@example.invalid');"
        f"INSERT INTO public.missions(id,user_id,title,attribute_id,xp_reward,priority,frequency_type,days_of_week,target_count,max_count) "
        f"SELECT '{mid}','{uid}','Concurrency',id,20,'media','{frequency}',{days},"
        f"{6 if mode == 'weekly' else 'NULL'},{6 if mode == 'weekly' else 'NULL'} "
        f"FROM public.attributes WHERE user_id='{uid}' AND name='Disciplina';")

    def race(op: str):
        call = f"public.{op}('{mid}'::uuid, (now() AT TIME ZONE 'America/Sao_Paulo')::date)"
        prefix = f"BEGIN; SET LOCAL request.jwt.claim.sub='{uid}'; SELECT {call};"
        first = subprocess.Popen(base + ["-c", prefix + " SELECT pg_sleep(2); COMMIT;"],
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 text=True, env=env)
        time.sleep(0.4)
        second = subprocess.Popen(base + ["-c", prefix + " COMMIT;"],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  text=True, env=env)
        out1, err1 = first.communicate(timeout=30)
        out2, err2 = second.communicate(timeout=30)
        return (first.returncode, out1, err1), (second.returncode, out2, err2)

    for op in ("complete_mission", "undo_mission"):
        one, two = race(op)
        if one[0] != 0 or two[0] == 0:
            raise AssertionError(f"{mode} {op}: exits {one[0]}/{two[0]}; {one[2]} {two[2]}")
        if op == "complete_mission" and not (
            "ALREADY_COMPLETED_TODAY" in two[2] or "conclu" in two[2]
        ):
            raise AssertionError(f"{mode} {op}: unexpected second error {two[2]}")
        if op == "undo_mission" and "conclu" not in two[2]:
            raise AssertionError(f"{mode} {op}: unexpected second error {two[2]}")
        expected_xp = 20 if op == "complete_mission" else 0
        result = sql(f"SELECT total_xp || ',' || missions_completed FROM public.profiles WHERE user_id='{uid}';")
        if result != f"{expected_xp},{1 if expected_xp else 0}":
            raise AssertionError(f"{mode} {op}: profile={result}")
        ledger = sql(f"SELECT count(*) FROM public.mission_daily_completions WHERE mission_id='{mid}';")
        if ledger != ("1" if expected_xp else "0"):
            raise AssertionError(f"{mode} {op}: ledger={ledger}")
        print(json.dumps({"mode": mode, "op": op, "first_exit": one[0],
                          "second_exit": two[0], "profile": result, "ledger": ledger,
                          "second_error": two[2].strip()[-180:]}, ensure_ascii=False))
