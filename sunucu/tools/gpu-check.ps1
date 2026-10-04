<#
GPU/CPU/Docker on-kontrol scripti. Cikti TAMAMINI kopyalayip gonderin.

    powershell -ExecutionPolicy Bypass -File gpu-check.ps1
#>
function Section([string]$Title) {
    Write-Host ""
    Write-Host "==== $Title ====" -ForegroundColor Cyan
}

Section "Isletim Sistemi"
try {
    $os = Get-CimInstance Win32_OperatingSystem
    Write-Host ("{0} (build {1}), mimari: {2}" -f $os.Caption, $os.BuildNumber, $os.OSArchitecture)
} catch { Write-Host "okunamadi: $_" }

Section "CPU / RAM"
try {
    $cpu = Get-CimInstance Win32_Processor
    Write-Host ("CPU: {0} ({1} cekirdek / {2} is parcacigi)" -f $cpu.Name, $cpu.NumberOfCores, $cpu.NumberOfLogicalProcessors)
    $ram = Get-CimInstance Win32_ComputerSystem
    Write-Host ("RAM: {0:N1} GB" -f ($ram.TotalPhysicalMemory / 1GB))
} catch { Write-Host "okunamadi: $_" }

Section "GPU (genel, WMI)"
try {
    Get-CimInstance Win32_VideoController | ForEach-Object {
        Write-Host ("{0} -- surucu: {1}, VRAM: {2:N1} GB" -f $_.Name, $_.DriverVersion, ($_.AdapterRAM / 1GB))
    }
} catch { Write-Host "okunamadi: $_" }

Section "NVIDIA driver / CUDA (nvidia-smi)"
$nvidiaSmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if ($nvidiaSmi) {
    & nvidia-smi
} else {
    Write-Host "nvidia-smi bulunamadi - NVIDIA driver kurulu degil veya PATH'te yok." -ForegroundColor Yellow
}

Section "Docker"
$docker = Get-Command docker -ErrorAction SilentlyContinue
if ($docker) {
    docker --version
    docker compose version
} else {
    Write-Host "docker bulunamadi." -ForegroundColor Yellow
}

Section "Docker + GPU testi (nvidia-container-toolkit)"
if ($docker -and $nvidiaSmi) {
    Write-Host "Test ediliyor: docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi"
    docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi 2>&1
} else {
    Write-Host "Atlandi (docker ve/veya nvidia-smi yok)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==== BITTI - yukaridaki TUM ciktiyi kopyalayip gonderin ====" -ForegroundColor Green
