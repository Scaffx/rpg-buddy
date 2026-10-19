"""Two simultaneous PostgreSQL sessions exercising the retired NPC RPC.

Run after 20261019_fontes_xp_assertions.sql against the loopback PG17 fixture.
"""

import argparse
import subprocess


parser = argparse.ArgumentParser()
parser.add_argument("--psql", required=True)
parser.add_argument("--port", type=int, required=True)
parser.add_argument("--database", required=True)
args = parser.parse_args()

base = [args.psql, "-X", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1",
        "-p", str(args.port), "-U", "postgres", "-d", args.database]
snapshot_query = """
SELECT (SELECT total_xp FROM public.profiles WHERE user_id =
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')::text || ',' ||
       (SELECT xp FROM public.attributes WHERE user_id =
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')::text || ',' ||
       (SELECT gold FROM public.user_balance WHERE user_id =
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')::text || ',' ||
       (SELECT count(*) FROM public.npc_challenge_completions)::text || ',' ||
       (SELECT count(*) FROM public.user_buffs)::text;
"""


def snapshot():
    result = subprocess.run(base + ["-Atc", snapshot_query], check=True,
                            capture_output=True, text=True)
    return result.stdout.strip()


before = snapshot()
query = """
SET ROLE authenticated;
SET request.jwt.claim.sub = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT public.undo_npc_challenge('npc', 'legacy', '2026-10-19');
"""
sessions = [subprocess.Popen(base + ["-c", query], stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True) for _ in range(2)]
for index, session in enumerate(sessions, start=1):
    _, error = session.communicate(timeout=15)
    if session.returncode != 1 or "permission denied for function undo_npc_challenge" not in error:
        raise AssertionError(f"session {index}: exit={session.returncode}, error={error}")
after = snapshot()
if before != after:
    raise AssertionError(f"concurrent calls changed state: {before} -> {after}")
print(f"2 concurrent calls denied; state unchanged: {after}")
