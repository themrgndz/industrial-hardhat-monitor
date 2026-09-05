@echo off
chcp 65001 >nul
powershell -ExecutionPolicy Bypass -File "%~dp0tools\start.ps1" -SkipVerify
echo.
echo Pencereyi kapatabilirsiniz, servisler arka planda calismaya devam eder.
pause >nul
