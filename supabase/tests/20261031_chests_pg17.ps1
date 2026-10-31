param(
  [int]$Port = 55791,
  [string]$Database = 'chests_20261031',
  [string]$RunDirectory = "$env:LOCALAPPDATA/Temp/rpg-chests-20261031-$(Get-Date -Format yyyyMMdd-HHmmss)"
)
$ErrorActionPreference = 'Stop'
$bin = 'C:/Program Files/PostgreSQL/17/bin'
$here = $PSScriptRoot
$composed = Join-Path $here 'economy_composed_20261022'
$logs = Join-Path $RunDirectory 'logs'
$data = Join-Path $RunDirectory 'data'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
function Hash-LF([string]$path) {
  $s = [IO.File]::ReadAllText($path).Replace("`r`n","`n")
  $b = [Text.Encoding]::UTF8.GetBytes($s)
  $h = [Security.Cryptography.SHA256]::HashData($b)
  return [Convert]::ToHexString($h).ToLowerInvariant()
}
function Apply-Sql([string]$path) {
  $resolved = (Resolve-Path -LiteralPath $path).Path
  $name = Split-Path $resolved -Leaf
  $sql = [IO.File]::ReadAllText($resolved).Replace("`r`n","`n")
  $copy = Join-Path $logs ("lf-" + $name)
  [IO.File]::WriteAllText($copy,$sql,[Text.UTF8Encoding]::new($false))
  & "$bin/psql.exe" -X -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $copy *> (Join-Path $logs "$name.log")
  $exit = $LASTEXITCODE
  Write-Output "$name exit=$exit sha256lf=$(Hash-LF $resolved)"
  if ($exit -ne 0) { throw "SQL failed: $name; see $(Join-Path $logs "$name.log")" }
}
$manifest = Get-Content (Join-Path $composed 'sha256.json') -Raw | ConvertFrom-Json
foreach ($entry in $manifest.PSObject.Properties) {
  $path = (Resolve-Path -LiteralPath (Join-Path $composed $entry.Name)).Path
  if ((Hash-LF $path) -ne $entry.Value.ToLowerInvariant()) { throw "SOURCE_SHA256_DRIFT $($entry.Name)" }
}
Write-Output "SOURCE_SHA256_MATCHED count=$(@($manifest.PSObject.Properties).Count)"
$started = $false
try {
  & (Join-Path $composed 'replay-local.ps1') -Port $Port -Database $Database -RunDirectory $RunDirectory
  if ($LASTEXITCODE -ne 0) { throw 'Base replay failed' }
  $started = $true
  Apply-Sql (Join-Path $composed 'sources/economy_live_extension_fixture.sql')
  Apply-Sql (Join-Path $composed 'sources/economy_balance_seed.sql')
  $prepared = Join-Path $logs 'real_sources.sql'
  & (Join-Path $here '20261022_crafting_prepare_live_source.ps1') `
    -SnapshotPath (Join-Path $composed 'live-source-snapshot.json') `
    -SupplementPath (Join-Path $composed 'live-source-supplement.json') `
    -OutputPath $prepared `
    -ClassMigrationPath (Join-Path $composed 'hero_class_authority_source.sql') `
    -Port $Port -Database $Database
  if ((Hash-LF $prepared) -ne $manifest.'real_sources.sql') { throw 'PREPARED_SOURCE_SHA256_DRIFT' }
  Apply-Sql (Join-Path $here '20261022_economy_composed_supplement.sql')
  Apply-Sql (Join-Path $here '../migrations/20261022022416_boss_recipes_crafting_salvage.sql')
  Apply-Sql (Join-Path $composed 'sources/20261022022614_economy_victory_shop.sql')
  Apply-Sql (Join-Path $composed 'sources/20261022022726_adventure_chests_offline.sql')
  Apply-Sql (Join-Path $composed 'sources/economy_assert.sql')
  Apply-Sql (Join-Path $composed 'composed_assert.sql')
  Apply-Sql (Join-Path $here '20261031_chests_catalog_fixture.sql')
  & (Join-Path $here '20261031_chests_preflight.ps1') -Port $Port -Database $Database `
    -ArtifactDir (Join-Path $logs 'preflight') `
    -Migration (Join-Path $here '../migrations/20261031044207_chest_parallel_loot_time_shop.sql')
  Apply-Sql (Join-Path $here '../migrations/20261031044207_chest_parallel_loot_time_shop.sql')
  Apply-Sql (Join-Path $here '20261031_chests_assert.sql')
  & (Join-Path $here '20261031_chests_concurrency.ps1') -Port $Port -Database $Database `
    -ArtifactDir (Join-Path $logs 'concurrency')
  if ($LASTEXITCODE -ne 0) { throw 'Concurrency test failed' }
  Write-Output "CHESTS_20261031_PASS port=$Port database=$Database logs=$logs"
} finally {
  if (Test-Path -LiteralPath (Join-Path $data 'postmaster.pid')) {
    & "$bin/pg_ctl.exe" -D $data stop -m fast -w
    Write-Output "pg_ctl_stop_exit=$LASTEXITCODE"
    & "$bin/pg_isready.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres
    Write-Output "pg_isready_after_stop_exit=$LASTEXITCODE"
    if ($LASTEXITCODE -eq 0) { throw "Listener remains on $Port" }
  } elseif ($started) { throw "Cluster lost postmaster.pid: $data" }
}
