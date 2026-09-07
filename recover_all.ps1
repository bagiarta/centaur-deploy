$ErrorActionPreference = "Continue"

$Usernames = @("administrator", "Administrator")
$Passwords = @("7`$nG`$t4ny`$s4y`$", "t34m1tppt")

Write-Host "Mengambil daftar IP dari database..."
$ipsString = (node f:\PepiUpdater\centaur-deploy\get_ips.mjs | Select-Object -Last 1)
$ipList = $ipsString -split "," | Where-Object { $_ -match "^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$" }

Write-Host "Ditemukan $($ipList.Count) perangkat. Memulai recovery..."

$ServerUrl = "http://192.168.85.30:3001"
$InstallerPath = "f:\PepiUpdater\centaur-deploy\public\Manual-Agent-Installer-v30.ps1"

$successCount = 0
$failCount = 0

foreach ($ip in $ipList) {
    if ($ip -eq "127.0.0.1") { continue }
    Write-Host "`nMencoba $ip ..."
    $success = $false
    
    foreach ($pass in $Passwords) {
        if ($success) { break }
        
        try {
            Write-Host " -> Mencoba password: $pass (disamarkan)" -ForegroundColor DarkGray
            # Execute push_agent synchronously
            $output = & f:\PepiUpdater\centaur-deploy\scripts\push_agent.ps1 -TargetIP $ip -Username "administrator" -Password $pass -ServerUrl $ServerUrl -InstallerPath $InstallerPath 2>&1
            
            # Check if it succeeded
            if ($output -match "STATUS:SUCCESS" -or $output -match "LOG:Agent v2.5.0 installed and task verified" -or $output -match "INSTALLATION COMPLETE") {
                Write-Host " -> BERHASIL memulihkan $ip" -ForegroundColor Green
                $success = $true
                $successCount++
            } else {
                # If there's an error output indicating logon failure, it will loop
                if ($output -match "Logon failure" -or $output -match "Access is denied" -or $output -match "Access Denied") {
                    # Try next password
                } else {
                    Write-Host " -> PERINGATAN dari $($ip): $output" -ForegroundColor Yellow
                }
            }
        } catch {
            Write-Host " -> Gagal eksekusi ke $($ip): $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    if (-not $success) {
        Write-Host " -> GAGAL memulihkan $ip setelah mencoba semua password." -ForegroundColor Red
        $failCount++
    }
}

Write-Host "`n=== Proses Recovery Selesai ==="
Write-Host "Berhasil: $successCount" -ForegroundColor Green
Write-Host "Gagal: $failCount" -ForegroundColor Red
