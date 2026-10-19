param([int]$Port = 55463, [string]$Database = 'b4_integrated3')

$ErrorActionPreference = 'Stop'
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$uid = '00000000-0000-0000-0000-000000000034'
$missionA = '10000000-0000-0000-0000-000000000034'
$missionB = '10000000-0000-0000-0000-000000000035'
$seed = "INSERT INTO auth.users(id,email) VALUES ('$uid','b4-race@example.invalid'); SET request.jwt.claim.sub='$uid'; INSERT INTO public.missions(id,user_id,title,priority,days_of_week) VALUES ('$missionA',auth.uid(),'race-a','alta',jsonb_build_array('Seg')),('$missionB',auth.uid(),'race-b','alta',jsonb_build_array('Seg'));"
& $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -c $seed | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'RPC race seed failed' }

$run = {
  param($exe, $port, $database, $sql)
  $output = & $exe -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d $database -c $sql 2>&1 | Out-String
  [pscustomobject]@{ Exit = $LASTEXITCODE; Output = $output }
}
$first = "SET request.jwt.claim.sub='$uid'; BEGIN; SELECT public.complete_mission('$missionA',DATE '2026-10-19'); SELECT pg_sleep(2); SELECT public.undo_mission('$missionA',DATE '2026-10-19'); COMMIT;"
$second = "SET request.jwt.claim.sub='$uid'; SELECT public.complete_mission('$missionB',DATE '2026-10-19');"
$j1 = Start-Job -ScriptBlock $run -ArgumentList $psql, $Port, $Database, $first
Start-Sleep -Milliseconds 500
$j2 = Start-Job -ScriptBlock $run -ArgumentList $psql, $Port, $Database, $second
$null = Wait-Job -Job $j1, $j2 -Timeout 20
$results = @(Receive-Job $j1, $j2)
Remove-Job $j1, $j2
if ($results.Count -ne 2 -or @($results | Where-Object Exit -ne 0).Count -ne 0) {
  $results | Format-List | Out-String | Write-Output
  throw 'concurrent complete/undo failed'
}
$state = & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -tAc "SELECT p.total_xp || ':' || p.missions_completed || ':' || (SELECT count(*) FROM public.mission_daily_completions WHERE user_id='$uid' AND completion_date='2026-10-19') || ':' || (SELECT count(*) FROM private.mission_priority_paid_days WHERE user_id='$uid' AND priority='alta' AND day='2026-10-19') FROM public.profiles p WHERE p.user_id='$uid'"
if ($LASTEXITCODE -ne 0 -or $state.Trim() -ne '50:1:1:2') {
  throw "concurrent complete/undo left inconsistent profile or ledgers: $state"
}
Write-Output 'priority_caps_corrective_rpc_concurrency: PASS (complete/undo serial, net 50 XP, one current ledger, two durable reservations)'
