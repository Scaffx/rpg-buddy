param([int]$Port = 55442, [string]$Database = 'a4_full')

$ErrorActionPreference = 'Stop'
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$uid = 'c4c4c4c4-cccc-cccc-cccc-cccccccccccc'
$a = 'c4c4c4c4-cccc-cccc-cccc-cccccccccca1'
$b = 'c4c4c4c4-cccc-cccc-cccc-ccccccccccb2'
$days = '["Dom","Seg","Ter","Qua","Qui","Sex","Sab"]'
$seed = @"
INSERT INTO auth.users(id,email) VALUES ('$uid','a4-concurrent@example.invalid');
SET request.jwt.claim.sub = '$uid';
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,days_of_week)
SELECT '$a','$uid','lock-a',id,'baixa','$days'::jsonb
FROM public.attributes WHERE user_id = '$uid';
INSERT INTO public.missions(id,user_id,title,attribute_id,priority,days_of_week)
SELECT '$b','$uid','lock-b',id,'baixa','$days'::jsonb
FROM public.attributes WHERE user_id = '$uid';
"@
& $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -c $seed
if ($LASTEXITCODE -ne 0) { throw 'seed failed' }

$run = {
  param($exe, $port, $database, $sql)
  $output = & $exe -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d $database -c $sql 2>&1 | Out-String
  [pscustomobject]@{ Exit = $LASTEXITCODE; Output = $output }
}
$prefix = "SET ROLE authenticated; SET request.jwt.claim.sub = '$uid'; "
$one = $prefix + "BEGIN; UPDATE public.missions SET title=title||'1' WHERE id='$a'; SELECT pg_sleep(2); UPDATE public.missions SET title=title||'1' WHERE id='$b'; COMMIT;"
$two = $prefix + "BEGIN; UPDATE public.missions SET title=title||'2' WHERE id='$b'; COMMIT;"
$j1 = Start-Job -ScriptBlock $run -ArgumentList $psql,$Port,$Database,$one
Start-Sleep -Milliseconds 500
$j2 = Start-Job -ScriptBlock $run -ArgumentList $psql,$Port,$Database,$two
$null = Wait-Job -Job $j1,$j2 -Timeout 20
$results = @(Receive-Job $j1,$j2)
Remove-Job $j1,$j2
if ($results.Count -ne 2 -or @($results | Where-Object Exit -ne 0).Count -ne 0) {
  $results | Format-List | Out-String | Write-Output
  throw 'direct edit lock order failed'
}
$titles = & $psql -X -tA -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -c "SELECT string_agg(title,',' ORDER BY id) FROM public.missions WHERE id IN ('$a','$b')"
if ($LASTEXITCODE -ne 0 -or $titles.Trim() -ne 'lock-a1,lock-b12') { throw "direct edits lost a write: $titles" }

$one = $prefix + "BEGIN; SELECT public.complete_mission('$b',(now() AT TIME ZONE 'America/Sao_Paulo')::date); SELECT pg_sleep(2); COMMIT;"
$two = $prefix + "BEGIN; UPDATE public.missions SET title=title||'e' WHERE id='$b'; COMMIT;"
$j1 = Start-Job -ScriptBlock $run -ArgumentList $psql,$Port,$Database,$one
Start-Sleep -Milliseconds 500
$j2 = Start-Job -ScriptBlock $run -ArgumentList $psql,$Port,$Database,$two
$null = Wait-Job -Job $j1,$j2 -Timeout 20
$results = @(Receive-Job $j1,$j2)
Remove-Job $j1,$j2
if ($results.Count -ne 2 -or @($results | Where-Object Exit -ne 0).Count -ne 0) {
  $results | Format-List | Out-String | Write-Output
  throw 'RPC/edit lock order failed'
}
$state = & $psql -X -tA -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -c "SELECT m.title||':'||p.total_xp||':'||(SELECT count(*) FROM public.mission_daily_completions l WHERE l.mission_id=m.id) FROM public.missions m JOIN public.profiles p ON p.user_id=m.user_id WHERE m.id='$b'"
if ($LASTEXITCODE -ne 0 -or $state.Trim() -notmatch '^lock-b12e:[1-9][0-9]*:1$') { throw "RPC/edit result invalid: $state" }
Write-Output "A4 concurrency PASS: direct edits $titles; RPC/edit $state"
