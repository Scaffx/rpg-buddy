param([int]$Port = 55432, [string]$Database = 'crafting_verify2')
$ErrorActionPreference = 'Stop'
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
$baseArgs = @('-X','-At','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',"$Port",'-U','postgres','-d',$Database)
$userId = '11111111-1111-1111-1111-111111111111'
$env:PGCLIENTENCODING = 'UTF8'
$recipeId = (& $psql @baseArgs -c "SELECT recipe_id FROM app_private.boss_recipe_unlocks WHERE user_id='$userId' AND stage=10").Trim()
if ($LASTEXITCODE -ne 0 -or -not $recipeId) { throw 'Recipe lookup failed' }
$itemId = (& $psql @baseArgs -c "SELECT item_id FROM app_private.boss_recipe_catalog WHERE id='$recipeId'").Trim()
if ($LASTEXITCODE -ne 0 -or -not $itemId) { throw 'Item lookup failed' }
& $psql @baseArgs -c "SELECT app_private.credit_adventure_material('$userId','scrap',20,'test_topup','00000000-0000-0000-0000-000000009001'); SELECT app_private.credit_adventure_material('$userId','normal',5,'test_topup','00000000-0000-0000-0000-000000009001');" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Material topup failed' }

function Invoke-Pair([string]$requestA, [string]$requestB, [int]$expectedDebit, [int]$expectedGain) {
  $beforeGold = [int]((& $psql @baseArgs -c "SELECT gold FROM public.user_balance WHERE user_id='$userId'").Trim())
  $beforeQuantity = [int]((& $psql @baseArgs -c "SELECT quantity FROM public.user_inventory WHERE user_id='$userId' AND item_id='$itemId'").Trim())
  $beforeXp = [int]((& $psql @baseArgs -c "SELECT total_xp FROM public.profiles WHERE user_id='$userId'").Trim())
  $callA = "SET ROLE authenticated; SET request.jwt.claim.sub='$userId'; SELECT public.craft_boss_recipe('$recipeId','$requestA');"
  $callB = "SET ROLE authenticated; SET request.jwt.claim.sub='$userId'; SELECT public.craft_boss_recipe('$recipeId','$requestB');"
  $jobs = @(
    Start-Job -ScriptBlock { param($exe,$argsList,$sql) & $exe @argsList -c $sql; if ($LASTEXITCODE -ne 0) { throw "psql exit $LASTEXITCODE" } } -ArgumentList $psql,$baseArgs,$callA
    Start-Job -ScriptBlock { param($exe,$argsList,$sql) & $exe @argsList -c $sql; if ($LASTEXITCODE -ne 0) { throw "psql exit $LASTEXITCODE" } } -ArgumentList $psql,$baseArgs,$callB
  )
  $jobs | Wait-Job | Out-Null
  $results = @($jobs | Receive-Job -ErrorAction Stop)
  if (@($jobs | Where-Object State -ne 'Completed').Count -ne 0) { throw 'Concurrent psql failed' }
  $afterGold = [int]((& $psql @baseArgs -c "SELECT gold FROM public.user_balance WHERE user_id='$userId'").Trim())
  $afterQuantity = [int]((& $psql @baseArgs -c "SELECT quantity FROM public.user_inventory WHERE user_id='$userId' AND item_id='$itemId'").Trim())
  $afterXp = [int]((& $psql @baseArgs -c "SELECT total_xp FROM public.profiles WHERE user_id='$userId'").Trim())
  if ($beforeGold - $afterGold -ne $expectedDebit -or $afterQuantity - $beforeQuantity -ne $expectedGain -or $afterXp -ne $beforeXp) {
    throw "Concurrent accounting mismatch: debit=$($beforeGold - $afterGold), gain=$($afterQuantity - $beforeQuantity), XP delta=$($afterXp - $beforeXp)"
  }
  if ($results.Count -lt 2) { throw 'Missing concurrent response' }
}

Invoke-Pair '00000000-0000-0000-0000-000000009011' '00000000-0000-0000-0000-000000009011' 24000 1
Invoke-Pair '00000000-0000-0000-0000-000000009012' '00000000-0000-0000-0000-000000009013' 48000 2
Write-Output 'CRAFTING_CONCURRENCY_ASSERTIONS_PASSED'
