param(
  [int]$Port = 55942,
  [string]$RunDirectory = "$env:LOCALAPPDATA/Temp/rpg-pet-care-verified-$(Get-Date -Format yyyyMMdd-HHmmss)"
)
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$repo = (Resolve-Path (Join-Path $here '../../..')).Path
$bin = 'C:/Program Files/PostgreSQL/17/bin'
$reference = 'C:/Users/Murillo/Documents/Codex/2026-10-15/seguinte-dentro-do-sistema-de-rpg/work/economia-implementacao-20261022/verify-final-source-284db26.ps1'
$logs = Join-Path $RunDirectory 'logs'
$data = Join-Path $RunDirectory 'data'
$base = 'pet_source'
$migration = Join-Path $repo 'supabase/migrations/20261029120000_pet_food_and_care.sql'
$migrations = @(
  '20261026185325_adventure_pets_authoritative.sql',
  '20261028214109_adventure_horde_continuous.sql',
  '20261029035917_mage_area_hero_hits.sql',
  '20261029043726_adventure_auto_potions.sql'
)
$expected = @{
  '20261026185325_adventure_pets_authoritative.sql' = 'B49428C7C96A99234C7695AEFA98480275286EDE20CA6EC5379E06447433671B'
  '20261028214109_adventure_horde_continuous.sql' = '858C6600D4EC72FB45A833B1CC6B9CC20013497BAA5C48F4782219E75E72A39B'
  '20261029035917_mage_area_hero_hits.sql' = 'E3D91602BDE60BCC47D1EAF646F25B9AE7F7BB4DB0547A637C6DE0E1A37B7E6E'
  '20261029043726_adventure_auto_potions.sql' = 'DCC1A66A08024A54641CB676982E3A2316A5B8FCD59CA1B1150236B06AD7786C'
  '20261029120000_pet_food_and_care.sql' = 'DBCF6D117E0A33931641C48561D99035DAC6F85E4B501CCDA2726024A432AE7A'
  'local-consumer-source.sql' = '5C9F1DB8D14194FACB636582A692BD1DB4635AE3571D8E32B3739AC4E17CB705'
}
function CanonicalHash([string]$path) {
  $body = [IO.File]::ReadAllText($path).Replace("`r`n", "`n")
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData(
    [Text.Encoding]::UTF8.GetBytes($body)))
}
function Invoke-Sql([string]$db,[string]$name,[string]$file,[int]$expectedExit=0) {
  $log = Join-Path $logs "$db-$name.log"
  $ErrorActionPreference = 'Continue'
  & "$bin/psql.exe" -X -h 127.0.0.1 -p $Port -U postgres -d $db -v ON_ERROR_STOP=1 -f $file *> $log
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  Write-Host "$db $name exit=$code log=$log"
  if ($code -ne $expectedExit) { throw "$db $name expected=$expectedExit actual=$code" }
  return $log
}
function Invoke-Query([string]$db,[string]$name,[string]$sql) {
  $log = Join-Path $logs "$db-$name.log"
  $ErrorActionPreference = 'Continue'
  & "$bin/psql.exe" -X -At -h 127.0.0.1 -p $Port -U postgres -d $db -v ON_ERROR_STOP=1 -c $sql *> $log
  $code = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  Write-Host "$db $name exit=$code log=$log"
  if ($code -ne 0) { throw "$db $name failed" }
  return (Get-Content -LiteralPath $log -Raw).Trim()
}
function Create-Clone([string]$db) {
  & "$bin/createdb.exe" -h 127.0.0.1 -p $Port -U postgres -T $base $db
  if ($LASTEXITCODE -ne 0) { throw "createdb $db exit=$LASTEXITCODE" }
}
function Metadata-Snapshot([string]$db,[string]$name) {
  $query = @'
SELECT md5(
  (SELECT string_agg(md5(pg_get_functiondef(p.oid))||p.proowner::text||
    coalesce(p.proacl::text,''),'' ORDER BY p.oid)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE (n.nspname,p.proname) IN (VALUES
     ('app_private','sync_auto_adventure'),('public','consume_inventory_item'),
     ('public','purchase_game_item'),('app_private','adventure_pet_at')))
  || coalesce((SELECT string_agg(d.oid::text||d.defaclacl::text,',' ORDER BY d.oid)
     FROM pg_default_acl d),'')
  || (SELECT count(*)::text FROM public.game_items
      WHERE id::text LIKE 'b45e1000-%'))
'@
  return Invoke-Query $db $name $query
}
function Assert-No-Target([string]$db,[string]$name) {
  $query = @'
SELECT to_regclass('app_private.pet_food_catalog') IS NULL
  AND to_regclass('app_private.pet_care_state') IS NULL
  AND to_regclass('app_private.pet_feed_receipts') IS NULL
  AND to_regclass('app_private.pet_care_events') IS NULL
  AND to_regclass('app_private.pet_food_purchase_requests') IS NULL
  AND to_regprocedure('public.buy_pet_food(text,integer,uuid)') IS NULL
  AND to_regprocedure('app_private.settle_pet_care(uuid,timestamptz)') IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.game_items WHERE id::text LIKE 'b45e1000-%')
'@
  if ((Invoke-Query $db $name $query) -ne 't') { throw "$db left target objects/data" }
}
function Run-Pair([string]$db,[string]$name) {
  $file = Join-Path $here $name
  $args = @('-X','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d',$db,
    '-v','ON_ERROR_STOP=1','-f',$file)
  $one = Start-Process -FilePath "$bin/psql.exe" -ArgumentList $args -PassThru `
    -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs "$name-a.stdout.log") `
    -RedirectStandardError (Join-Path $logs "$name-a.stderr.log")
  Start-Sleep -Milliseconds 100
  $two = Start-Process -FilePath "$bin/psql.exe" -ArgumentList $args -PassThru `
    -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs "$name-b.stdout.log") `
    -RedirectStandardError (Join-Path $logs "$name-b.stderr.log")
  $one.WaitForExit(); $two.WaitForExit()
  Write-Output "$name pair exits=$($one.ExitCode),$($two.ExitCode)"
  if ($one.ExitCode -ne 0 -or $two.ExitCode -ne 0) { throw "$name pair failed" }
}
if (Test-Path -LiteralPath $RunDirectory) { throw "Existing run directory: $RunDirectory" }
if ($Port -eq 55783) { throw 'Port reserved by another integration cluster' }
foreach ($entry in $expected.GetEnumerator()) {
  $file = if ($entry.Key -eq 'local-consumer-source.sql') {
    Join-Path $here $entry.Key
  } else { Join-Path $repo "supabase/migrations/$($entry.Key)" }
  $hash = CanonicalHash $file
  if ($hash -ne $entry.Value) { throw "PET_CARE_SOURCE_SHA256_DRIFT $($entry.Key) $hash" }
}
try {
  & $reference -Port $Port -Database $base -RunDirectory $RunDirectory
  if (-not (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))) {
    throw 'Reference replay did not leave a PG17 cluster'
  }
  & "$bin/pg_ctl.exe" -D $data -l (Join-Path $logs 'server-pet-care.log') `
    -o "-h 127.0.0.1 -p $Port" start -w
  if ($LASTEXITCODE -ne 0) { throw "pg_ctl start exit=$LASTEXITCODE" }
  "HEAD=$(git -C $repo rev-parse HEAD)" | Set-Content (Join-Path $logs 'source-manifest.txt')
  foreach ($entry in ($expected.GetEnumerator() | Sort-Object Name)) {
    "$($entry.Key) LF_SHA256=$($entry.Value)" | Add-Content (Join-Path $logs 'source-manifest.txt')
  }
  "mission migration 20261029054922 omitted: reduced source lacks public.complete_mission(uuid,date)" `
    | Add-Content (Join-Path $logs 'source-manifest.txt')
  Invoke-Sql $base 'identity-fixture' (Join-Path $repo 'supabase/tests/pets_authoritative_20261026/live_identity_fixture.sql') | Out-Null
  Invoke-Query $base 'service-wrapper-fixture' 'GRANT EXECUTE ON FUNCTION public.sync_auto_adventure(), public.advance_auto_adventure(uuid) TO service_role' | Out-Null
  foreach ($name in $migrations) {
    Invoke-Sql $base $name (Join-Path $repo "supabase/migrations/$name") | Out-Null
  }
  Invoke-Sql $base 'local-consumer-install' (Join-Path $here 'local-consumer-install.sql') | Out-Null
  # Reduced economy replay omitted the earlier gold_history RLS; restore only
  # that known baseline property before testing the target preflight.
  Invoke-Query $base 'gold-history-rls-fixture' 'ALTER TABLE public.gold_history ENABLE ROW LEVEL SECURITY' | Out-Null
  Invoke-Sql $base 'existing-pet-fixture' (Join-Path $here 'existing_pet_fixture.sql') | Out-Null
  foreach ($db in @('pet_positive','pet_drift_body','pet_drift_acl',
      'pet_drift_overload','pet_drift_default_acl','pet_drift_membership',
      'pet_drift_default_table_direct','pet_drift_default_table_nested',
      'pet_drift_default_table_public','pet_drift_default_table_select_nested',
      'pet_drift_default_function_direct','pet_drift_default_function_nested',
      'pet_drift_owner')) {
    Create-Clone $db
  }
  Invoke-Sql 'pet_positive' 'migration' $migration | Out-Null
  foreach ($name in @('baseline.sql','functional.sql','battle.sql','acl.sql','concurrency_setup.sql')) {
    Invoke-Sql 'pet_positive' $name (Join-Path $here $name) | Out-Null
  }
  foreach ($relative in @(
    'supabase/tests/auto_potions_20261029/wrapper.sql',
    'supabase/tests/auto_potions_20261029/wrapper_mp_offline.sql',
    'supabase/tests/horde_20261028/pet_wrapper.sql',
    'supabase/tests/horde_20261028/catchup_benchmark.sql')) {
    Invoke-Sql 'pet_positive' "retained-$(Split-Path $relative -Leaf)" (Join-Path $repo $relative) | Out-Null
  }
  Run-Pair 'pet_positive' 'concurrent_buy.sql'
  Run-Pair 'pet_positive' 'concurrent_care.sql'
  Invoke-Sql 'pet_positive' 'concurrency_prepare_feed.sql' (Join-Path $here 'concurrency_prepare_feed.sql') | Out-Null
  Run-Pair 'pet_positive' 'concurrent_feed.sql'
  Invoke-Sql 'pet_positive' 'concurrency_assert.sql' (Join-Path $here 'concurrency_assert.sql') | Out-Null
  foreach ($kind in @('body','acl','overload','default_acl',
      'default_table_direct','default_table_nested',
      'default_table_public','default_table_select_nested',
      'default_function_direct','default_function_nested','owner')) {
    $db = "pet_drift_$kind"
    Invoke-Sql $db "mutate-$kind" (Join-Path $here "drift_$kind.sql") | Out-Null
    $before = Metadata-Snapshot $db "metadata-before-$kind"
    $log = Invoke-Sql $db "reject-$kind" $migration 3
    $expectedError = if ($kind -eq 'overload') { 'PET_CARE_OVERLOAD_OR_OBJECT_DRIFT' }
      elseif ($kind -like 'default*') { 'PET_CARE_TABLE_OR_DEFAULT_ACL_DRIFT' }
      else { 'PET_CARE_SOURCE_OR_ACL_DRIFT' }
    if (-not (Select-String -LiteralPath $log -Pattern $expectedError -Quiet)) {
      throw "$db rejected for unexpected reason"
    }
    Assert-No-Target $db "atomic-$kind"
    $after = Metadata-Snapshot $db "metadata-after-$kind"
    if ($after -ne $before) { throw "$db metadata changed after rejected migration" }
  }
  try {
    Invoke-Sql 'pet_drift_membership' 'mutate-membership' (Join-Path $here 'drift_membership.sql') | Out-Null
    $log = Invoke-Sql 'pet_drift_membership' 'reject-membership' $migration 3
    if (-not (Select-String -LiteralPath $log -Pattern 'PET_CARE_SOURCE_OR_ACL_DRIFT' -Quiet)) {
      throw 'role membership rejected for unexpected reason'
    }
    Assert-No-Target 'pet_drift_membership' 'atomic-membership'
  } finally {
    Invoke-Sql 'postgres' 'restore-membership' (Join-Path $here 'restore_membership.sql') | Out-Null
  }
  Write-Output "PET_CARE_LOCAL_PASS database=pet_positive port=$Port logs=$logs"
} finally {
  if (Test-Path -LiteralPath (Join-Path $data 'postmaster.pid')) {
    & "$bin/pg_ctl.exe" -D $data stop -m fast -w
    Write-Output "pg_ctl_stop_exit=$LASTEXITCODE"
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL teardown failed' }
    & "$bin/pg_isready.exe" -h 127.0.0.1 -p $Port -U postgres -d postgres
    Write-Output "pg_isready_after_stop_exit=$LASTEXITCODE"
    if ($LASTEXITCODE -ne 2) { throw "Listener remains on port $Port" }
  }
}
