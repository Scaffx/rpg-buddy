param(
  [switch]$IncludeJourney,
  [int]$Port = 55793,
  [string]$Database = 'cash_20261031',
  [string]$RunDirectory = "$env:LOCALAPPDATA/Temp/rpg-cash-20261031-$(Get-Date -Format yyyyMMdd-HHmmss)",
  [switch]$DefaultAclProbe
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
  & "$bin/pg_isready.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres *> $null
  if ($LASTEXITCODE -eq 0) { throw "Port $Port already has a PostgreSQL listener" }
  if (Test-Path -LiteralPath $data) { throw "Existing data directory: $data; choose a new RunDirectory" }
  & "$bin/initdb.exe" -D $data -U postgres --encoding=UTF8 --locale=C --auth=trust *> (Join-Path $logs 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw "initdb exit=$LASTEXITCODE" }
  # A detached server must not keep the invoking PowerShell capture pipes open.
  $start = Start-Process -FilePath "$bin/pg_ctl.exe" -ArgumentList @(
    '-D', "`"$data`"", '-l', "`"$(Join-Path $logs 'server.log')`"",
    '-o', "`"-h 127.0.0.1 -p $Port`"", 'start', '-w'
  ) -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $logs 'pg-start.stdout.log') `
    -RedirectStandardError (Join-Path $logs 'pg-start.stderr.log')
  if (-not $start.WaitForExit(30000)) { throw 'pg_ctl start did not finish in 30 seconds' }
  if ($start.ExitCode -ne 0) { throw "pg_ctl start exit=$($start.ExitCode)" }
  $started = $true
  & (Join-Path $composed 'replay-local.ps1') -Port $Port -Database $Database -RunDirectory $RunDirectory -ResumeStartedCluster
  if ($LASTEXITCODE -ne 0) { throw 'Base replay failed' }
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
  if ($DefaultAclProbe) {
    & "$bin/psql.exe" -X -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 `
      -c 'CREATE ROLE chest_inherited_acl NOLOGIN' `
      -c 'GRANT chest_inherited_acl TO authenticated' `
      -c 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private GRANT TRUNCATE ON TABLES TO chest_inherited_acl' `
      *> (Join-Path $logs 'inherited-default-acl-setup.log')
    if ($LASTEXITCODE -ne 0) { throw 'Inherited default ACL setup failed' }
    $inherit = & "$bin/psql.exe" -X -A -t -h 127.0.0.1 -p $Port -U postgres -d $Database `
      -v ON_ERROR_STOP=1 -c "SELECT pg_has_role('authenticated','chest_inherited_acl','USAGE')"
    if (($inherit | Select-Object -Last 1).Trim() -ne 't') { throw 'Authenticated does not inherit test role' }
    $migration = (Resolve-Path -LiteralPath (Join-Path $here '../migrations/20261031044207_chest_parallel_loot_time_shop.sql')).Path
    & "$bin/psql.exe" -X -h 127.0.0.1 -p $Port -U postgres -d $Database `
      -v ON_ERROR_STOP=1 -f $migration *> (Join-Path $logs 'inherited-default-acl-migration.log')
    $migrationExit = $LASTEXITCODE
    $probe = & "$bin/psql.exe" -X -A -t -h 127.0.0.1 -p $Port -U postgres -d $Database `
      -v ON_ERROR_STOP=1 -c "SELECT to_regclass('app_private.adventure_chest_cash_receipts') IS NOT NULL, coalesce(has_table_privilege('authenticated',to_regclass('app_private.adventure_chest_cash_receipts'),'TRUNCATE'),false)"
    Write-Output "DEFAULT_ACL_PROBE migration_exit=$migrationExit result=$($probe -join ',') logs=$logs"
    if ($migrationExit -ne 3 -or ($probe | Select-Object -Last 1).Trim() -ne 'f|f' `
      -or (Get-Content (Join-Path $logs 'inherited-default-acl-migration.log') -Raw) `
        -notmatch 'CHEST_PRIVATE_EFFECTIVE_ACL_DRIFT') {
      throw 'Inherited default ACL was not rejected without mutation'
    }
    return
  }
  Apply-Sql (Join-Path $here '../migrations/20261031044207_chest_parallel_loot_time_shop.sql')
  if ($IncludeJourney) {
    Apply-Sql (Join-Path $here '../migrations/20261031044228_adventure_journey_choices.sql')
  }
  Apply-Sql (Join-Path $here '20261031_chests_assert.sql')
  & (Join-Path $here '20261031_chests_concurrency.ps1') -Port $Port -Database $Database `
    -ArtifactDir (Join-Path $logs 'concurrency')
  if ($LASTEXITCODE -ne 0) { throw 'Concurrency test failed' }
  $cashMigration = (Resolve-Path -LiteralPath (Join-Path $here '../migrations/20261031050256_chest_cash_checkout_orders.sql')).Path.Replace('\','/')
  $driftScript = Join-Path $logs 'cash-grant-drift.sql'
  [IO.File]::WriteAllText($driftScript,
    "BEGIN;`nREVOKE EXECUTE ON FUNCTION public.grant_adventure_chest_cash_receipt(uuid,text,text,text,integer,text,text) FROM service_role;`n\i '$cashMigration'`nCOMMIT;`n",
    [Text.UTF8Encoding]::new($false))
  & "$bin/psql.exe" -X -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $driftScript `
    *> (Join-Path $logs 'cash-grant-drift.log')
  if ($LASTEXITCODE -ne 3) { throw "Expected cash drift preflight exit 3, got $LASTEXITCODE" }
  $noMutation = & "$bin/psql.exe" -X -A -t -h 127.0.0.1 -p $Port -U postgres -d $Database `
    -v ON_ERROR_STOP=1 -c "SELECT to_regclass('app_private.adventure_chest_cash_orders') IS NULL AND has_function_privilege('service_role','public.grant_adventure_chest_cash_receipt(uuid,text,text,text,integer,text,text)','EXECUTE')"
  if ($LASTEXITCODE -ne 0 -or ($noMutation | Select-Object -Last 1).Trim() -ne 't') {
    throw 'Cash drift preflight mutated the database'
  }
  Write-Output 'CASH_GRANT_DRIFT_DENIED exit=3 no_mutation=1'
  $defaultScript = Join-Path $logs 'cash-order-default-acl.sql'
  [IO.File]::WriteAllText($defaultScript,
    "BEGIN;`nCREATE ROLE cash_order_inherited_acl NOLOGIN;`nGRANT cash_order_inherited_acl TO authenticated;`nALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private GRANT TRUNCATE ON TABLES TO cash_order_inherited_acl;`n\i '$cashMigration'`nCOMMIT;`n",
    [Text.UTF8Encoding]::new($false))
  & "$bin/psql.exe" -X -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $defaultScript `
    *> (Join-Path $logs 'cash-order-default-acl.log')
  if ($LASTEXITCODE -ne 3 -or (Get-Content (Join-Path $logs 'cash-order-default-acl.log') -Raw) `
    -notmatch 'CHEST_CASH_ORDER_EFFECTIVE_ACL_DRIFT') {
    throw "Expected cash order inherited ACL preflight exit 3, got $LASTEXITCODE"
  }
  $noMutation = & "$bin/psql.exe" -X -A -t -h 127.0.0.1 -p $Port -U postgres -d $Database `
    -v ON_ERROR_STOP=1 -c "SELECT to_regclass('app_private.adventure_chest_cash_orders') IS NULL AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cash_order_inherited_acl')"
  if ($LASTEXITCODE -ne 0 -or ($noMutation | Select-Object -Last 1).Trim() -ne 't') {
    throw 'Cash order inherited ACL drift mutated the database'
  }
  Write-Output 'CASH_ORDER_DEFAULT_ACL_DENIED exit=3 no_mutation=1'
  Apply-Sql (Join-Path $here '../migrations/20261031050256_chest_cash_checkout_orders.sql')
  Apply-Sql (Join-Path $here '20261031_chest_cash_orders_assert.sql')
  if ($IncludeJourney) { Apply-Sql (Join-Path $here '20261031_reform_chain_assert.sql') }
  & (Join-Path $here '20261031_chest_cash_concurrency.ps1') -Port $Port -Database $Database `
    -ArtifactDir (Join-Path $logs 'cash-concurrency')
  if ($LASTEXITCODE -ne 0) { throw 'Cash order concurrency failed' }
  Write-Output "CHEST_CASH_20261031_PASS port=$Port database=$Database logs=$logs"
} finally {
  if (Test-Path -LiteralPath (Join-Path $data 'postmaster.pid')) {
    & "$bin/pg_ctl.exe" -D $data stop -m fast -w
    Write-Output "pg_ctl_stop_exit=$LASTEXITCODE"
    & "$bin/pg_isready.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres
    Write-Output "pg_isready_after_stop_exit=$LASTEXITCODE"
    if ($LASTEXITCODE -eq 0) { throw "Listener remains on $Port" }
  } elseif ($started) { throw "Cluster lost postmaster.pid: $data" }
}

# pg_isready exit 2 above is the expected successful teardown result.
$global:LASTEXITCODE = 0
