param(
  [Parameter(Mandatory=$true)][string]$ExpectedSha,
  [string]$ProductRoot = 'C:/Users/Murillo/orca/workspaces/rpg-buddy/rpg-pets-integracao-20261026',
  [int]$Port = 55895,
  [string]$RunDirectory = "$env:LOCALAPPDATA/Temp/rpg-pets-independent-$(Get-Date -Format yyyyMMdd-HHmmss)"
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$bin = 'C:/Program Files/PostgreSQL/17/bin'
$reference = 'C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/economia-implementacao-20261022/verify-final-source-284db26.ps1'
$ProductRoot = (Resolve-Path -LiteralPath $ProductRoot).Path
$head = (& git -C $ProductRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -ne $ExpectedSha) { throw "Product SHA $head differs from frozen $ExpectedSha" }
if ($Port -eq 55783 -or $Port -eq 55894) { throw "Reserved port: $Port" }
if (Test-Path -LiteralPath $RunDirectory) { throw "Existing run directory: $RunDirectory" }
$data = Join-Path $RunDirectory 'data'
$logs = Join-Path $RunDirectory 'logs'
$migration = Join-Path $ProductRoot 'supabase/migrations/20261026185325_adventure_pets_authoritative.sql'
$fixture = Join-Path $ProductRoot 'supabase/tests/pets_authoritative_20261026/live_identity_fixture.sql'
$started = $false
$roleMembershipGranted = $false
$passed = $false

function CanonicalHash([string]$Path) {
  $normalized = [IO.File]::ReadAllText($Path).Replace("`r`n","`n").Replace("`r","`n")
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData(
    [Text.Encoding]::UTF8.GetBytes($normalized)))
}
function Invoke-Sql([string]$Database,[string]$Label,[string]$File,[int]$Expected=0) {
  $name = "$Database-$Label"
  $log = Join-Path $logs "$name.log"
  $ErrorActionPreference = 'Continue'
  & "$bin/psql.exe" -X -h 127.0.0.1 -p $Port -U postgres -d $Database -v ON_ERROR_STOP=1 -f $File *> $log
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  Write-Output "$name exit=$code sha256_lf=$(CanonicalHash $File) log=$log"
  if ($code -ne $Expected) { throw "$name expected=$Expected actual=$code" }
}
function Create-Clone([string]$Database) {
  & "$bin/createdb.exe" -h 127.0.0.1 -p $Port -U postgres -T pets_source $Database
  if ($LASTEXITCODE -ne 0) { throw "createdb $Database exit=$LASTEXITCODE" }
}

try {
  $priorMigrations = 'C:/Users/Murillo/orca/workspaces/rpg-buddy/rpg-continuo-integracao-20261020/supabase/migrations'
  foreach ($name in @('20261022022416_boss_recipes_crafting_salvage.sql',
    '20261022022614_economy_victory_shop.sql',
    '20261022022726_adventure_chests_offline.sql',
    '20261022030906_recipe_class_transition.sql',
    '20261022032246_adventure_encounters_gold_range.sql')) {
    $realHash = CanonicalHash (Join-Path $ProductRoot "supabase/migrations/$name")
    $fixtureHash = CanonicalHash (Join-Path $priorMigrations $name)
    if ($realHash -ne $fixtureHash) { throw "Predecessor migration drift: $name" }
    Write-Output "PREDECESSOR_SHA256_LF $name $realHash"
  }
  $bootstrapLog = Join-Path $env:TEMP "pets-independent-bootstrap-$Port-$(Get-Date -Format yyyyMMddHHmmss).log"
  Start-Transcript -LiteralPath $bootstrapLog | Out-Null
  try { & $reference -Port $Port -Database pets_source -RunDirectory $RunDirectory }
  finally { Stop-Transcript | Out-Null }
  if (-not (Select-String -LiteralPath $bootstrapLog -Pattern 'COMPOSED_CHAIN_PASS' -Quiet) -or
      -not (Select-String -LiteralPath $bootstrapLog -Pattern 'pg_isready_after_stop_exit=2' -Quiet)) {
    throw "Bootstrap failed: $bootstrapLog"
  }
  Copy-Item -LiteralPath $bootstrapLog -Destination (Join-Path $logs 'bootstrap.log')
  Write-Output "BASELINE_COMPOSED_PASS log=$(Join-Path $logs 'bootstrap.log')"
  & "$bin/pg_ctl.exe" -D $data -l (Join-Path $logs 'server-review.log') `
    -o "-h 127.0.0.1 -p $Port" start -w
  if ($LASTEXITCODE -ne 0) { throw "pg_ctl restart exit=$LASTEXITCODE" }
  $started = $true
  Invoke-Sql pets_source live-identity $fixture
  Invoke-Sql pets_source live-wrapper-acl (Join-Path $here 'baseline_acl_overlay.sql')
  & python (Join-Path $here 'probe_catalog.py') --port $Port --database pets_source `
    --output (Join-Path $logs 'catalog-before.json') --compare-live-snapshot
  if ($LASTEXITCODE -ne 0) { throw 'Snapshot metadata drift before migration' }
  foreach ($db in @('pets_positive','pets_drift_body','pets_drift_acl',
    'pets_drift_columns','pets_drift_trigger','pets_drift_acl_null',
    'pets_drift_overload','pets_drift_role_membership')) { Create-Clone $db }
  $lfMigration = Join-Path $logs 'migration-lf.sql'
  [IO.File]::WriteAllText($lfMigration,[IO.File]::ReadAllText($migration).Replace("`r`n","`n"),
    [Text.UTF8Encoding]::new($false))
  Write-Output "MIGRATION_SOURCE_SHA256_LF $(CanonicalHash $migration)"
  Invoke-Sql pets_positive migration $lfMigration
  foreach ($name in @('assert','matrix','offline')) {
    Invoke-Sql pets_positive "author-$name" (Join-Path $ProductRoot "supabase/tests/pets_authoritative_20261026/$name.sql")
  }
  Invoke-Sql pets_positive catalog (Join-Path $here 'assert_catalog.sql')
  Invoke-Sql pets_positive behavior (Join-Path $here 'assert_behavior.sql')
  Invoke-Sql pets_positive sustain (Join-Path $here 'assert_sustain.sql')
  Invoke-Sql pets_positive purchase-provenance (Join-Path $here 'assert_purchase_provenance.sql')
  Invoke-Sql pets_positive metadata (Join-Path $here 'assert_metadata.sql')
  & python (Join-Path $here 'probe_catalog.py') --port $Port --database pets_positive `
    --output (Join-Path $logs 'catalog-after.json')
  if ($LASTEXITCODE -ne 0) { throw 'Final catalog probe failed' }
  & python (Join-Path $here 'compare_catalog.py') `
    --before (Join-Path $logs 'catalog-before.json') `
    --after (Join-Path $logs 'catalog-after.json')
  if ($LASTEXITCODE -ne 0) { throw 'Preserved contract metadata changed' }
  & python (Join-Path $here 'concurrency.py') --port $Port --database pets_positive `
    --logs (Join-Path $logs 'two-session')
  if ($LASTEXITCODE -ne 0) { throw 'Independent concurrency probe failed' }
  foreach ($kind in @('body','acl','columns','trigger','acl_null','overload')) {
    $db = "pets_drift_$kind"
    Invoke-Sql $db "mutate-$kind" (Join-Path $here "drift_$kind.sql")
    Invoke-Sql $db "reject-$kind" $lfMigration 3
    $unchanged = & "$bin/psql.exe" -X -At -h 127.0.0.1 -p $Port -U postgres -d $db `
      -v ON_ERROR_STOP=1 -c "SELECT to_regclass('app_private.adventure_pet_rollout') IS NULL"
    if ($LASTEXITCODE -ne 0 -or $unchanged -ne 't') { throw "Migration mutated schema despite $kind drift" }
  }
  $roleMembershipGranted = $true
  Invoke-Sql pets_drift_role_membership mutate-role-membership `
    (Join-Path $here 'drift_role_membership.sql')
  $inherited = & "$bin/psql.exe" -X -At -h 127.0.0.1 -p $Port -U postgres `
    -d pets_drift_role_membership -v ON_ERROR_STOP=1 -c `
    "SELECT has_function_privilege('anon','public.buy_pet(text)','EXECUTE')"
  if ($LASTEXITCODE -ne 0 -or $inherited -ne 't') {
    throw 'Role membership did not create effective ACL drift'
  }
  Invoke-Sql pets_drift_role_membership reject-role-membership $lfMigration 3
  $unchanged = & "$bin/psql.exe" -X -At -h 127.0.0.1 -p $Port -U postgres `
    -d pets_drift_role_membership -v ON_ERROR_STOP=1 -c `
    "SELECT to_regclass('app_private.adventure_pet_rollout') IS NULL"
  if ($LASTEXITCODE -ne 0 -or $unchanged -ne 't') {
    throw 'Migration mutated schema despite effective ACL drift'
  }
  $passed = $true
} finally {
  $cleanupError = $null
  if ($roleMembershipGranted -and (Test-Path -LiteralPath (Join-Path $data 'postmaster.pid'))) {
    try {
      Invoke-Sql postgres restore-role-membership (Join-Path $here 'restore_role_membership.sql')
      $stillMember = & "$bin/psql.exe" -X -At -h 127.0.0.1 -p $Port -U postgres `
        -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_has_role('anon','authenticated','member')"
      if ($LASTEXITCODE -ne 0 -or $stillMember -ne 'f') {
        throw 'Role membership cleanup failed'
      }
    } catch { $cleanupError = $_ }
  }
  try {
    if (Test-Path -LiteralPath (Join-Path $data 'postmaster.pid')) {
      & "$bin/pg_ctl.exe" -D $data stop -m fast -w
      Write-Output "pg_ctl_stop_exit=$LASTEXITCODE"
      if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL teardown failed' }
      & "$bin/pg_isready.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres
      Write-Output "pg_isready_after_stop_exit=$LASTEXITCODE"
      if ($LASTEXITCODE -ne 2) { throw "Unexpected listener state exit=$LASTEXITCODE" }
    } elseif ($started) { throw "Started cluster lost postmaster.pid: $data" }
  } finally {
    if ($null -ne $cleanupError) { throw $cleanupError }
  }
}
if ($passed) { Write-Output "INDEPENDENT_PG17_PASS sha=$head port=$Port logs=$logs" }
