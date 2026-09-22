<#
.SYNOPSIS
    CentaurNetworkBlocker - Persistent Network Blocking Agent (Blacklist Mode)
.DESCRIPTION
    Skrip agen untuk memblokir akses ke domain tertentu secara persisten.
    Sangat AMAN untuk unit di area remote karena tidak memutus koneksi 
    lokal (LAN) maupun konektivitas remote management.
#>

param (
    [string[]]$DomainsToBlock = @("facebook.com", "youtube.com"), # Ganti dengan domain target
    [int]$EnforcementIntervalSeconds = 60
)

$RuleName = "CentaurAgent_Blacklist"

# Pastikan script dijalankan sebagai Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Skrip ini memerlukan hak akses Administrator!"
    exit
}

function Update-BlacklistMode {
    $blockedIPs = @()
    foreach ($domain in $DomainsToBlock) {
        try {
            $records = Resolve-DnsName -Name $domain -ErrorAction Stop | Where-Object { $_.Type -eq 'A' -or $_.Type -eq 'AAAA' }
            foreach ($record in $records) {
                $blockedIPs += $record.IPAddress
            }
        } catch {
            Write-Verbose "Gagal meresolve domain: $domain"
        }
    }
    
    $blockedIPs = $blockedIPs | Select-Object -Unique

    if ($blockedIPs.Count -gt 0) {
        $existingRule = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
        if ($existingRule) {
            Set-NetFirewallRule -DisplayName $RuleName -RemoteAddress $blockedIPs -Action Block -Direction Outbound -ErrorAction SilentlyContinue
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Aturan blokir diperbarui untuk $($blockedIPs.Count) IP target."
        } else {
            New-NetFirewallRule -DisplayName $RuleName -Direction Outbound -Action Block -RemoteAddress $blockedIPs -Profile Any -ErrorAction SilentlyContinue | Out-Null
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Aturan pemblokiran baru berhasil dibuat."
        }
    }
}

Write-Host "=========================================="
Write-Host " Centaur Network Blocker Enforcer Started "
Write-Host " Mode Aktif: BLACKLIST (Aman untuk Remote)"
Write-Host "=========================================="
Write-Host "Target: $($DomainsToBlock -join ', ')"
Write-Host "Tekan CTRL+C untuk menghentikan agen (aturan akan dibiarkan aktif)."

try {
    # Bersihkan jika sebelumnya pernah tes Whitelist mode
    Set-NetFirewallProfile -Profile Domain,Public,Private -DefaultOutboundAction Allow
    Remove-NetFirewallRule -DisplayName "CentaurAgent_Whitelist_Allow" -ErrorAction SilentlyContinue | Out-Null

    while ($true) {
        Update-BlacklistMode
        Start-Sleep -Seconds $EnforcementIntervalSeconds
    }
} finally {
    Write-Host "Agen Enforcer berhenti."
}
