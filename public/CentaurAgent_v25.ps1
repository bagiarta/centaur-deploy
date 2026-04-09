# --- Centaur Deploy Agent v2.7.2 ---
# Capabilities:
#   1. Send hardware/resource heartbeat
#   2. Self-update check (download new version if server has newer)
#   3. Poll and execute pending remote commands, report results
#   4. Poll and execute pending file deployments
param(
    [string]$ServerUrl = "http://192.168.85.30:3001"
)

$Version    = "2.7.2"
$Hostname   = $env:COMPUTERNAME
# --- IP Selection Logic (Prioritize Internal IPv4) ---
$allIPs = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" }

# 1. Try RFC 1918 Private Ranges (Highest Priority)
$IPAddress = ($allIPs | Where-Object { 
    $_.IPAddress -match "^10\." -or 
    $_.IPAddress -match "^172\.(1[6-9]|2[0-9]|3[01])\." -or 
    $_.IPAddress -match "^192\.168\."
} | Select-Object -First 1).IPAddress

# 2. Try APIPA / Link-Local (Second Priority)
if (!$IPAddress) {
    $IPAddress = ($allIPs | Where-Object { $_.IPAddress -match "^169\.254\." } | Select-Object -First 1).IPAddress
}

# 3. Fallback to any IPv4 if no private address is found
if (!$IPAddress) {
    $IPAddress = ($allIPs | Select-Object -First 1).IPAddress
}
$AgentDir   = "C:\Program Files\PepiUpdaterAgent"
$AgentFile  = "CentaurAgent_v25.ps1"
$AgentPath  = "$AgentDir\$AgentFile"
$LogPath    = "C:\Windows\Temp\centaur_agent.log"

# Force correct server URL (never localhost)
if (!$ServerUrl -or $ServerUrl -like "*localhost*" -or $ServerUrl -like "*127.0.0.1*") {
    $ServerUrl = "http://192.168.85.30:3001"
}

function Write-Log($msg) {
    try {
        $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        "$ts - $msg" | Out-File -FilePath $LogPath -Append -ErrorAction SilentlyContinue
    } catch { }
    Write-Host $msg
}

Write-Log "=== Centaur Agent v$Version starting on $Hostname ==="

# ─────────────────────────────────────────────────────────
# PHASE 1: ANTI-DOUBLE SCHEDULER CLEANUP (Self-Healing)
# ─────────────────────────────────────────────────────────
$currentTask = "CentaurAgentUpdater"
$legacyTasks = @("CentaurAgent", "PepiAgent", "PepiUpdaterTask", "AgentService")
foreach ($legacy in $legacyTasks) {
    if ($legacy -ne $currentTask) {
        if (Get-ScheduledTask -TaskName $legacy -ErrorAction SilentlyContinue) {
            Write-Log "[Self-Healing] Removing legacy task: $legacy"
            Unregister-ScheduledTask -TaskName $legacy -Confirm:$false -ErrorAction SilentlyContinue
        }
    }
}

# ─────────────────────────────────────────────────────────
# PHASE 2: SELF-UPDATE CHECK
# ─────────────────────────────────────────────────────────
Write-Log "[Update] Checking for newer agent version at $ServerUrl/api/agent/version..."
try {
    $verResponse = Invoke-RestMethod -Uri "$ServerUrl/api/agent/version" -Method Get -TimeoutSec 10 -ErrorAction Stop
    $serverVersion = $verResponse.version

    Write-Log "[Update] Local: v$Version | Server: v$serverVersion"

    # Compare versions — download if server is newer
    $localParsed  = [Version]$Version
    $serverParsed = [Version]$serverVersion

    if ($serverParsed -gt $localParsed) {
        Write-Log "[Update] Newer version available. Downloading v$serverVersion..."
        $TempPath = "$env:TEMP\$AgentFile"
        Invoke-WebRequest -Uri "$ServerUrl/$AgentFile" -OutFile $TempPath -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
        Copy-Item -Path $TempPath -Destination $AgentPath -Force -ErrorAction Stop
        Write-Log "[Update] Agent updated to v$serverVersion. Exiting for next scheduler run to pick up new script."
        exit 0
    } else {
        Write-Log "[Update] Already up to date."
    }
} catch {
    Write-Log "[Update] Could not check version: $($_.Exception.Message). Continuing with current version."
}

# ─────────────────────────────────────────────────────────
# PHASE 3: GATHER SYSTEM METRICS
# ─────────────────────────────────────────────────────────
Write-Log "[Metrics] Gathering system metrics..."
try {
    $cpu       = (Get-WmiObject win32_processor | Measure-Object -Property LoadPercentage -Average).Average
    if (!$cpu) { $cpu = 0 }

    $os        = Get-WmiObject win32_operatingsystem
    $totalRam  = [Math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
    $freeRam   = [Math]::Round($os.FreePhysicalMemory / 1MB, 2)
    $ramInfo   = "$([Math]::Round(($totalRam - $freeRam), 2))GB / $($totalRam)GB"

    $disk      = Get-WmiObject win32_logicaldisk -Filter "DeviceID='C:'"
    $totalDisk = [Math]::Round($disk.Size / 1GB, 2)
    $freeDisk  = [Math]::Round($disk.FreeSpace / 1GB, 2)
    $diskInfo  = "$([Math]::Round(($totalDisk - $freeDisk), 2))GB / $($totalDisk)GB"

    $osVersion = $os.Caption
} catch {
    Write-Log "[Metrics] Warning: $($_.Exception.Message)"
    $cpu = 0; $ramInfo = "N/A"; $diskInfo = "N/A"; $osVersion = "Windows"
}

# ─────────────────────────────────────────────────────────
# PHASE 4: SEND HEARTBEAT
# ─────────────────────────────────────────────────────────
Write-Log "[Heartbeat] Reporting to $ServerUrl/api/agent/heartbeat..."
try {
    $heartbeatData = @{
        hostname      = $Hostname
        ip            = $IPAddress
        cpu           = "$([Math]::Round($cpu, 1))%"
        ram           = $ramInfo
        disk          = $diskInfo
        agent_version = $Version
        os_version    = $osVersion
    }
    $json     = $heartbeatData | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$ServerUrl/api/agent/heartbeat" -Method Post -Body $json -ContentType "application/json" -TimeoutSec 15 -ErrorAction Stop
    if ($response.status -eq "ok") {
        Write-Log "[Heartbeat] OK: Received by server."
    } else {
        Write-Log "[Heartbeat] WARNING: Server status: $($response.status)"
    }
} catch {
    Write-Log "[Heartbeat] FAILED: $($_.Exception.Message). Check server connectivity or URL ($ServerUrl)."
}

# ─────────────────────────────────────────────────────────
# PHASE 5: COLLECT AND REPORT SOFTWARE INVENTORY
# ─────────────────────────────────────────────────────────
Write-Log "[Inventory] Collecting installed software..."
try {
    $regPaths = @(
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )
    $softwareList = @()
    foreach ($path in $regPaths) {
        Get-ItemProperty $path -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -and $_.DisplayName.Trim() -ne "" } |
        ForEach-Object {
            $softwareList += @{
                name      = ($_.DisplayName  | Out-String).Trim()
                version   = ($_.DisplayVersion | Out-String).Trim()
                publisher = ($_.Publisher     | Out-String).Trim()
            }
        }
    }
    # Deduplicate by name
    $unique = $softwareList | Group-Object -Property { $_["name"] } | ForEach-Object { $_.Group[0] }
    Write-Log "[Inventory] Found $($unique.Count) installed applications."

    $invPayload = @{
        hostname = $Hostname
        software = @($unique)
    } | ConvertTo-Json -Depth 3

    Invoke-RestMethod -Uri "$ServerUrl/api/agent/software-inventory" -Method Post -Body $invPayload -ContentType "application/json" -TimeoutSec 30 -ErrorAction Stop | Out-Null
    Write-Log "[Inventory] Reported $($unique.Count) applications to server."
} catch {
    Write-Log "[Inventory] Error: $($_.Exception.Message)"
}

# ─────────────────────────────────────────────────────────
# PHASE 6: POLL AND EXECUTE PENDING COMMANDS
# ─────────────────────────────────────────────────────────
Write-Log "[Commands] Polling for pending commands..."
try {
    $pendingUrl  = "$ServerUrl/api/agent/pending?hostname=$([uri]::EscapeDataString($Hostname))"
    $pendingResp = Invoke-RestMethod -Uri $pendingUrl -Method Get -TimeoutSec 10 -ErrorAction Stop
    $commands    = $pendingResp.commands

    if ($commands -and $commands.Count -gt 0) {
        Write-Log "[Commands] Found $($commands.Count) pending command(s)."

        foreach ($cmd in $commands) {
            $cmdId   = $cmd.id
            $execId  = $cmd.exec_id
            $script  = $cmd.command

            Write-Log "[Commands] Executing command ID=$cmdId ..."

            $resultStatus = "success"
            $resultLog    = ""

            try {
                # Execute the command in a subprocess and capture output
                $output = & powershell.exe -ExecutionPolicy Bypass -NonInteractive -Command $script 2>&1
                $resultLog = ($output | Out-String).Trim()
                if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
                    $resultStatus = "failed"
                    if (!$resultLog) { $resultLog = "Command exited with code $LASTEXITCODE" }
                }
                Write-Log "[Commands] Done. Status=$resultStatus"
            } catch {
                $resultStatus = "failed"
                $resultLog    = $_.Exception.Message
                Write-Log "[Commands] Error: $resultLog"
            }

            # Report result back to server
            $resultPayload = @{
                command_id = $cmdId
                exec_id    = $execId
                hostname   = $Hostname
                status     = $resultStatus
                result_log = $resultLog
            } | ConvertTo-Json

            try {
                Invoke-RestMethod -Uri "$ServerUrl/api/agent/command-result" -Method Post -Body $resultPayload -ContentType "application/json" -TimeoutSec 15 -ErrorAction Stop
                Write-Log "[Commands] Result reported for command ID=$cmdId."
            } catch {
                Write-Log "[Commands] Failed to report result: $($_.Exception.Message)"
            }
        }
    } else {
        Write-Log "[Commands] No pending commands."
    }
} catch {
    Write-Log "[Commands] Polling error: $($_.Exception.Message)"
}

# ─────────────────────────────────────────────────────────
# PHASE 6: POLL AND EXECUTE FILE DEPLOYMENTS
# ─────────────────────────────────────────────────────────
Write-Log "[Deployments] Polling for pending deployments..."
try {
    $depsUrl  = "$ServerUrl/api/agent/pending-deployments?hostname=$([uri]::EscapeDataString($Hostname))"
    $depsResp = Invoke-RestMethod -Uri $depsUrl -Method Get -TimeoutSec 10 -ErrorAction Stop
    $deployments = $depsResp.deployments

    if ($deployments -and $deployments.Count -gt 0) {
        Write-Log "[Deployments] Found $($deployments.Count) pending deployment(s)."

        foreach ($dep in $deployments) {
            $depId      = $dep.deployment_id
            $devId      = $dep.device_id
            $pkgName    = $dep.package_name
            $fileName   = $dep.file_name
            $targetDir  = $dep.target_path

            Write-Log "[Deployments] Starting deployment: $pkgName ($fileName)"

            # Report running
            $statusPayload = @{
                deployment_id = $depId
                device_id     = $devId
                status        = "running"
                progress      = 10
                log           = "Downloading..."
            } | ConvertTo-Json
            try { Invoke-RestMethod -Uri "$ServerUrl/api/agent/deploy-status" -Method Post -Body $statusPayload -ContentType "application/json" -TimeoutSec 15 -ErrorAction SilentlyContinue } catch {}

            try {
                if (!(Test-Path -Path $targetDir)) {
                    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
                }

                $downloadUrl = "$ServerUrl/api/packages/download/$fileName"
                $localFile   = Join-Path -Path $targetDir -ChildPath $fileName

                Write-Log "[Deployments] Downloading from $downloadUrl to $localFile..."
                Invoke-WebRequest -Uri $downloadUrl -OutFile $localFile -UseBasicParsing -TimeoutSec 300 -ErrorAction Stop
                
                $statusPayload = @{ deployment_id = $depId; device_id = $devId; status = "running"; progress = 50; log = "Installing..." } | ConvertTo-Json
                try { Invoke-RestMethod -Uri "$ServerUrl/api/agent/deploy-status" -Method Post -Body $statusPayload -ContentType "application/json" -TimeoutSec 15 -ErrorAction SilentlyContinue } catch {}

                Write-Log "[Deployments] Executing $localFile..."
                
                $execLog = ""
                # Execute based on extension
                if ($localFile -match "\.msi$") {
                    $process = Start-Process -FilePath "msiexec.exe" -ArgumentList "/i `"$localFile`" /qn /norestart" -Wait -NoNewWindow -PassThru
                    $execLog = "MSI Exit Code: $($process.ExitCode)"
                } elseif ($localFile -match "\.exe$") {
                    $process = Start-Process -FilePath $localFile -ArgumentList "/S /silent /quiet" -Wait -NoNewWindow -PassThru
                    $execLog = "EXE Exit Code: $($process.ExitCode)"
                } elseif ($localFile -match "\.ps1$") {
                    $output = & powershell.exe -ExecutionPolicy Bypass -NonInteractive -File $localFile 2>&1
                    $execLog = ($output | Out-String).Trim()
                } else {
                    $execLog = "Downloaded (Not executed. Unsupported extension)."
                }
                
                Write-Log "[Deployments] Execution done. $execLog"

                $statusPayload = @{
                    deployment_id = $depId
                    device_id     = $devId
                    status        = "success"
                    progress      = 100
                    log           = "Success: $execLog"
                } | ConvertTo-Json
                try { Invoke-RestMethod -Uri "$ServerUrl/api/agent/deploy-status" -Method Post -Body $statusPayload -ContentType "application/json" -TimeoutSec 15 -ErrorAction SilentlyContinue } catch {}

            } catch {
                $err = $_.Exception.Message
                Write-Log "[Deployments] Error: $err"
                $statusPayload = @{
                    deployment_id = $depId
                    device_id     = $devId
                    status        = "failed"
                    progress      = 0
                    log           = "Error: $err"
                } | ConvertTo-Json
                try { Invoke-RestMethod -Uri "$ServerUrl/api/agent/deploy-status" -Method Post -Body $statusPayload -ContentType "application/json" -TimeoutSec 15 -ErrorAction SilentlyContinue } catch {}
            }
        }
    } else {
        Write-Log "[Deployments] No pending deployments."
    }
} catch {
    Write-Log "[Deployments] Polling error: $($_.Exception.Message)"
}

Write-Log "=== Agent run complete. Next run in ~5 minutes. ==="
