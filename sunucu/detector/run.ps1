# Tespit servisini başlatır (detector/.venv üzerinden, proje kökünden çalıştırılmalı).
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
& "$root\detector\.venv\Scripts\python.exe" -m detector.app.main
