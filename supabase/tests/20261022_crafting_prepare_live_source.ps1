param(
  [Parameter(Mandatory = $true)][string]$SnapshotPath,
  [Parameter(Mandatory = $true)][string]$SupplementPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [string]$ClassMigrationPath = 'supabase\migrations\20261021145143_hero_class_authority.sql',
  [int]$Port = 55432,
  [string]$Database = 'crafting_verify'
)
$ErrorActionPreference = 'Stop'
$snapshot = Get-Content -LiteralPath $SnapshotPath -Raw -Encoding UTF8 | ConvertFrom-Json
$entry = @($snapshot.functions | Where-Object signature -eq 'app_private.sync_auto_adventure()')
if ($entry.Count -ne 1 -or $entry[0].md5 -ne 'ef8da5af1aa65460a92f160df438462b') {
  throw 'Live source snapshot is missing or has drifted'
}
$supplement = Get-Content -LiteralPath $SupplementPath -Raw -Encoding UTF8 | ConvertFrom-Json
$classEntry = @($supplement.functions | Where-Object signature -eq 'app_private.hero_class_key(uuid)')
if ($classEntry.Count -ne 1 -or $classEntry[0].md5 -ne 'da6e71eb8c5a2087a1cd4296a5418652') {
  throw 'Live class source snapshot is missing or has drifted'
}
$equipEntry = @($snapshot.functions | Where-Object signature -eq 'set_inventory_equipped(uuid,boolean,boolean)')
if ($equipEntry.Count -ne 1 -or $equipEntry[0].md5 -ne 'ba16fefce62bc1a6d06c30ef32c40813') {
  throw 'Live equipment source snapshot is missing or has drifted'
}
$migration = (Get-Content -LiteralPath $ClassMigrationPath -Raw -Encoding UTF8).Replace("`r`n", "`n")
$start = $migration.IndexOf('CREATE FUNCTION app_private.class_path_matches(')
if ($start -lt 0) { throw 'Class-path function was not found in local migration' }
$end = $migration.IndexOf('$$;', $start)
if ($end -lt 0) { throw 'Class-path function terminator was not found' }
$classPath = $migration.Substring($start, $end + 3 - $start).Replace(
  'CREATE FUNCTION app_private.class_path_matches(',
  'CREATE OR REPLACE FUNCTION app_private.class_path_matches(')
$sql = [string]$entry[0].definition + ";`n" + $classPath + "`n" +
  [string]$classEntry[0].definition + ";`n" + [string]$equipEntry[0].definition + ";`n"
[System.IO.File]::WriteAllText($OutputPath, $sql, [System.Text.UTF8Encoding]::new($false))
$env:PGCLIENTENCODING = 'UTF8'
$psql = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
& $psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -f $OutputPath
if ($LASTEXITCODE -ne 0) { throw "Local source install exited $LASTEXITCODE" }
$actual = (& $psql -X -At -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -c "SELECT md5(pg_get_functiondef('app_private.sync_auto_adventure()'::regprocedure))").Trim()
if ($LASTEXITCODE -ne 0 -or $actual -ne $entry[0].md5) {
  throw "Local source hash mismatch: $actual"
}
$classActual = (& $psql -X -At -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -c "SELECT md5(pg_get_functiondef('app_private.hero_class_key(uuid)'::regprocedure))").Trim()
if ($LASTEXITCODE -ne 0 -or $classActual -ne $classEntry[0].md5) {
  throw "Local class source hash mismatch: $classActual"
}
$pathActual = (& $psql -X -At -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -c "SELECT md5(pg_get_functiondef('app_private.class_path_matches(uuid,text,integer)'::regprocedure))").Trim()
if ($LASTEXITCODE -ne 0 -or $pathActual -ne '883c77c3a430855102403124f67c790d') {
  throw "Local class-path source hash mismatch: $pathActual"
}
$equipActual = (& $psql -X -At -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $Port -U postgres -d $Database -c "SELECT md5(pg_get_functiondef('public.set_inventory_equipped(uuid,boolean,boolean)'::regprocedure))").Trim()
if ($LASTEXITCODE -ne 0 -or $equipActual -ne $equipEntry[0].md5) {
  throw "Local equipment source hash mismatch: $equipActual"
}
Write-Output "CRAFTING_SOURCE_HASHES_MATCHED $actual $classActual $pathActual $equipActual"
