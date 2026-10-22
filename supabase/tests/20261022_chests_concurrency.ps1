param(
  [string]$PgBin = 'C:/Program Files/PostgreSQL/17/bin',
  [int]$Port = 55439,
  [string]$ArtifactDir = 'C:/Users/Murillo/AppData/Local/Temp/rpg-chests-pg17-20261022/concurrency'
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path $ArtifactDir -Force | Out-Null
$psql = Join-Path $PgBin 'psql.exe'
$firstSql = Join-Path $ArtifactDir 'tab-a.sql'
$secondSql = Join-Path $ArtifactDir 'tab-b.sql'
$firstOut = Join-Path $ArtifactDir 'tab-a.out'
$secondOut = Join-Path $ArtifactDir 'tab-b.out'
$firstErr = Join-Path $ArtifactDir 'tab-a.err'
$secondErr = Join-Path $ArtifactDir 'tab-b.err'
@'
\set ON_ERROR_STOP on
SELECT id AS chest_id FROM app_private.adventure_chests
WHERE user_id='11111111-1111-1111-1111-111111111111' AND status='opening' \gset
BEGIN;
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT public.claim_adventure_chest(:'chest_id'::uuid);
\echo FIRST_CLAIMED
SELECT pg_sleep(3);
COMMIT;
'@ | Set-Content -LiteralPath $firstSql -Encoding utf8
@'
\set ON_ERROR_STOP on
SELECT id AS chest_id FROM app_private.adventure_chests
WHERE user_id='11111111-1111-1111-1111-111111111111' AND status='opening' \gset
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
SELECT public.claim_adventure_chest(:'chest_id'::uuid);
'@ | Set-Content -LiteralPath $secondSql -Encoding utf8
$argsA = @('-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1',
  '-p',"$Port",'-U','postgres','-d','chests','-f',$firstSql)
$argsB = @('-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-h','127.0.0.1',
  '-p',"$Port",'-U','postgres','-d','chests','-f',$secondSql)
$tabA = Start-Process -FilePath $psql -ArgumentList $argsA -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput $firstOut -RedirectStandardError $firstErr
$deadline = [DateTime]::UtcNow.AddSeconds(10)
while ([DateTime]::UtcNow -lt $deadline) {
  if ((Test-Path -LiteralPath $firstOut) -and
      ((Get-Content -LiteralPath $firstOut -Raw -ErrorAction SilentlyContinue) -match 'FIRST_CLAIMED')) { break }
  Start-Sleep -Milliseconds 100
}
$watch = [Diagnostics.Stopwatch]::StartNew()
$tabB = Start-Process -FilePath $psql -ArgumentList $argsB -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput $secondOut -RedirectStandardError $secondErr
$tabA.WaitForExit(20000) | Out-Null
$tabB.WaitForExit(20000) | Out-Null
$watch.Stop()
if (-not $tabA.HasExited -or -not $tabB.HasExited) { throw 'claim process timeout' }
$a = Get-Content -LiteralPath $firstOut -Raw
$b = Get-Content -LiteralPath $secondOut -Raw
Write-Output "tab-a exit=$($tabA.ExitCode); tab-b exit=$($tabB.ExitCode); tab-b elapsed=$([Math]::Round($watch.Elapsed.TotalSeconds,2))s"
Write-Output "tab-a: $a"
Write-Output "tab-b: $b"
if ($tabA.ExitCode -ne 0 -or $tabB.ExitCode -ne 0) {
  Write-Output (Get-Content -LiteralPath $firstErr -Raw)
  Write-Output (Get-Content -LiteralPath $secondErr -Raw)
  throw 'concurrent claim failed'
}
if ($a -notmatch '"replayed": false' -or $b -notmatch '"replayed": true' -or
    $watch.Elapsed.TotalSeconds -lt 2.0) {
  throw 'two-tab receipt or contention assertion failed'
}
$checkSql = @'
SELECT CASE WHEN
  (SELECT count(*) FROM app_private.adventure_chest_claim_receipts
    WHERE user_id='11111111-1111-1111-1111-111111111111')=1
  AND (SELECT count(*) FROM public.gold_history
    WHERE user_id='11111111-1111-1111-1111-111111111111' AND type='adventure_chest')=1
  AND (SELECT total_xp FROM public.profiles
    WHERE user_id='11111111-1111-1111-1111-111111111111')=0
  AND (SELECT count(*) FROM app_private.adventure_chests
    WHERE user_id='11111111-1111-1111-1111-111111111111' AND status='opening')=0
THEN 'PASS' ELSE 'FAIL' END;
'@
$result = $checkSql | & $psql -X -q -A -t -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d chests
Write-Output "atomicity=$result"
if ($LASTEXITCODE -ne 0 -or $result -ne 'PASS') { throw 'atomicity check failed' }
