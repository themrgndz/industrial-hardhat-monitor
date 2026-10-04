<#
backend + detector imajlarını build edip Docker Hub'a (themrgndzd) push eder.
Karşı taraf (test makinesi/GPU sunucu) SADECE `docker compose pull` yapar,
hiçbir şey build etmez.

    powershell -ExecutionPolicy Bypass -File sunucu\tools\docker-build-push.ps1
    -SkipPush     sadece build et, push etme (yerel doğrulama için)
    -Tag <etiket> "latest" yerine başka bir etiket kullan (örn. v1.2.0)
#>
[CmdletBinding()]
param(
    [switch]$SkipPush,
    [string]$Tag = "latest"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot   # sunucu/
$user = "themrgndzd"
$backendImage = "$user/ppe-backend:$Tag"
$detectorImage = "$user/ppe-detector:$Tag"

Write-Host "Git LFS asset'leri (model ağırlıkları) kontrol ediliyor..." -ForegroundColor Cyan
& git -C $root lfs pull
if ($LASTEXITCODE -ne 0) { Write-Error "git lfs pull başarısız"; exit 1 }

Write-Host "backend imajı build ediliyor: $backendImage" -ForegroundColor Cyan
docker build -f "$root\backend\Dockerfile" -t $backendImage $root
if ($LASTEXITCODE -ne 0) { Write-Error "backend build başarısız"; exit 1 }

Write-Host "detector imajı build ediliyor: $detectorImage" -ForegroundColor Cyan
docker build -f "$root\detector\Dockerfile" -t $detectorImage $root
if ($LASTEXITCODE -ne 0) { Write-Error "detector build başarısız"; exit 1 }

if ($SkipPush) {
    Write-Host "SkipPush verildi, push atlanıyor." -ForegroundColor Yellow
    exit 0
}

Write-Host "Docker Hub'a push ediliyor (gerekirse önce 'docker login' isteyecek)..." -ForegroundColor Cyan
docker push $backendImage
if ($LASTEXITCODE -ne 0) { Write-Error "backend push başarısız"; exit 1 }
docker push $detectorImage
if ($LASTEXITCODE -ne 0) { Write-Error "detector push başarısız"; exit 1 }

Write-Host "Tamam: $backendImage ve $detectorImage Docker Hub'da." -ForegroundColor Green
Write-Host "Diğer makinede: docker compose pull && docker compose up -d"
