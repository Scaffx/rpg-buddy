param(
  [int]$Port = 55786,
  [string]$Database = 'economy_composed_verified',
  [string]$RunDirectory = "$env:LOCALAPPDATA/Temp/rpg-economy-composed-$(Get-Date -Format yyyyMMdd-HHmmss)"
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$bin = 'C:/Program Files/PostgreSQL/17/bin'
$logs = Join-Path $RunDirectory 'logs'
$data = Join-Path $RunDirectory 'data'
if ($Port -eq 55783) { throw 'Port 55783 is reserved for the root integration cluster' }
if (Test-Path -LiteralPath $data) { throw "Existing data directory: $data" }
function Get-CanonicalSha256([string]$Path) {
  $normalized = [IO.File]::ReadAllText($Path).Replace("`r`n", "`n")
  $bytes = [Text.Encoding]::UTF8.GetBytes($normalized)
  $hash = ([Security.Cryptography.SHA256]::Create()).ComputeHash($bytes)
  return (($hash | ForEach-Object { $_.ToString('X2') }) -join '')
}
function Write-CanonicalSqlCopy([string]$Path) {
  $copy = Join-Path $logs ('lf-' + (Split-Path $Path -Leaf))
  $sql = [IO.File]::ReadAllText($Path).Replace("`r`n", "`n")
  [IO.File]::WriteAllText($copy, $sql, [Text.UTF8Encoding]::new($false))
  return $copy
}
$manifest = Get-Content -LiteralPath (Join-Path $here 'sha256.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($entry in $manifest.PSObject.Properties) {
  $path = (Resolve-Path -LiteralPath (Join-Path $here $entry.Name)).Path
  $actual = Get-CanonicalSha256 $path
  if ($actual -ne $entry.Value) { throw "SOURCE_SHA256_DRIFT $($entry.Name): $actual" }
}
Write-Output "SOURCE_SHA256_MATCHED count=$(@($manifest.PSObject.Properties).Count)"

$started = $false
try {
  & (Join-Path $here 'replay-local.ps1') -Port $Port -Database $Database -RunDirectory $RunDirectory
  $started = $true
  $plan = @(
    'sources/economy_live_extension_fixture.sql',
    'sources/economy_balance_seed.sql'
  )
  foreach ($relative in $plan) {
    $file = Join-Path $here $relative
    $name = Split-Path $file -Leaf
    $inputFile = Write-CanonicalSqlCopy $file
    $ErrorActionPreference = 'Continue'
    & "$bin/psql.exe" -X -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $inputFile *> (Join-Path $logs "$name.log")
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    Write-Output "$relative exit=$code"
    if ($code -ne 0) { throw "SQL failed: $relative" }
  }

  $prepared = Join-Path $logs 'real_sources.sql'
  & (Join-Path $here '../20261022_crafting_prepare_live_source.ps1') `
    -SnapshotPath (Join-Path $here 'live-source-snapshot.json') `
    -SupplementPath (Join-Path $here 'live-source-supplement.json') `
    -OutputPath $prepared `
    -ClassMigrationPath (Join-Path $here 'hero_class_authority_source.sql') `
    -Port $Port -Database $Database
  $preparedHash = Get-CanonicalSha256 $prepared
  if ($preparedHash -ne $manifest.'real_sources.sql') {
    throw "PREPARED_SOURCE_SHA256_DRIFT $preparedHash"
  }
  Write-Output "real_sources.sql exit=0 sha256=$preparedHash"

  $plan = @(
    '../20261022_economy_composed_supplement.sql',
    '../../migrations/20261022022416_boss_recipes_crafting_salvage.sql',
    'sources/20261022022614_economy_victory_shop.sql',
    'sources/20261022022726_adventure_chests_offline.sql',
    'sources/economy_assert.sql',
    'composed_assert.sql'
  )
  foreach ($relative in $plan) {
    $file = (Resolve-Path -LiteralPath (Join-Path $here $relative)).Path
    $name = Split-Path $file -Leaf
    $inputFile = Write-CanonicalSqlCopy $file
    $ErrorActionPreference = 'Continue'
    & "$bin/psql.exe" -X -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $inputFile *> (Join-Path $logs "$name.log")
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    Write-Output "$relative exit=$code"
    if ($code -ne 0) { throw "SQL failed: $relative" }
  }

  $sql = "select 'sync',md5(pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure)) union all select 'register',md5(pg_get_functiondef('app_private.register_boss_recipe(app_private.adventure_battles,boolean)'::regprocedure)) union all select 'advance',md5(pg_get_functiondef('app_private.advance_auto_adventure(uuid)'::regprocedure))"
  $hashes = & "$bin/psql.exe" -X -At -F '|' -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -c $sql
  if ($LASTEXITCODE -ne 0) { throw "Final hash query exit=$LASTEXITCODE" }
  $hashes | Set-Content -LiteralPath (Join-Path $logs 'final-function-hashes.txt') -Encoding UTF8
  $expected = @(
    'sync|59914430e3b78e96f69deaf770f82910',
    'register|859d52e06b6f95a3947a033116d71026',
    'advance|09c5c400405def35917f1c63e4f58ac8'
  )
  if (@(Compare-Object $expected $hashes).Count -ne 0) {
    throw "FINAL_FUNCTION_HASH_DRIFT: $($hashes -join ',')"
  }
  Write-Output "FINAL_FUNCTION_HASHES_MATCHED $($hashes -join ' ')"
  Write-Output "COMPOSED_CHAIN_PASS database=$Database port=$Port logs=$logs"
} finally {
  if (Test-Path -LiteralPath (Join-Path $data 'postmaster.pid')) {
    & "$bin/pg_ctl.exe" -D $data stop -m fast -w
    Write-Output "pg_ctl_stop_exit=$LASTEXITCODE"
    & "$bin/pg_isready.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres
    Write-Output "pg_isready_after_stop_exit=$LASTEXITCODE"
    if ($LASTEXITCODE -eq 0) { throw "Listener remains on $Port" }
  } elseif ($started) {
    throw "Started cluster has no postmaster.pid: $data"
  }
}
