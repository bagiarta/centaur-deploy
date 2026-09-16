@echo off
title Instalasi Centaur Agent v3.1.1
echo ===================================================
echo   MEMULAI INSTALASI CENTAUR AGENT (PepiUpdater)
echo ===================================================
echo.

:: 1. Meminta hak akses Administrator otomatis
NET SESSION >nul 2>&1
if %errorLevel% == 0 (
    goto :RunInstall
) else (
    echo Meminta hak akses Administrator untuk membuat Task Scheduler...
    powershell -Command "Start-Process '%~dpnx0' -Verb RunAs"
    exit /b
)

:RunInstall
echo [1/3] Membersihkan agen lama yang mungkin tersangkut (hang)...
taskkill /f /im powershell.exe /t >nul 2>&1

echo [2/3] Mengunduh Installer Utama dan Mengatur Auto-Scheduler...
set "SERVER_URL=http://192.168.85.30:3001"
powershell -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; try { Invoke-RestMethod -Uri '%SERVER_URL%/Manual-Agent-Installer-v30.ps1' -OutFile '%TEMP%\installer.ps1'; & '%TEMP%\installer.ps1' -ServerUrl '%SERVER_URL%' } catch { Write-Host 'Error: ' $_.Exception.Message }"

echo [3/3] Memicu Agen untuk langsung berjalan saat ini...
schtasks /run /tn "CentaurAgentUpdater" >nul 2>&1

echo.
echo ===================================================
echo INSTALASI SELESAI! 
echo Agen terbaru v3.1.1 kini sudah aktif di PC ini.
echo Jendela ini akan tertutup otomatis.
echo ===================================================
timeout /t 7 >nul
