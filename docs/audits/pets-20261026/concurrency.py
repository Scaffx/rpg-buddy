"""Two-session local SQL contention probe; no remote connections or dependencies."""

import argparse
import subprocess
import time
from pathlib import Path


PSQL = Path("C:/Program Files/PostgreSQL/17/bin/psql.exe")
HERE = Path(__file__).resolve().parent


def command(port: int, database: str, sql_file: Path):
    return [str(PSQL), "-X", "-h", "127.0.0.1", "-p", str(port), "-U", "postgres",
            "-d", database, "-v", "ON_ERROR_STOP=1", "-f", str(sql_file)]


def run_one(port: int, database: str, name: str, logs: Path):
    result = subprocess.run(command(port, database, HERE / name),
                            capture_output=True, text=True, encoding="utf-8", timeout=40)
    (logs / f"{name}.stdout.log").write_text(result.stdout, encoding="utf-8")
    (logs / f"{name}.stderr.log").write_text(result.stderr, encoding="utf-8")
    print(f"{name} exit={result.returncode}")
    if result.returncode:
        raise RuntimeError(f"{name} failed; see logs")


def run_pair(port: int, database: str, names: tuple[str, str], logs: Path):
    handles = []
    try:
        for index, name in enumerate(names):
            label = f"{index + 1}-{name}"
            stdout = (logs / f"{label}.stdout.log").open("w", encoding="utf-8")
            stderr = (logs / f"{label}.stderr.log").open("w", encoding="utf-8")
            process = subprocess.Popen(command(port, database, HERE / name), stdout=stdout,
                                       stderr=stderr, text=True)
            handles.append((name, process, stdout, stderr))
            if index == 0:
                time.sleep(0.25)
        for name, process, _, _ in handles:
            code = process.wait(timeout=40)
            print(f"{name} exit={code}")
            if code:
                raise RuntimeError(f"{name} failed; see logs")
    finally:
        for _, process, stdout, stderr in handles:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            stdout.close()
            stderr.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--database", required=True)
    parser.add_argument("--logs", required=True, type=Path)
    args = parser.parse_args()
    args.logs.mkdir(parents=True, exist_ok=True)
    run_one(args.port, args.database, "concurrency_setup.sql", args.logs)
    run_pair(args.port, args.database,
             ("concurrent_select_a.sql", "concurrent_select_b.sql"), args.logs)
    time.sleep(2)
    run_one(args.port, args.database, "concurrency_force_finish.sql", args.logs)
    run_pair(args.port, args.database,
             ("concurrent_settle.sql", "concurrent_settle.sql"), args.logs)
    run_one(args.port, args.database, "concurrency_verify.sql", args.logs)
    print("INDEPENDENT_TWO_SESSION_CONCURRENCY_PASS")


if __name__ == "__main__":
    main()
