param([int]$Port = 55439, [string]$Database = 'postgres')

$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$uid = '00000000-0000-0000-0000-000000000008'
$seed = "SET app.uid = '$uid'; INSERT INTO public.missions (user_id, priority, days_of_week) SELECT auth.uid(), 'alta', '[`"Sab`"]' FROM generate_series(1, 3);"
& $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -c $seed | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'seed failed' }

$first = "SET app.uid = '$uid'; BEGIN; INSERT INTO public.missions (user_id, priority, days_of_week) VALUES (auth.uid(), 'alta', '[`"Sab`"]'); SELECT pg_sleep(3); COMMIT;"
$second = "SET app.uid = '$uid'; INSERT INTO public.missions (user_id, priority, days_of_week) VALUES (auth.uid(), 'alta', '[`"Sab`"]');"
$script = {
  param($exe, $port, $database, $sql)
  $output = & $exe -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d $database -c $sql 2>&1 | Out-String
  [pscustomobject]@{ Exit = $LASTEXITCODE; Output = $output }
}
$job1 = Start-Job -ScriptBlock $script -ArgumentList $psql, $Port, $Database, $first
Start-Sleep -Milliseconds 700
$job2 = Start-Job -ScriptBlock $script -ArgumentList $psql, $Port, $Database, $second
$null = Wait-Job -Job $job1, $job2 -Timeout 20
$results = @(Receive-Job $job1, $job2)
Remove-Job $job1, $job2
if ($results.Count -ne 2 -or @($results | Where-Object Exit -eq 0).Count -ne 1 -or
    @($results | Where-Object Exit -ne 0).Count -ne 1 -or
    ($results | Where-Object Exit -ne 0 | Select-Object -First 1).Output -notmatch 'MISSION_PRIORITY_CAP') {
  $results | Format-List | Out-String | Write-Output
  throw 'concurrent cap test failed'
}
$count = & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -tAc "SELECT count(*) FROM public.missions WHERE user_id = '$uid' AND priority = 'alta'"
if ($LASTEXITCODE -ne 0 -or [int]$count -ne 4) { throw "expected 4 rows, got $count" }
Write-Output 'priority_caps_concurrency: PASS (one insert committed, one MISSION_PRIORITY_CAP)'
