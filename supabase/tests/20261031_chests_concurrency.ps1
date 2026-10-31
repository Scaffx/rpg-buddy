param(
  [int]$Port = 55791,
  [string]$Database = 'chests_20261031',
  [string]$ArtifactDir
)
$ErrorActionPreference = 'Stop'
$psql = 'C:/Program Files/PostgreSQL/17/bin/psql.exe'
New-Item -ItemType Directory -Force -Path $ArtifactDir | Out-Null
$uid = '22222222-2222-2222-2222-222222222222'
$queued = '31000000-0000-4000-8000-000000000201'
$request = '31000000-0000-4000-8000-000000000202'
function Run-Psql([string]$sql) {
  & $psql -X -A -t -h 127.0.0.1 -p $Port -U postgres -d $Database `
    -v ON_ERROR_STOP=1 -c $sql
  if ($LASTEXITCODE -ne 0) { throw "psql exit=$LASTEXITCODE $sql" }
}
Run-Psql "UPDATE public.user_balance SET gold=100000 WHERE user_id='$uid'"
Run-Psql "INSERT INTO app_private.adventure_chests(id,user_id,battle_id,rarity,hero_class,hero_level,gold_amount,scrap_amount,essence_material,essence_amount,potion_amount,open_hours,acquired_at) VALUES('$queued','$uid','31000000-0000-4000-8000-000000000211','comum','mago',80,40,2,'normal',0,0,1,clock_timestamp())"
$startA = Join-Path $ArtifactDir 'start-a.sql'
$startB = Join-Path $ArtifactDir 'start-b.sql'
@"
\set ON_ERROR_STOP on
SELECT id AS chest_id FROM app_private.adventure_chests
WHERE user_id='$uid' AND status='queued' AND id<>'$queued' LIMIT 1 \gset
BEGIN;
SET ROLE authenticated;
SET request.jwt.claim.sub='$uid';
SELECT public.start_adventure_chest(:'chest_id'::uuid);
\echo FIRST_STARTED
SELECT pg_sleep(2);
COMMIT;
"@ | Set-Content -LiteralPath $startA -Encoding utf8
@"
\set ON_ERROR_STOP on
SET ROLE authenticated;
SET request.jwt.claim.sub='$uid';
SELECT public.start_adventure_chest('$queued'::uuid);
"@ | Set-Content -LiteralPath $startB -Encoding utf8
function Start-Tab([string]$file,[string]$name) {
  $stdout = Join-Path $ArtifactDir "$name.out"
  $stderr = Join-Path $ArtifactDir "$name.err"
  $args = @('-X','-A','-t','-h','127.0.0.1','-p',"$Port",'-U','postgres',
    '-d',$Database,'-v','ON_ERROR_STOP=1','-f',$file)
  $p = Start-Process -FilePath $psql -ArgumentList $args -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  return @{ Process=$p; Out=$stdout; Err=$stderr }
}
function Await-Marker([string]$file,[string]$marker) {
  $deadline=[DateTime]::UtcNow.AddSeconds(10)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ((Test-Path -LiteralPath $file) -and
      ((Get-Content -LiteralPath $file -Raw -ErrorAction SilentlyContinue) -match $marker)) { return }
    Start-Sleep -Milliseconds 100
  }
  throw "Marker missing: $marker"
}
$a=Start-Tab $startA 'start-a'
Await-Marker $a.Out 'FIRST_STARTED'
$b=Start-Tab $startB 'start-b'
$a.Process.WaitForExit(15000) | Out-Null
$b.Process.WaitForExit(15000) | Out-Null
if (-not $a.Process.HasExited -or -not $b.Process.HasExited) { throw 'start test timeout' }
if ($a.Process.ExitCode -ne 0 -or $b.Process.ExitCode -ne 3 -or
  (Get-Content -LiteralPath $b.Err -Raw) -notmatch 'CHEST_OPENING_CAP') {
  throw "start contention failed A=$($a.Process.ExitCode) B=$($b.Process.ExitCode)"
}
$active = Run-Psql "SELECT count(*) FROM app_private.adventure_chests WHERE user_id='$uid' AND status='opening'"
if ($active -ne '1') { throw "cap1 contention active=$active" }
Write-Output 'CONCURRENT_START_CAP1_PASS first=0 second=3 active=1'

$buyA=Join-Path $ArtifactDir 'buy-a.sql'
$buyB=Join-Path $ArtifactDir 'buy-b.sql'
@"
\set ON_ERROR_STOP on
BEGIN;
SET ROLE authenticated;
SET request.jwt.claim.sub='$uid';
SELECT public.buy_adventure_chest_opening(2,'$request'::uuid);
\echo FIRST_BOUGHT
SELECT pg_sleep(2);
COMMIT;
"@ | Set-Content -LiteralPath $buyA -Encoding utf8
@"
\set ON_ERROR_STOP on
SET ROLE authenticated;
SET request.jwt.claim.sub='$uid';
SELECT public.buy_adventure_chest_opening(2,'$request'::uuid);
"@ | Set-Content -LiteralPath $buyB -Encoding utf8
$a=Start-Tab $buyA 'buy-a'
Await-Marker $a.Out 'FIRST_BOUGHT'
$b=Start-Tab $buyB 'buy-b'
$a.Process.WaitForExit(15000) | Out-Null
$b.Process.WaitForExit(15000) | Out-Null
if (-not $a.Process.HasExited -or -not $b.Process.HasExited) { throw 'buy test timeout' }
if ($a.Process.ExitCode -ne 0 -or $b.Process.ExitCode -ne 0 -or
  (Get-Content -LiteralPath $a.Out -Raw) -notmatch '"replayed": false' -or
  (Get-Content -LiteralPath $b.Out -Raw) -notmatch '"replayed": true') {
  throw "buy contention failed A=$($a.Process.ExitCode) B=$($b.Process.ExitCode)"
}
$proof = Run-Psql "SELECT (SELECT count(*) FROM app_private.adventure_chest_opening_purchase_receipts WHERE user_id='$uid' AND request_id='$request')::text || '|' || (SELECT count(*) FROM public.gold_history WHERE user_id='$uid' AND type='compra_bau_abertura')::text || '|' || (SELECT gold FROM public.user_balance WHERE user_id='$uid')::text"
if ($proof -ne '1|1|94000') { throw "purchase atomicity proof=$proof" }
Write-Output 'CONCURRENT_PURCHASE_REPLAY_PASS first=0 second=0 receipts=1 debits=1 gold=94000'

Run-Psql "ALTER TABLE app_private.adventure_chests DISABLE TRIGGER adventure_chest_frozen"
Run-Psql "WITH test_clock AS MATERIALIZED (SELECT clock_timestamp()-interval '2 minutes' AS ready) UPDATE app_private.adventure_chests c SET started_at=test_clock.ready-make_interval(hours=>c.open_hours),ready_at=test_clock.ready FROM test_clock WHERE c.user_id='$uid' AND c.status='opening'"
Run-Psql "ALTER TABLE app_private.adventure_chests ENABLE TRIGGER adventure_chest_frozen"
$claimA=Join-Path $ArtifactDir 'claim-a.sql'
$claimB=Join-Path $ArtifactDir 'claim-b.sql'
@"
\set ON_ERROR_STOP on
SELECT id AS chest_id FROM app_private.adventure_chests
WHERE user_id='$uid' AND status='opening' LIMIT 1 \gset
BEGIN;
SET ROLE authenticated;
SET request.jwt.claim.sub='$uid';
SELECT public.claim_adventure_chest(:'chest_id'::uuid);
\echo FIRST_CLAIMED
SELECT pg_sleep(2);
COMMIT;
"@ | Set-Content -LiteralPath $claimA -Encoding utf8
@"
\set ON_ERROR_STOP on
SELECT id AS chest_id FROM app_private.adventure_chests
WHERE user_id='$uid' AND status='opening' LIMIT 1 \gset
SET ROLE authenticated;
SET request.jwt.claim.sub='$uid';
SELECT public.claim_adventure_chest(:'chest_id'::uuid);
"@ | Set-Content -LiteralPath $claimB -Encoding utf8
$a=Start-Tab $claimA 'claim-a'
Await-Marker $a.Out 'FIRST_CLAIMED'
$b=Start-Tab $claimB 'claim-b'
$a.Process.WaitForExit(15000) | Out-Null
$b.Process.WaitForExit(15000) | Out-Null
if (-not $a.Process.HasExited -or -not $b.Process.HasExited) { throw 'claim test timeout' }
if ($a.Process.ExitCode -ne 0 -or $b.Process.ExitCode -ne 0 -or
  (Get-Content -LiteralPath $a.Out -Raw) -notmatch '"replayed": false' -or
  (Get-Content -LiteralPath $b.Out -Raw) -notmatch '"replayed": true') {
  throw "claim contention failed A=$($a.Process.ExitCode) B=$($b.Process.ExitCode)"
}
$claimProof = Run-Psql "SELECT (SELECT count(*) FROM app_private.adventure_chest_claim_receipts WHERE user_id='$uid')::text || '|' || (SELECT count(*) FROM public.gold_history WHERE user_id='$uid' AND type='adventure_chest')::text || '|' || (SELECT quantity FROM public.user_inventory WHERE user_id='$uid' AND item_id='31000000-0000-4000-8000-000000000103')::text"
if ($claimProof -ne '1|1|1') { throw "claim atomicity proof=$claimProof" }
Write-Output 'CONCURRENT_CLAIM_REPLAY_PASS first=0 second=0 receipts=1 credits=1 gear=1'
