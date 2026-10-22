param(
  [int]$Port = 55784,
  [string]$Database = 'economy_composed_20261022',
  [string]$RunDirectory = "$env:LOCALAPPDATA/Temp/rpg-economy-composed-20261022",
  [switch]$ResumeStartedCluster
)
$ErrorActionPreference = 'Stop'
$bin = 'C:/Program Files/PostgreSQL/17/bin'
$data = Join-Path $RunDirectory 'data'
$logs = Join-Path $RunDirectory 'logs'
$here = $PSScriptRoot
New-Item -ItemType Directory -Force -Path $RunDirectory,$logs | Out-Null

if (-not $ResumeStartedCluster) {
  & "$bin/pg_isready.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres *> $null
  if ($LASTEXITCODE -eq 0) { throw "Port $Port already has a PostgreSQL listener" }
  if (Test-Path -LiteralPath $data) { throw "Existing data directory: $data; choose a new RunDirectory" }
  & "$bin/initdb.exe" -D $data -U postgres --encoding=UTF8 --locale=C --auth=trust *> (Join-Path $logs 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw "initdb exit=$LASTEXITCODE" }
  & "$bin/pg_ctl.exe" -D $data -l (Join-Path $logs 'server.log') -o "-h 127.0.0.1 -p $Port" start -w
  if ($LASTEXITCODE -ne 0) { throw "start exit=$LASTEXITCODE" }
} else {
  & "$bin/pg_isready.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres
  if ($LASTEXITCODE -ne 0) { throw "No local cluster on $Port" }
}
& "$bin/createdb.exe" -h 127.0.0.1 -p $Port -U postgres $Database *> (Join-Path $logs 'createdb.log')
if ($LASTEXITCODE -ne 0) { throw "createdb exit=$LASTEXITCODE" }

$files = @(
  'auto_adventure_fixture.sql',
  '20261019194052_auto_adventure.sql',
  'boss_auto_fixture.sql',
  '20261019205224_boss_auto_entitlements.sql',
  '20261019211310_auto_adventure_reachable_catalog.sql',
  'continuous_adventure_fixture.sql',
  '20261020040128_continuous_adventure_battle_engine.sql',
  'adventure_skill_motor_fixture.sql',
  'adventure_skill_motor_legacy_setup.sql',
  '20261021142812_continuous_adventure_skill_stats_engine.sql',
  '20261021222452_five_realm_adventure_cycle.sql',
  '20261022013316_adventure_catchup_retreat.sql'
)
foreach ($name in $files) {
  $file = Join-Path $here "replay/$name"
  & "$bin/psql.exe" -X -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $file *> (Join-Path $logs "$name.log")
  Write-Output "$name exit=$LASTEXITCODE"
  if ($LASTEXITCODE -ne 0) { throw "Replay stopped at $name" }
}
& "$bin/psql.exe" -X -At -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -c "SELECT md5(pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure))"
if ($LASTEXITCODE -ne 0) { throw "sync hash read exit=$LASTEXITCODE" }
Write-Output "BASE_REPLAY_COMPLETE port=$Port database=$Database logs=$logs"
