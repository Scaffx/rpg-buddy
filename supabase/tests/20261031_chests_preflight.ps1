param(
  [int]$Port = 55791,
  [string]$Database = 'chests_20261031',
  [string]$ArtifactDir,
  [string]$Migration
)
$ErrorActionPreference = 'Stop'
$bin='C:/Program Files/PostgreSQL/17/bin'
New-Item -ItemType Directory -Force -Path $ArtifactDir | Out-Null
foreach ($case in @('acl','hash')) {
  $clone="${Database}_drift_$case"
  & "$bin/createdb.exe" -h 127.0.0.1 -p $Port -U postgres -T $Database $clone
  if ($LASTEXITCODE -ne 0) { throw "createdb drift $case exit=$LASTEXITCODE" }
  $drift = if ($case -eq 'acl') {
    'GRANT EXECUTE ON FUNCTION public.claim_adventure_chest(uuid) TO anon'
  } else {
    'ALTER FUNCTION app_private.adventure_chest_payload(app_private.adventure_chests) SET search_path TO public'
  }
  & "$bin/psql.exe" -X -A -t -h 127.0.0.1 -p $Port -U postgres -d $clone `
    -v ON_ERROR_STOP=1 -c $drift *> (Join-Path $ArtifactDir "$case-drift.log")
  if ($LASTEXITCODE -ne 0) { throw "drift setup $case exit=$LASTEXITCODE" }
  & "$bin/psql.exe" -X -A -t -h 127.0.0.1 -p $Port -U postgres -d $clone `
    -v ON_ERROR_STOP=1 -f $Migration *> (Join-Path $ArtifactDir "$case-migration.log")
  $exit=$LASTEXITCODE
  $log=Get-Content -LiteralPath (Join-Path $ArtifactDir "$case-migration.log") -Raw
  $expected=if ($case -eq 'acl') { 'CHEST_V2_SOURCE_OR_ACL_DRIFT' }
    else { 'CHEST_V2_SOURCE_HASH_DRIFT' }
  if ($exit -ne 3 -or $log -notmatch $expected) {
    throw "preflight $case expected exit3 $expected; exit=$exit"
  }
  $count=& "$bin/psql.exe" -X -A -t -h 127.0.0.1 -p $Port -U postgres -d $clone `
    -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_class WHERE oid=to_regclass('app_private.adventure_chest_opening_entitlements')"
  if ($LASTEXITCODE -ne 0 -or $count -ne '0') { throw "preflight $case mutated schema" }
  Write-Output "PREFLIGHT_${case}_DENIED exit=3 no_mutation=1"
}
