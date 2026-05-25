@echo off
setlocal
echo ===================================================
echo Memasang Sertifikat SSL Centaur Deploy ke Windows
echo ===================================================
echo Meminta akses Administrator...
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Akses Administrator dikonfirmasi.
) else (
    echo GAGAL: Skrip ini harus dijalankan sebagai Administrator!
    echo Silakan tutup jendela ini, lalu Klik Kanan file Install-Cert.bat 
    echo dan pilih "Run as Administrator".
    pause
    exit /b 1
)

cd /d "%~dp0"
echo Mengunduh sertifikat dari server...

:: Extract hostname from current script location or ask user to provide it.
:: Since the BAT is downloaded from the browser, we can assume it's run locally.
:: We will prompt the user to make sure, or just provide the cert directly.
:: Wait, if the cert is downloaded via HTTP(s), we need the IP.
:: A better approach is to serve this BAT file dynamically from an Express route so it can hardcode the IP address.

