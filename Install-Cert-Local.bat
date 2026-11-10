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
    echo Silakan tutup jendela ini, lalu Klik Kanan file Install-Cert-Local.bat 
    echo dan pilih "Run as Administrator".
    pause
    exit /b 1
)

cd /d "%~dp0"
if exist "config\ssl\centaur-ca.crt" (
    echo Sertifikat ditemukan di config\ssl\centaur-ca.crt, memasang ke Trusted Root...
    certutil -addstore -f "Root" "config\ssl\centaur-ca.crt"
    echo.
    echo ===================================================
    echo SUKSES! Sertifikat SSL Centaur berhasil dipasang ke Trusted Root Windows.
    echo Silakan tutup semua jendela browser (Chrome / Edge),
    echo lalu buka kembali: https://192.168.85.30:3002
    echo ===================================================
    pause
) else (
    echo GAGAL: File config\ssl\centaur-ca.crt tidak ditemukan.
    pause
)

