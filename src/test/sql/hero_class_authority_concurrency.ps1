param(
  [int]$Port = 55438,
  [string]$Database = 'hero_class_assert2'
)
$ErrorActionPreference = 'Stop'
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$uid = '00000000-0000-0000-0000-000000000002'
$first = "SET ROLE authenticated; SET request.jwt.claim.sub = '$uid'; BEGIN; SELECT public.perform_class_respec('guerreiro'); SELECT pg_sleep(3); COMMIT;"
$second = "SET ROLE authenticated; SET request.jwt.claim.sub = '$uid'; SELECT public.perform_class_respec('ferreiro');"
$jobA = Start-Job -ScriptBlock {
  param($Executable,$DbPort,$DbName,$Sql)
  $output = & $Executable -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $DbPort -U postgres -d $DbName -c $Sql 2>&1
  [pscustomobject]@{ Exit = $LASTEXITCODE; Output = ($output -join [Environment]::NewLine) }
} -ArgumentList $psql,$Port,$Database,$first
Start-Sleep -Milliseconds 700
$jobB = Start-Job -ScriptBlock {
  param($Executable,$DbPort,$DbName,$Sql)
  $output = & $Executable -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $DbPort -U postgres -d $DbName -c $Sql 2>&1
  [pscustomobject]@{ Exit = $LASTEXITCODE; Output = ($output -join [Environment]::NewLine) }
} -ArgumentList $psql,$Port,$Database,$second
$null = Wait-Job -Job $jobA,$jobB
$resultA = Receive-Job $jobA
$resultB = Receive-Job $jobB
Remove-Job $jobA,$jobB
if ($resultA.Exit -ne 0 -or $resultB.Exit -eq 0 -or
    $resultB.Output -notmatch 'INSUFFICIENT_GOLD') {
  throw "Concurrent respec unexpected: A=$($resultA.Exit) B=$($resultB.Exit): $($resultB.Output)"
}
$state = & $psql -X -At -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -c "
SELECT p.starter_class || ':' || b.gold || ':' ||
  (SELECT count(*) FROM public.gold_history h WHERE h.user_id=p.user_id)
FROM public.profiles p JOIN public.user_balance b USING(user_id)
WHERE p.user_id='$uid';"
if ($LASTEXITCODE -ne 0 -or $state.Trim() -ne 'guerreiro:80:2') {
  throw "Concurrent respec state unexpected: $state"
}
'HERO_CLASS_CONCURRENCY_PASS'
