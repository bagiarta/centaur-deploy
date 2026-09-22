@echo off
title Centaur Network Blocker Launcher
cd /d "%~dp0"

echo =========================================
echo  Centaur Network Blocker Launcher
echo =========================================
echo.
echo Mode: BLACKLIST (Hanya memblokir situs tertentu)
echo.
echo Meminta akses Administrator (Silakan klik 'Yes' pada prompt UAC)...
powershell -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"\"%cd%\CentaurNetworkBlocker.ps1\"\"' -Verb RunAs"
