# Postgres'i başlatır ve GERÇEKTEN bağlantı kabul edene kadar bekler.
# `pg_ctl start` tek başına yetmiyor: kilitlenmeden sonraki kurtarma (recovery)
# sırasında sunucu ayakta ama "FATAL: the database system is starting up" döner
# ve hemen ardından açılan backend çöker. Bu yüzden pg_isready ile doğrulanır.
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $root "pgsql\bin"
$data = Join-Path $root "pgdata"

# Zaten cevap veriyorsa pg_ctl'i hiç çağırma: "another server might be running"
# yolunda -w ile 60 s boşa bekleniyor.
& "$bin\pg_isready.exe" -h 127.0.0.1 -p 5432 -q
if ($LASTEXITCODE -eq 0) {
    Write-Host "postgres zaten hazır (127.0.0.1:5432)"
    exit 0
}

# pg_ctl `&` ile çağrılırsa, başlattığı postgres alt süreçleri PowerShell'in
# borularını -- özellikle STDIN'i -- miras alıp açık tutuyor. `cmd.exe /c` ile
# stdout/stderr yönlendirmek yetmiyor: stdin devredilmeye devam ettiği için
# süreç sarmalayıcısı hiç EOF görmüyor ve betik bitse bile yığın "çalışıyor"
# kalıyor (ölçüldü: 16 dakikalık asılma).
# Start-Process ile ÜÇ akışın tamamı dosyaya bağlanır; daemon PowerShell'in
# hiçbir tanıtıcısını devralmaz.
#   -Wait KULLANILMAZ : tüm alt ağacı, yani daemon'ı bekler, hiç dönmez.
#   -w    KULLANILMAZ : beklemenin tek doğruluk kaynağı aşağıdaki pg_isready
#                       döngüsü olsun ki toplam süre kesin sınırlı kalsın.
$ctlOut = Join-Path $data "pg_ctl.out.log"
$ctlErr = Join-Path $data "pg_ctl.err.log"
$ctlIn = Join-Path $data "pg_ctl.in.tmp"
Set-Content -Path $ctlIn -Value ([string]::Empty) -NoNewline
$ctl = Start-Process -FilePath "$bin\pg_ctl.exe" `
    -ArgumentList @("-D", "`"$data`"", "-o", "`"-p 5432`"", "-l", "`"$data\server.log`"", "start") `
    -WindowStyle Hidden -PassThru `
    -RedirectStandardInput $ctlIn -RedirectStandardOutput $ctlOut -RedirectStandardError $ctlErr
if (-not $ctl.WaitForExit(20000)) {
    # /T KULLANILMAZ: pg_ctl'in alt süreci başlattığımız postgres'in kendisi.
    Write-Host "pg_ctl 20 s içinde dönmedi; sonlandırılıp pg_isready ile doğrulanacak"
    & taskkill.exe /PID $ctl.Id /F 2>&1 | Out-Null
}
else {
    # -PassThru ile dönen nesnede ExitCode, süreç sonlandıktan sonra Refresh()
    # çağrılmadan $null kalabiliyor; boş kodu "hata" sanıp gürültü basmayalım.
    $ctl.Refresh()
    $code = $ctl.ExitCode
    if ($null -ne $code -and $code -ne 0) {
        Write-Host "pg_ctl çıkış kodu $code (bkz. $ctlErr); pg_isready ile doğrulanacak"
    }
}
Remove-Item $ctlIn -ErrorAction SilentlyContinue

$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
    & "$bin\pg_isready.exe" -h 127.0.0.1 -p 5432 -q
    if ($LASTEXITCODE -eq 0) {
        Write-Host "postgres hazır (127.0.0.1:5432)"
        exit 0
    }
    Start-Sleep -Milliseconds 400
}
Write-Error "postgres 60 s içinde bağlantı kabul etmedi; bkz. $data\server.log"
exit 1
