param(
  [int]$Port = 55420,
  [string]$Database = 'inventory_assert2'
)

$ErrorActionPreference = 'Stop'
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$baseArgs = @('-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', "$Port", '-U', 'postgres', '-d', $Database)
$userId = '00000000-0000-0000-0000-000000000001'
$itemId = '10000000-0000-0000-0000-000000000004'

$setup = @'
CREATE OR REPLACE FUNCTION public.fixture_slow_purchase() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(1); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS fixture_slow_purchase ON public.inventory_purchase_requests;
CREATE TRIGGER fixture_slow_purchase AFTER INSERT ON public.inventory_purchase_requests
FOR EACH ROW EXECUTE FUNCTION public.fixture_slow_purchase();
'@
& $psql @baseArgs -c $setup | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Concurrency fixture setup failed' }

function Invoke-Pair([string]$requestA, [string]$requestB, [int]$expectedDebit, [int]$expectedQuantityGain) {
  $before = (& $psql @baseArgs -At -c "SELECT gold FROM public.user_balance WHERE user_id='$userId'").Trim()
  $beforeQuantity = (& $psql @baseArgs -At -c "SELECT COALESCE((SELECT quantity FROM public.user_inventory WHERE user_id='$userId' AND item_id='$itemId'),0)").Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Could not read starting gold' }
  $sqlA = "SET ROLE authenticated; SET request.jwt.claim.sub='$userId'; SELECT public.purchase_game_item('$itemId','$requestA');"
  $sqlB = "SET ROLE authenticated; SET request.jwt.claim.sub='$userId'; SELECT public.purchase_game_item('$itemId','$requestB');"
  $jobs = @(
    Start-Job -ScriptBlock { param($exe,$argsList,$sql) & $exe @argsList -c $sql; if ($LASTEXITCODE -ne 0) { throw "psql exit $LASTEXITCODE" } } -ArgumentList $psql,$baseArgs,$sqlA
    Start-Job -ScriptBlock { param($exe,$argsList,$sql) & $exe @argsList -c $sql; if ($LASTEXITCODE -ne 0) { throw "psql exit $LASTEXITCODE" } } -ArgumentList $psql,$baseArgs,$sqlB
  )
  $jobs | Wait-Job | Out-Null
  $jobs | Receive-Job | Out-Null
  if (@($jobs | Where-Object State -ne 'Completed').Count -ne 0) { throw 'Concurrent psql call failed' }
  $after = (& $psql @baseArgs -At -c "SELECT gold FROM public.user_balance WHERE user_id='$userId'").Trim()
  $quantity = (& $psql @baseArgs -At -c "SELECT quantity FROM public.user_inventory WHERE user_id='$userId' AND item_id='$itemId'").Trim()
  if ([int]$before - [int]$after -ne $expectedDebit -or [int]$quantity - [int]$beforeQuantity -ne $expectedQuantityGain) {
    throw "Incorrect concurrent result: debit=$([int]$before - [int]$after), quantity gain=$([int]$quantity - [int]$beforeQuantity)"
  }
}

Invoke-Pair '30000000-0000-0000-0000-000000000001' '30000000-0000-0000-0000-000000000001' 20 1
Invoke-Pair '30000000-0000-0000-0000-000000000002' '30000000-0000-0000-0000-000000000003' 40 2
Write-Output 'INVENTORY_CONCURRENCY_ASSERTIONS_PASSED'
