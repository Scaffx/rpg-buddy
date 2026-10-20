param(
  [string]$PgBin = 'C:\Program Files\PostgreSQL\17\bin',
  [int]$Port = 56248,
  [string]$DbHost = '127.0.0.1',
  [string]$DbUser = 'postgres'
)

# Each case gets a new local database. Databases, fixture variants and logs are
# deliberately retained for audit; this script never touches production.
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\..')).Path
$fixture = Join-Path $repo 'src\test\sql\portal_coop_fixture.sql'
$migration = Join-Path $repo 'supabase\migrations\20261020040235_portal_coop_authoritative.sql'
$assert = Join-Path $repo 'src\test\sql\portal_coop_assert.sql'
$psql = Join-Path $PgBin 'psql.exe'
$createdb = Join-Path $PgBin 'createdb.exe'
$runId = [guid]::NewGuid().ToString('N').Substring(0, 8)
$evidence = Join-Path $env:TEMP "portal-coop-guard-$runId"
New-Item -ItemType Directory -Path $evidence -ErrorAction Stop | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
$fixtureText = [System.IO.File]::ReadAllText($fixture).Replace("`r`n", "`n").Replace("`r", "`n")
$lfFixture = Join-Path $evidence 'fixture-lf.sql'
$crlfFixture = Join-Path $evidence 'fixture-crlf.sql'
[System.IO.File]::WriteAllText($lfFixture, $fixtureText, $utf8)
[System.IO.File]::WriteAllText($crlfFixture, $fixtureText.Replace("`n", "`r`n"), $utf8)

$economyNoop = @'
CREATE OR REPLACE FUNCTION public._guard_profiles_economy()
RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN RETURN NEW; END $body$
'@
$insertNoop = @'
CREATE OR REPLACE FUNCTION public._guard_progression_initial_values()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $body$ BEGIN RETURN NEW; END $body$
'@
$wrongBinding = @'
CREATE FUNCTION public.portal_guard_test_noop() RETURNS trigger LANGUAGE plpgsql AS $body$ BEGIN RETURN NEW; END $body$;
DROP TRIGGER guard_profiles_economy ON public.profiles;
CREATE TRIGGER guard_profiles_economy BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.portal_guard_test_noop()
'@
$wrongEvent = @'
DROP TRIGGER guard_profiles_economy ON public.profiles;
CREATE TRIGGER guard_profiles_economy AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public._guard_profiles_economy()
'@
$columnFilter = @'
DROP TRIGGER guard_profiles_economy ON public.profiles;
CREATE TRIGGER guard_profiles_economy BEFORE UPDATE OF display_name ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public._guard_profiles_economy()
'@

$cases = @(
  [pscustomobject]@{ Name='clean_lf'; Fixture=$lfFixture; Sql=''; Pass=$true },
  [pscustomobject]@{ Name='clean_crlf'; Fixture=$crlfFixture; Sql=''; Pass=$true },
  [pscustomobject]@{ Name='always_enabled'; Fixture=$lfFixture; Sql='ALTER TABLE public.profiles ENABLE ALWAYS TRIGGER guard_profiles_economy'; Pass=$true },
  [pscustomobject]@{ Name='economy_noop'; Fixture=$lfFixture; Sql=$economyNoop; Pass=$false },
  [pscustomobject]@{ Name='insert_noop'; Fixture=$lfFixture; Sql=$insertNoop; Pass=$false },
  [pscustomobject]@{ Name='wrong_owner'; Fixture=$lfFixture; Sql='ALTER FUNCTION public._guard_profiles_economy() OWNER TO authenticated'; Pass=$false },
  [pscustomobject]@{ Name='table_owner'; Fixture=$lfFixture; Sql='ALTER TABLE public.profiles OWNER TO authenticated'; Pass=$false },
  [pscustomobject]@{ Name='wrong_binding'; Fixture=$lfFixture; Sql=$wrongBinding; Pass=$false },
  [pscustomobject]@{ Name='disabled'; Fixture=$lfFixture; Sql='ALTER TABLE public.profiles DISABLE TRIGGER guard_profiles_economy'; Pass=$false },
  [pscustomobject]@{ Name='replica'; Fixture=$lfFixture; Sql='ALTER TABLE public.profiles ENABLE REPLICA TRIGGER guard_profiles_economy'; Pass=$false },
  [pscustomobject]@{ Name='wrong_event'; Fixture=$lfFixture; Sql=$wrongEvent; Pass=$false },
  [pscustomobject]@{ Name='column_filter'; Fixture=$lfFixture; Sql=$columnFilter; Pass=$false },
  [pscustomobject]@{ Name='economy_acl'; Fixture=$lfFixture; Sql='REVOKE EXECUTE ON FUNCTION public._guard_profiles_economy() FROM PUBLIC'; Pass=$false },
  [pscustomobject]@{ Name='insert_acl'; Fixture=$lfFixture; Sql='GRANT EXECUTE ON FUNCTION public._guard_progression_initial_values() TO authenticated'; Pass=$false },
  [pscustomobject]@{ Name='search_path'; Fixture=$lfFixture; Sql="ALTER FUNCTION public._guard_progression_initial_values() SET search_path TO pg_temp,public"; Pass=$false },
  [pscustomobject]@{ Name='setrole_escape'; Fixture=$lfFixture; Sql='GRANT service_role TO authenticated'; Pass=$false },
  [pscustomobject]@{ Name='replication_guc'; Fixture=$lfFixture; Sql='GRANT SET ON PARAMETER session_replication_role TO authenticated'; Pass=$false }
)

$failures = New-Object System.Collections.Generic.List[string]
foreach ($case in $cases) {
  $database = "portal_guard_${runId}_$($case.Name)"
  & $createdb -h $DbHost -p $Port -U $DbUser $database
  if ($LASTEXITCODE -ne 0) { throw "createdb failed: $database" }
  $fixtureOutput = & $psql -X -h $DbHost -p $Port -U $DbUser -d $database -v ON_ERROR_STOP=1 -f $case.Fixture 2>&1
  [System.IO.File]::WriteAllText((Join-Path $evidence "$($case.Name)-fixture.log"), [string]::Join("`n", $fixtureOutput), $utf8)
  if ($LASTEXITCODE -ne 0) { throw "fixture failed: $database" }
  if ($case.Sql) {
    $mutationOutput = & $psql -X -h $DbHost -p $Port -U $DbUser -d $database -v ON_ERROR_STOP=1 -c $case.Sql 2>&1
    [System.IO.File]::WriteAllText((Join-Path $evidence "$($case.Name)-mutation.log"), [string]::Join("`n", $mutationOutput), $utf8)
    if ($LASTEXITCODE -ne 0) { throw "mutation setup failed: $database" }
  }
  try {
    $migrationOutput = & $psql -X -h $DbHost -p $Port -U $DbUser -d $database -v ON_ERROR_STOP=1 -f $migration 2>&1
    $migrationExit = $LASTEXITCODE
  } finally {
    if ($case.Name -eq 'setrole_escape') {
      & $psql -X -h $DbHost -p $Port -U $DbUser -d $database -v ON_ERROR_STOP=1 -c 'REVOKE service_role FROM authenticated' | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'SET ROLE test membership not restored' }
    }
    if ($case.Name -eq 'replication_guc') {
      & $psql -X -h $DbHost -p $Port -U $DbUser -d $database -v ON_ERROR_STOP=1 -c 'REVOKE SET ON PARAMETER session_replication_role FROM authenticated' | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'Replication parameter ACL not restored' }
    }
  }
  $migrationText = [string]::Join("`n", $migrationOutput)
  [System.IO.File]::WriteAllText((Join-Path $evidence "$($case.Name)-migration.log"), $migrationText, $utf8)
  $sentinel = (& $psql -X -h $DbHost -p $Port -U $DbUser -d $database -tAc "SELECT to_regclass('public.portal_coop_config') IS NOT NULL").Trim()
  if ($LASTEXITCODE -ne 0) { throw "sentinel query failed: $database" }
  $passed = if ($case.Pass) {
    $migrationExit -eq 0 -and $sentinel -eq 't'
  } else {
    $migrationExit -ne 0 -and $sentinel -eq 'f' -and $migrationText.Contains('Profile guard')
  }
  if ($passed -and $case.Pass) {
    $assertOutput = & $psql -X -h $DbHost -p $Port -U $DbUser -d $database -v ON_ERROR_STOP=1 -f $assert 2>&1
    [System.IO.File]::WriteAllText((Join-Path $evidence "$($case.Name)-assert.log"), [string]::Join("`n", $assertOutput), $utf8)
    $passed = $LASTEXITCODE -eq 0
  }
  Write-Output "$($case.Name): pass=$passed migration_exit=$migrationExit sentinel=$sentinel db=$database"
  if (-not $passed) { $failures.Add($case.Name) }
}
Write-Output "EVIDENCE=$evidence"
Write-Output "RESULT=$($cases.Count - $failures.Count)/$($cases.Count)"
if ($failures.Count -gt 0) { throw "Guard drift regression failed: $($failures -join ', ')" }
