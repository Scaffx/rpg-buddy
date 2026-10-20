param([int]$Port = 55463, [string]$Database = 'b4_concurrent')

$ErrorActionPreference = 'Stop'
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$uid = '00000000-0000-0000-0000-000000000026'
$seed = "SET app.uid = '$uid'; INSERT INTO public.missions(user_id,title,priority,days_of_week) VALUES (auth.uid(),'lock-a','baixa',jsonb_build_array('Seg')), (auth.uid(),'lock-b','baixa',jsonb_build_array('Seg'));"
& $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -c $seed | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'seed failed' }

$run = {
  param($exe, $port, $database, $sql)
  $output = & $exe -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d $database -c $sql 2>&1 | Out-String
  [pscustomobject]@{ Exit = $LASTEXITCODE; Output = $output }
}
$one = "SET app.uid = '$uid'; BEGIN; UPDATE public.missions SET title=title||'1' WHERE user_id=auth.uid() AND title='lock-a'; SELECT pg_sleep(2); UPDATE public.missions SET title=title||'1' WHERE user_id=auth.uid() AND title LIKE 'lock-b%'; COMMIT;"
$two = "SET app.uid = '$uid'; BEGIN; UPDATE public.missions SET title=title||'2' WHERE user_id=auth.uid() AND title LIKE 'lock-b%'; COMMIT;"
$j1 = Start-Job -ScriptBlock $run -ArgumentList $psql, $Port, $Database, $one
Start-Sleep -Milliseconds 500
$j2 = Start-Job -ScriptBlock $run -ArgumentList $psql, $Port, $Database, $two
$null = Wait-Job -Job $j1, $j2 -Timeout 20
$results = @(Receive-Job $j1, $j2)
Remove-Job $j1, $j2
if ($results.Count -ne 2 -or @($results | Where-Object Exit -ne 0).Count -ne 0) {
  $results | Format-List | Out-String | Write-Output
  throw 'row/advisory lock ordering failed'
}
$rows = & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -tAc "SELECT count(*) FROM public.missions WHERE user_id='$uid' AND title IN ('lock-a1','lock-b12')"
if ($LASTEXITCODE -ne 0 -or [int]$rows -ne 2) { throw "concurrent edits lost a write: $rows" }

$capUid = '00000000-0000-0000-0000-000000000027'
$seedCap = "SET app.uid = '$capUid'; ALTER TABLE public.missions DISABLE TRIGGER enforce_mission_priority; INSERT INTO public.missions(user_id,title,priority,days_of_week) SELECT auth.uid(),'paid-'||n,'alta',jsonb_build_array('Seg') FROM generate_series(1,5) n; ALTER TABLE public.missions ENABLE TRIGGER enforce_mission_priority; UPDATE public.missions SET daily_status=jsonb_build_object('2026-10-19','completed') WHERE user_id=auth.uid() AND title IN ('paid-1','paid-2','paid-3');"
& $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -c $seedCap | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'cap seed failed' }
$first = "SET app.uid = '$capUid'; BEGIN; UPDATE public.missions SET daily_status=jsonb_build_object('2026-10-19','completed') WHERE user_id=auth.uid() AND title='paid-4'; SELECT pg_sleep(2); COMMIT;"
$second = "SET app.uid = '$capUid'; UPDATE public.missions SET daily_status=jsonb_build_object('2026-10-19','completed') WHERE user_id=auth.uid() AND title='paid-5';"
$j1 = Start-Job -ScriptBlock $run -ArgumentList $psql, $Port, $Database, $first
Start-Sleep -Milliseconds 500
$j2 = Start-Job -ScriptBlock $run -ArgumentList $psql, $Port, $Database, $second
$null = Wait-Job -Job $j1, $j2 -Timeout 20
$results = @(Receive-Job $j1, $j2)
Remove-Job $j1, $j2
if ($results.Count -ne 2 -or @($results | Where-Object Exit -eq 0).Count -ne 1 -or
    @($results | Where-Object Exit -ne 0).Count -ne 1 -or
    ($results | Where-Object Exit -ne 0 | Select-Object -First 1).Output -notmatch 'MISSION_PRIORITY_PAID_CAP') {
  $results | Format-List | Out-String | Write-Output
  throw 'concurrent paid cap failed'
}
$state = & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -tAc "SELECT (SELECT count(*) FROM private.mission_priority_paid_days WHERE user_id='$capUid' AND priority='alta' AND day='2026-10-19') || ':' || (SELECT count(*) FROM public.missions WHERE user_id='$capUid' AND title='paid-5' AND daily_status ? '2026-10-19')"
if ($LASTEXITCODE -ne 0 -or $state.Trim() -ne '4:0') { throw "paid cap left partial write: $state" }

$mutationUid = '00000000-0000-0000-0000-000000000028'
$mutationSeed = "SET app.uid = '$mutationUid'; INSERT INTO public.missions(user_id,title,priority,days_of_week) VALUES (auth.uid(),'mutation-a','baixa',jsonb_build_array('Seg')); INSERT INTO public.missions(user_id,title,priority,days_of_week,status,completed) VALUES (auth.uid(),'mutation-b','baixa',jsonb_build_array('Seg'),'arquivada',true);"
& $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -c $mutationSeed | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'mutation seed failed' }
$first = "SET app.uid = '$mutationUid'; BEGIN; UPDATE public.missions SET status='arquivada',completed=true WHERE user_id=auth.uid() AND title='mutation-a'; SELECT pg_sleep(2); DELETE FROM public.missions WHERE user_id=auth.uid() AND title='mutation-a'; INSERT INTO public.missions(user_id,title,priority,days_of_week) VALUES (auth.uid(),'mutation-c','baixa',jsonb_build_array('Seg')); COMMIT;"
$second = "SET app.uid = '$mutationUid'; UPDATE public.missions SET status='pendente',completed=false WHERE user_id=auth.uid() AND title='mutation-b';"
$j1 = Start-Job -ScriptBlock $run -ArgumentList $psql, $Port, $Database, $first
Start-Sleep -Milliseconds 500
$j2 = Start-Job -ScriptBlock $run -ArgumentList $psql, $Port, $Database, $second
$null = Wait-Job -Job $j1, $j2 -Timeout 20
$results = @(Receive-Job $j1, $j2)
Remove-Job $j1, $j2
if ($results.Count -ne 2 -or @($results | Where-Object Exit -ne 0).Count -ne 0) {
  $results | Format-List | Out-String | Write-Output
  throw 'archive/delete/create/reactivate race failed'
}
$mutations = & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -tAc "SELECT count(*) FROM public.missions WHERE user_id='$mutationUid' AND title IN ('mutation-b','mutation-c') AND status='pendente' AND NOT completed"
if ($LASTEXITCODE -ne 0 -or [int]$mutations -ne 2) { throw "mutations left partial state: $mutations" }
Write-Output 'priority_caps_corrective_concurrency: PASS (edit, grant, archive/delete/create/reactivate races)'
