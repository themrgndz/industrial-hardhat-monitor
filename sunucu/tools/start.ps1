<#
sunucu/ klasöründeki uygulamayı (postgres -> backend -> detector) sırayla
başlatır ve doğrular. mediamtx/kamera yayını BURADA YOK — o tamamen ayrı,
../yayin/ klasöründe kendi başına yönetilir (bu script hiçbir şekilde
../yayin/'a dokunmaz, bağımlı değildir).

    powershell -ExecutionPolicy Bypass -File tools\start.ps1
    -SkipVerify   kamera anlık görüntü doğrulamasını atla

cameras.json'daki RTSP URI'leri nereden geldiğine (yerel test yayını,
../yayin/, ya da gerçek kamera) bakmaz — sadece bağlanmayı dener.
#>
[CmdletBinding()]
param(
    [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root "logs\run"
New-Item -ItemType Directory -Force -Path $runDir | Out-Null
$powershell = (Get-Process -Id $PID).Path
$transcript = Join-Path $runDir "start.log"
Start-Transcript -Path $transcript -Force | Out-Null

$total = [System.Diagnostics.Stopwatch]::StartNew()
$script:results = @()

function Test-Port([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try { $client.Connect("127.0.0.1", $Port); $true } catch { $false } finally { $client.Dispose() }
}

function Wait-Port([int]$Port, [int]$TimeoutSec) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Port $Port) { return $true }
        Start-Sleep -Milliseconds 300
    }
    return $false
}

function Wait-Http([string]$Url, [int]$TimeoutSec) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) { return $true }
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Start-Bg([string]$Name, [string]$File, [string[]]$Arguments) {
    $out = Join-Path $runDir "$Name.out.log"
    $err = Join-Path $runDir "$Name.err.log"
    $in = Join-Path $runDir "$Name.in.tmp"
    Set-Content -Path $in -Value ([string]::Empty) -NoNewline
    $proc = Start-Process -FilePath $File -ArgumentList $Arguments -WindowStyle Hidden -PassThru `
        -RedirectStandardInput $in -RedirectStandardOutput $out -RedirectStandardError $err
    Set-Content -Path (Join-Path $runDir "$Name.pid") -Value $proc.Id
    return $proc
}

function Step([string]$Name, [scriptblock]$Action) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $ok = & $Action
    $sw.Stop()
    $durum = if ($ok) { "hazır" } else { "BAŞARISIZ" }
    $renk = if ($ok) { "Green" } else { "Red" }
    Write-Host ("  {0,-22}{1,-10}{2,6:N1}s" -f $Name, $durum, $sw.Elapsed.TotalSeconds) -ForegroundColor $renk
    $script:results += [pscustomobject]@{ Servis = $Name; Durum = $durum; Sure = "{0:N1}" -f $sw.Elapsed.TotalSeconds }
    return ($durum -eq "hazır")
}

Write-Host "sunucu yığını başlatılıyor ($root)" -ForegroundColor Cyan

# Başarısız denemelerden kalan pid dosyaları yanıltıyor.
foreach ($pidFile in @(Get-ChildItem -Path $runDir -Filter *.pid -ErrorAction SilentlyContinue)) {
    $p = (Get-Content $pidFile.FullName | Select-Object -First 1).Trim()
    if (-not (Get-Process -Id $p -ErrorAction SilentlyContinue)) {
        Remove-Item $pidFile.FullName -ErrorAction SilentlyContinue
    }
}

# 1) Postgres --------------------------------------------------------------
$ok = Step "postgres :5432" {
    if (Test-Port 5432) { return $true }
    & "$root\tools\pg-start.ps1" | Out-Null
    return (Wait-Port 5432 60)
}
if (-not $ok) { Write-Error "postgres başlatılamadı (bkz. pgdata\server.log)"; exit 1 }

# 2) Backend -----------------------------------------------------------
$ok = Step "backend :8080" {
    if (Test-Port 8080) { return $true }
    Start-Bg "backend" $powershell @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "$root\backend\run.ps1") | Out-Null
    return (Wait-Http "http://127.0.0.1:8080/api/v1/stats/summary" 120)
}
if (-not $ok) { Write-Error "backend başlatılamadı (bkz. logs\run\backend.*.log)"; exit 1 }

# 3) Detector -------------------------------------------------------------
$ok = Step "detector :8090" {
    if (Test-Port 8090) { return $true }
    Start-Bg "detector" $powershell @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "$root\detector\run.ps1") | Out-Null
    return (Wait-Http "http://127.0.0.1:8090/api/health" 240)
}
if (-not $ok) { Write-Error "detector başlatılamadı (bkz. logs\run\detector.*.log)"; exit 1 }

# 4) Kamera doğrulaması (cameras.json'daki her kaynağa anlık görüntü denemesi)
if (-not $SkipVerify) {
    try {
        $cams = Invoke-RestMethod -Uri "http://127.0.0.1:8090/api/cameras" -TimeoutSec 5
        foreach ($cam in $cams.cameras) {
            $ok = Step ("kamera " + $cam.id) {
                $deadline = (Get-Date).AddSeconds(30)
                while ((Get-Date) -lt $deadline) {
                    try {
                        $r = Invoke-WebRequest -Uri ("http://127.0.0.1:8090/api/cameras/" + $cam.id + "/snapshot.jpg") -UseBasicParsing -TimeoutSec 5
                        if ($r.StatusCode -eq 200) { return $true }
                    } catch {}
                    Start-Sleep -Milliseconds 500
                }
                return $false
            }
        }
    } catch {
        Write-Host "  kamera listesi alınamadı, doğrulama atlandı" -ForegroundColor Yellow
    }
}

$total.Stop()
Write-Host ""
$script:results | Format-Table -AutoSize
Write-Host ("toplam {0:N1} saniye" -f $total.Elapsed.TotalSeconds) -ForegroundColor Cyan
Write-Host "arayüz : http://127.0.0.1:8080" -ForegroundColor Cyan
Write-Host "loglar : logs\run\*.log     durdurmak için: tools\stop.ps1"
Write-Host "not    : kamera yayını ayrı yönetilir, bkz. ..\yayin\Yayin-Baslat.bat"
if ($script:results.Durum -contains "BAŞARISIZ") { exit 1 }
exit 0
