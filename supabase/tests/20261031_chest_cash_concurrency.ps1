param([int]$Port = 55793,[string]$Database = 'chests_20261031',
  [string]$ArtifactDir = "$env:LOCALAPPDATA/Temp/rpg-cash-concurrency")
$ErrorActionPreference = 'Stop'
$bin = 'C:/Program Files/PostgreSQL/17/bin'
New-Item -ItemType Directory -Force -Path $ArtifactDir | Out-Null
function Sql([string]$query) {
  & "$bin/psql.exe" -X -A -t -h 127.0.0.1 -p $Port -U postgres -d $Database `
    -v ON_ERROR_STOP=1 -c $query
  if ($LASTEXITCODE -ne 0) { throw "psql exit=$LASTEXITCODE" }
}
try {
  Sql "UPDATE app_private.adventure_chest_cash_config SET price_id='pri_aaaaaaaaaaaaaaaaaaaaaaaaaa',enabled=true WHERE singleton=true"
  $user = '11111111-1111-1111-1111-111111111111'
  $queries = @(
    "SET ROLE service_role; SELECT public.prepare_adventure_chest_cash_order('$user','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')",
    "SET ROLE service_role; SELECT public.prepare_adventure_chest_cash_order('$user','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')"
  )
  $jobs = @()
  foreach ($query in $queries) {
    $jobs += Start-Job -ScriptBlock {
      param($psql,$port,$db,$sql)
      & $psql -X -A -t -h 127.0.0.1 -p $port -U postgres -d $db `
        -v ON_ERROR_STOP=1 -c $sql
      "exit=$LASTEXITCODE"
    } -ArgumentList "$bin/psql.exe",$Port,$Database,$query
  }
  $jobs | Wait-Job | Out-Null
  $outputs = @($jobs | ForEach-Object { Receive-Job $_ })
  $outputs | Set-Content (Join-Path $ArtifactDir 'prepare-output.txt')
  $jobs | Remove-Job
  if (@($outputs | Where-Object { $_ -eq 'exit=0' }).Count -ne 2) {
    throw "Concurrent prepare failed; see $ArtifactDir/prepare-output.txt"
  }
  $count = Sql "SELECT count(*) FROM app_private.adventure_chest_cash_orders WHERE user_id='$user'"
  if (($count | Select-Object -Last 1).Trim() -ne '1') {
    throw "Expected one order after contention, got $count"
  }
  Write-Output 'CONCURRENT_CASH_PREPARE_PASS two_calls=0/0 orders=1'
  $orderId = (Sql "SELECT id FROM app_private.adventure_chest_cash_orders WHERE user_id='$user'" | Select-Object -Last 1).Trim()
  $tx = 'txn_cccccccccccccccccccccccccc'
  $event = 'evt_dddddddddddddddddddddddddd'
  $price = 'pri_aaaaaaaaaaaaaaaaaaaaaaaaaa'
  Sql "SET ROLE service_role; SELECT public.attach_adventure_chest_cash_transaction('$orderId','$user','$tx')" | Out-Null
  $finish = "SET ROLE service_role; SELECT public.finalize_adventure_chest_cash_order('$tx','$event','$price',990,'BRL','live')"
  $jobs = @()
  foreach ($n in 1..2) {
    $jobs += Start-Job -ScriptBlock {
      param($psql,$port,$db,$sql)
      & $psql -X -A -t -h 127.0.0.1 -p $port -U postgres -d $db `
        -v ON_ERROR_STOP=1 -c $sql
      "exit=$LASTEXITCODE"
    } -ArgumentList "$bin/psql.exe",$Port,$Database,$finish
  }
  $jobs | Wait-Job | Out-Null
  $outputs = @($jobs | ForEach-Object { Receive-Job $_ })
  $outputs | Set-Content (Join-Path $ArtifactDir 'finalize-output.txt')
  $jobs | Remove-Job
  if (@($outputs | Where-Object { $_ -eq 'exit=0' }).Count -ne 2) {
    throw "Concurrent finalize failed; see $ArtifactDir/finalize-output.txt"
  }
  $receiptCount = (Sql "SELECT count(*) FROM app_private.adventure_chest_cash_receipts WHERE transaction_id='$tx'" | Select-Object -Last 1).Trim()
  if ($receiptCount -ne '1') { throw "Expected one receipt after contention, got $receiptCount" }
  Write-Output 'CONCURRENT_CASH_FINALIZE_PASS two_calls=0/0 receipts=1'
} finally {
  Sql "DELETE FROM app_private.adventure_chest_cash_orders WHERE user_id='11111111-1111-1111-1111-111111111111'"
  Sql "DELETE FROM app_private.adventure_chest_cash_receipts WHERE transaction_id='txn_cccccccccccccccccccccccccc'"
  Sql "UPDATE app_private.adventure_chest_cash_config SET price_id=NULL,enabled=false WHERE singleton=true"
}
