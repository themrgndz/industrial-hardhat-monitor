<#
sunucu/ yığınını ters sırada durdurur (detector -> backend -> postgres).
Kamera yayınına dokunmaz — o ../yayin/'da ayrı yönetilir.

    powershell -ExecutionPolicy Bypass -File tools\stop.ps1
#>
[CmdletBinding()]
param()

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root "logs\run"

$order = @("detector", "backend")

foreach ($name in $order) {
    $pidFile = Join-Path $runDir "$name.pid"
    if (-not (Test-Path $pidFile)) {
        Write-Host ("  {0,-22}pid dosyası yok, atlandı" -f $name)
        continue
    }
    $processId = (Get-Content $pidFile | Select-Object -First 1).Trim()
    $running = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $running) {
        Write-Host ("  {0,-22}çalışmıyor" -f $name)
        Remove-Item $pidFile -ErrorAction SilentlyContinue
        continue
    }
    & taskkill.exe /PID $processId /T /F | Out-Null
    Write-Host ("  {0,-22}durduruldu (pid {1})" -f $name, $processId) -ForegroundColor Green
    Remove-Item $pidFile -ErrorAction SilentlyContinue
}

Remove-Item (Join-Path $runDir "*.in.tmp") -ErrorAction SilentlyContinue

& "$root\tools\pg-stop.ps1"

$busy = @(8090, 8080, 5432) | Where-Object {
    $c = New-Object System.Net.Sockets.TcpClient
    try { $c.Connect("127.0.0.1", $_); $true } catch { $false } finally { $c.Dispose() }
}
if ($busy.Count -gt 0) {
    Write-Warning ("hâlâ dinleyen port(lar): {0}" -f ($busy -join ", "))
    exit 1
}
Write-Host "sunucu servisleri durdu" -ForegroundColor Cyan
exit 0
