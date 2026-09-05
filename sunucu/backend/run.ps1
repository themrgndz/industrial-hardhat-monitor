# Backend'i .env'deki değerlerle başlatır.
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $parts = $line -split '=', 2
    [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim())
}
Set-Location $PSScriptRoot
java -jar target/ppe-0.0.1-SNAPSHOT.jar
