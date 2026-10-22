param(
  [int]$Port = 55790,
  [string]$Database = 'economy_independent_review',
  [string]$RunDirectory = "$env:LOCALAPPDATA/Temp/rpg-economy-independent-$(Get-Date -Format yyyyMMdd-HHmmss)",
  [string]$ProductRoot = '',
  [string]$ExpectedSha = ''
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
if (-not $ProductRoot) { $ProductRoot = $repo }
$ProductRoot = (Resolve-Path -LiteralPath $ProductRoot).Path
$productSha = (& git -C $ProductRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot read product SHA' }
if ($ExpectedSha -and $productSha -ne $ExpectedSha) {
  throw "Product SHA $productSha differs from frozen $ExpectedSha"
}
Write-Output "PRODUCT_SHA $productSha root=$ProductRoot"
$fixture = Join-Path $repo 'supabase/tests/economy_composed_20261022'
$bin = 'C:/Program Files/PostgreSQL/17/bin'
$logs = Join-Path $RunDirectory 'logs'
$data = Join-Path $RunDirectory 'data'
if ($Port -eq 55783) { throw 'Root integration port is reserved' }
if (Test-Path -LiteralPath $data) { throw "Existing data directory: $data" }

function CanonicalHash([string]$Path) {
  $bytes = [Text.Encoding]::UTF8.GetBytes([IO.File]::ReadAllText($Path).Replace("`r`n", "`n"))
  return (([Security.Cryptography.SHA256]::Create().ComputeHash($bytes) |
    ForEach-Object { $_.ToString('X2') }) -join '')
}
function ApplySql([string]$Path) {
  $file = (Resolve-Path -LiteralPath $Path).Path
  $name = Split-Path $file -Leaf
  if ($file -like '*supabase\migrations\20261022*') {
    $copy = Join-Path $logs "lf-$name"
    [IO.File]::WriteAllText($copy,
      [IO.File]::ReadAllText($file).Replace("`r`n", "`n"),
      [Text.UTF8Encoding]::new($false))
    $file = $copy
  }
  $ErrorActionPreference = 'Continue'
  & "$bin/psql.exe" -X -h 127.0.0.1 -p $Port -U postgres -d $Database `
    -v ON_ERROR_STOP=1 -f $file *> (Join-Path $logs "$name.log")
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  Write-Output "$name exit=$code sha256_lf=$(CanonicalHash $file)"
  if ($code -ne 0) { throw "SQL failed: $file" }
}

$manifest = Get-Content -LiteralPath (Join-Path $fixture 'sha256.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($entry in $manifest.PSObject.Properties) {
  if ($entry.Name -like 'sources/20261022022614*' -or
      $entry.Name -like 'sources/20261022022726*') { continue }
  $file = (Resolve-Path -LiteralPath (Join-Path $fixture $entry.Name)).Path
  if ((CanonicalHash $file) -ne $entry.Value) { throw "Fixture source drift: $($entry.Name)" }
}
Write-Output 'Fixture sources matched, excluding superseded migration snapshots'
foreach ($name in @('20261022022416_boss_recipes_crafting_salvage.sql',
    '20261022022614_economy_victory_shop.sql',
    '20261022022726_adventure_chests_offline.sql')) {
  $file = Join-Path $ProductRoot "supabase/migrations/$name"
  Write-Output "$name source_sha256_lf=$(CanonicalHash $file)"
}

try {
  & (Join-Path $fixture 'replay-local.ps1') -Port $Port -Database $Database -RunDirectory $RunDirectory
  foreach ($name in @('economy_live_extension_fixture.sql','economy_balance_seed.sql')) {
    ApplySql (Join-Path $fixture "sources/$name")
  }
  $prepared = Join-Path $logs 'real_sources.sql'
  & (Join-Path $repo 'supabase/tests/20261022_crafting_prepare_live_source.ps1') `
    -SnapshotPath (Join-Path $fixture 'live-source-snapshot.json') `
    -SupplementPath (Join-Path $fixture 'live-source-supplement.json') `
    -OutputPath $prepared `
    -ClassMigrationPath (Join-Path $fixture 'hero_class_authority_source.sql') `
    -Port $Port -Database $Database
  if ((CanonicalHash $prepared) -ne $manifest.'real_sources.sql') {
    throw 'Prepared function source drift'
  }
  ApplySql (Join-Path $repo 'supabase/tests/20261022_economy_composed_supplement.sql')
  foreach ($name in @('20261022022416_boss_recipes_crafting_salvage.sql',
      '20261022022614_economy_victory_shop.sql',
      '20261022022726_adventure_chests_offline.sql')) {
    ApplySql (Join-Path $ProductRoot "supabase/migrations/$name")
  }
  $corrections = @(Get-ChildItem -LiteralPath (Join-Path $ProductRoot 'supabase/migrations') -Filter '2026102203*.sql' | Sort-Object Name)
  foreach ($correction in $corrections) { ApplySql $correction.FullName }
  $assertSource = Join-Path $fixture 'sources/economy_assert.sql'
  $assertCopy = Join-Path $logs 'economy_assert_current_prices.sql'
  $assertText = [IO.File]::ReadAllText($assertSource)
  if (-not $assertText.Contains('price=3000000')) { throw 'Unexpected legacy pet assertion' }
  [IO.File]::WriteAllText($assertCopy,
    $assertText.Replace('price=3000000','price=4000000').Replace("`r`n", "`n"),
    [Text.UTF8Encoding]::new($false))
  ApplySql $assertCopy
  ApplySql (Join-Path $fixture 'composed_assert.sql')
  ApplySql (Join-Path $PSScriptRoot 'independent_assert.sql')
  foreach ($name in @('economy_gold_range_bounds.sql','economy_gold_range_flow.sql')) {
    $test = Join-Path $ProductRoot "src/test/sql/$name"
    if (Test-Path -LiteralPath $test) { ApplySql $test }
  }
  $sql = "select 'sync',md5(pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure)) union all select 'register',md5(pg_get_functiondef('app_private.register_boss_recipe(app_private.adventure_battles,boolean)'::regprocedure)) union all select 'advance',md5(pg_get_functiondef('app_private.advance_auto_adventure(uuid)'::regprocedure))"
  $hashes = & "$bin/psql.exe" -X -At -F '|' -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -c $sql
  if ($LASTEXITCODE -ne 0) { throw 'Final hash query failed' }
  $hashes | Set-Content -LiteralPath (Join-Path $logs 'final-function-hashes.txt') -Encoding UTF8
  Write-Output "FINAL_FUNCTION_HASHES $($hashes -join ' ')"
  Write-Output "INDEPENDENT_COMPOSED_CHAIN_PASS port=$Port logs=$logs"
} finally {
  if (Test-Path -LiteralPath (Join-Path $data 'postmaster.pid')) {
    & "$bin/pg_ctl.exe" -D $data stop -m fast -w
    Write-Output "pg_ctl_stop_exit=$LASTEXITCODE"
    & "$bin/pg_isready.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres
    Write-Output "pg_isready_after_stop_exit=$LASTEXITCODE"
    if ($LASTEXITCODE -eq 0) { throw "Listener remains on $Port" }
  }
}
