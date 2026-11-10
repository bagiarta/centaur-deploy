@echo off
setlocal
echo ===================================================
echo Memasang Sertifikat SSL Centaur Deploy ke Windows
echo ===================================================
echo Meminta akses Administrator...
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo GAGAL: Skrip ini harus dijalankan sebagai Administrator!
    echo Silakan tutup jendela ini, lalu Klik Kanan file Install-Cert.bat 
    echo dan pilih "Run as Administrator".
    pause
    exit /b 1
)

cd /d "%~dp0"
echo Menyiapkan sertifikat SSL Centaur Deploy...

(
echo -----BEGIN CERTIFICATE-----
echo MIIDbDCCAlSgAwIBAgIUThmeyJkGEcWyMG951rGCyyJNpUswDQYJKoZIhvcNAQEL
echo BQAwWjEWMBQGA1UEAwwNMTkyLjE2OC44NS4zMTEWMBQGA1UECwwNSVQgRGVwYXJ0
echo bWVudDEXMBUGA1UECgwOQ2VudGF1ciBEZXBsb3kxETAPBgNVBAcMCERlbnBhc2Fy
echo MQ0wCwYDVQQIDARCYWxpMQswCQYDVQQGEwJJRDAeFw0yNjExMTAwMTE2MjBaFw0z
echo NjExMDcwMTE2MjBaMFoxFjAUBgNVBAMMDTE5Mi4xNjguODUuMzAxFjAUBgNVBAsM
echo DUlUIERlcGFydG1lbnQxFzAVBgNVBAoMDkNlbnRhdXIgRGVwbG95MREwDwYDVQQH
echo DAhEZW5wYXNhcjENMAsGA1UECAwEQmFsaTELMAkGA1UEBhMCSUQwggEiMA0GCSqG
echo SIb3DQEBAQUAA4IBDwAwggEKAoIBAQCj2zPgaXfKIrrrKfF8N57giAkPa6VI8hZy
echo b0Y6OdyX62NZIAbov5valp3wTA56In878Oxlm+Fb6oW3Yzs5TueUmLYL3E3FfhNh
echo 4U0QI4/zsD7iHXK/dF1FfZBWZ8GFMnz2Y9Njoh8CBWOi0KPXhsNXBkR16wOxpNFh
echo YC/nUiCOefVaCL94I3YT3OIFEiVUklvUA3ndpTEnonEadNG03njYz/rSncZb18fb
echo gDTBpjQLq3+yWmwee41nVsccnXfXA31mvqy69u/ef+Oy5O137dijaRqWvXb05AnD
echo AZr1eV0nhR+Rh6++7ISqZgIKhEs3Xe5aqUJlwf+xyKmBKuuLgVV9AgMBAAGjZDBi
echo MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgKkMB0GA1UdJQQWMBQGCCsG
echo AQUFBwMBBggrBgEFBQcDAjAgBgNVHREEGTAXgglsb2NhbGhvc3SHBMCoVR6HBMCo
echo VR4wDQYJKoZIhvcNAQELBQADggEBAPCiquiGfdHlv2t2n3hpxte9dKn+e7/FpF8w
echo +sbLx/UzRQd0SNNEaJyA9ZNc6Wz5tKVHjwZ8DChdR81X6UJIkITh7kInUZDhTu68
echo TXKbRZm0sQOecn4VdGu8vA5/8N9mte1tZhRFi2rBW/ni0Tcgwt437HCo25Dosr5V
echo eC9nqp7rihEMmm6Jap0bMHmncuFxqtXZJgcsvBhLJxMMXXrjFLa3g886O+fDKRlF
echo 7UEJVcrbXzC2d/dGR7Svxn6RCbs+uVRXv6icWZ/dgCg5LF+qdiQ8Sc63k4HuSIUt
echo O/hbKc0Co8nVEiyag2C9zAMYxmU/J49+CglZAwAQnP/gI0rACmE=
echo -----END CERTIFICATE-----
) > "%TEMP%\centaur-ca.crt"

if exist "%TEMP%\centaur-ca.crt" (
    echo Memasang sertifikat ke Trusted Root Certification Authorities...
    certutil -addstore -f "Root" "%TEMP%\centaur-ca.crt"
    del "%TEMP%\centaur-ca.crt" >nul 2>&1
    echo.
    echo ===================================================
    echo SUKSES! Sertifikat SSL Centaur berhasil dipasang.
    echo Silakan tutup semua jendela browser (Chrome / Edge),
    echo lalu buka kembali: https://192.168.85.30:3002
    echo ===================================================
    pause
) else (
    echo GAGAL: Tidak dapat mengekstrak sertifikat.
    pause
)
