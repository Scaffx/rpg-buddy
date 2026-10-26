param(
  [int]$Port = 55894,
  [string]$RunDirectory = "$env:LOCALAPPDATA/Temp/rpg-pets-authoritative-$(Get-Date -Format yyyyMMdd-HHmmss)"
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$repo = (Resolve-Path (Join-Path $here '../../..')).Path
$bin = 'C:/Program Files/PostgreSQL/17/bin'
$base = 'pets_source'
$logs = Join-Path $RunDirectory 'logs'
$data = Join-Path $RunDirectory 'data'
$reference = 'C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/economia-implementacao-20261022/verify-final-source-284db26.ps1'
$referenceMigrations = 'C:/Users/Murillo/orca/workspaces/rpg-buddy/rpg-continuo-integracao-20261020/supabase/migrations'
$migration = Join-Path $repo 'supabase/migrations/20261026185325_adventure_pets_authoritative.sql'
$started = $false

function CanonicalHash([string]$path) {
  $body = [IO.File]::ReadAllText($path).Replace("`r`n","`n")
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData(
    [Text.Encoding]::UTF8.GetBytes($body)))
}
function Invoke-Sql([string]$db,[string]$name,[string]$file,[int]$expected=0) {
  $log = Join-Path $logs "$db-$name.log"
  $ErrorActionPreference = 'Continue'
  & "$bin/psql.exe" -X -h 127.0.0.1 -p $Port -U postgres -d $db -v ON_ERROR_STOP=1 -f $file *> $log
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  Write-Output "$db $name exit=$code log=$log"
  if ($code -ne $expected) { throw "$db $name expected=$expected actual=$code" }
}
function Create-Clone([string]$name) {
  & "$bin/createdb.exe" -h 127.0.0.1 -p $Port -U postgres -T $base $name
  if ($LASTEXITCODE -ne 0) { throw "createdb $name exit=$LASTEXITCODE" }
}
function Run-ConcurrentPair([string]$one,[string]$two) {
  $firstFile = Join-Path $here $one
  $secondFile = Join-Path $here $two
  $oneOut = Join-Path $logs "$one.stdout.log"
  $oneErr = Join-Path $logs "$one.stderr.log"
  $twoOut = Join-Path $logs "$two.stdout.log"
  $twoErr = Join-Path $logs "$two.stderr.log"
  $args1 = @('-X','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','pets_positive','-v','ON_ERROR_STOP=1','-f',$firstFile)
  $args2 = @('-X','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d','pets_positive','-v','ON_ERROR_STOP=1','-f',$secondFile)
  $p1 = Start-Process -FilePath "$bin/psql.exe" -ArgumentList $args1 -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $oneOut -RedirectStandardError $oneErr
  Start-Sleep -Milliseconds 200
  $p2 = Start-Process -FilePath "$bin/psql.exe" -ArgumentList $args2 -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $twoOut -RedirectStandardError $twoErr
  $p1.WaitForExit(); $p2.WaitForExit()
  Write-Output "$one exit=$($p1.ExitCode) $two exit=$($p2.ExitCode)"
  if ($p1.ExitCode -ne 0 -or $p2.ExitCode -ne 0) { throw "concurrent pair failed: $one/$two" }
}

if (Test-Path -LiteralPath $RunDirectory) { throw "Existing run directory: $RunDirectory" }
foreach ($name in @(
  '20261022022416_boss_recipes_crafting_salvage.sql',
  '20261022022614_economy_victory_shop.sql',
  '20261022022726_adventure_chests_offline.sql',
  '20261022030906_recipe_class_transition.sql',
  '20261022032246_adventure_encounters_gold_range.sql')) {
  $actual = CanonicalHash (Join-Path $repo "supabase/migrations/$name")
  $referenceHash = CanonicalHash (Join-Path $referenceMigrations $name)
  if ($actual -ne $referenceHash) { throw "REAL_MIGRATION_SOURCE_DRIFT $name" }
}
Write-Output 'CURRENT_REAL_MIGRATIONS_LF_MATCHED count=5'
try {
  & $reference -Port $Port -Database $base -RunDirectory $RunDirectory
  if (-not (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))) { throw 'reference replay missing PG17 data' }
  & "$bin/pg_ctl.exe" -D $data -l (Join-Path $logs 'server-pets.log') -o "-h 127.0.0.1 -p $Port" start -w
  if ($LASTEXITCODE -ne 0) { throw "server start exit=$LASTEXITCODE" }
  $started = $true
  Invoke-Sql $base 'live-identity-fixture' (Join-Path $here 'live_identity_fixture.sql')
  foreach ($name in @('pets_positive','pets_drift_body','pets_drift_trigger',
    'pets_drift_acl','pets_drift_columns','pets_drift_owner')) { Create-Clone $name }
  Invoke-Sql 'pets_positive' 'migration' $migration
  foreach ($name in @('assert','identity_guard','matrix','offline','magic_legacy')) {
    Invoke-Sql 'pets_positive' $name (Join-Path $here "$name.sql")
  }
  Invoke-Sql 'pets_positive' 'concurrency-setup' (Join-Path $here 'concurrency_setup.sql')
  Run-ConcurrentPair 'concurrent_duplicate_a.sql' 'concurrent_duplicate_b.sql'
  Run-ConcurrentPair 'concurrent_switch_a.sql' 'concurrent_switch_b.sql'
  Invoke-Sql 'pets_positive' 'concurrency-assert' (Join-Path $here 'concurrency_assert.sql')
  foreach ($kind in @('body','trigger','acl','columns','owner')) {
    $db = "pets_drift_$kind"
    Invoke-Sql $db "mutate-$kind" (Join-Path $here "drift_$kind.sql")
    Invoke-Sql $db "reject-$kind" $migration 3
    $check = & "$bin/psql.exe" -X -At -h 127.0.0.1 -p $Port -U postgres -d $db `
      -c "select to_regclass('app_private.adventure_pet_rollout') is null"
    if ($LASTEXITCODE -ne 0 -or $check -ne 't') { throw "drift $kind mutated schema" }
  }
  Write-Output "PETS_LOCAL_PASS port=$Port database=pets_positive logs=$logs"
} finally {
  if (Test-Path -LiteralPath (Join-Path $data 'postmaster.pid')) {
    & "$bin/pg_ctl.exe" -D $data stop -m fast -w
    Write-Output "pg_ctl_stop_exit=$LASTEXITCODE"
    & "$bin/pg_isready.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres
    Write-Output "pg_isready_after_stop_exit=$LASTEXITCODE"
    if ($LASTEXITCODE -eq 0) { throw "listener remains on $Port" }
  } elseif ($started) { throw "cluster lost postmaster.pid: $data" }
}
