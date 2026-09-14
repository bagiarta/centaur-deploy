@echo off
:: ==========================================
:: INSTALLER USB CONTROLLER AGENT UNTUK KLIEN
:: ==========================================

:: 1. Meminta hak akses Administrator (UAC Prompt)
NET SESSION >nul 2>&1
if %errorLevel% == 0 (
    goto :RunInstall
) else (
    echo Meminta hak akses Administrator...
    powershell -Command "Start-Process '%~dpnx0' -Verb RunAs"
    exit /b
)

:RunInstall
echo Menginstal Centaur USB Agent...
set "AGENT_DIR=C:\CentaurAgent"
if not exist "%AGENT_DIR%" mkdir "%AGENT_DIR%"

:: 2. Menulis file PowerShell Agent (Perhatikan IP Server Anda di sini)
set "PS_FILE=%AGENT_DIR%\CentaurUsbAgent.ps1"
echo $ServerUrl = "http://192.168.85.30:3001" > "%PS_FILE%"
echo while ($true) { >> "%PS_FILE%"
echo     try { >> "%PS_FILE%"
echo         $Script = Invoke-RestMethod -Uri "$ServerUrl/CentaurUsbAgent.ps1" -UseBasicParsing -TimeoutSec 10 >> "%PS_FILE%"
echo         $ScriptBlock = [scriptblock]::Create($Script) >> "%PS_FILE%"
echo         ^& $ScriptBlock -ServerUrl $ServerUrl >> "%PS_FILE%"
echo     } catch { >> "%PS_FILE%"
echo     } >> "%PS_FILE%"
echo     Start-Sleep -Seconds 30 >> "%PS_FILE%"
echo } >> "%PS_FILE%"

:: 3. Menghentikan proses lama jika ada
powershell -Command "Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -match 'CentaurUsbAgent.ps1' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

:: 4. Membuat Scheduled Task (Mulai Otomatis saat PC Nyala)
powershell -Command "$Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-WindowStyle Hidden -ExecutionPolicy Bypass -File \"%PS_FILE%\"'; $Trigger = New-ScheduledTaskTrigger -AtStartup; $Principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest; $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Days 9999); Register-ScheduledTask -TaskName 'CentaurUSBAgent' -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null"

:: 5. Jalankan Langsung Sekarang
powershell -Command "Start-Process powershell -ArgumentList '-WindowStyle Hidden -ExecutionPolicy Bypass -File \"%PS_FILE%\"' -Verb RunAs"

echo.
echo ====================================================
echo INSTALASI SUKSES! 
echo Agen Pengendali USB Centaur telah berjalan di PC ini.
echo ====================================================
timeout /t 5 >nul
