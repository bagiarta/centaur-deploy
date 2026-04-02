param(
    [string]$ServerUrl = "http://192.168.85.30:3001",
    [string]$InstallPath = "C:\Program Files\PepiUpdaterAgent"
)

$Hostname = $env:COMPUTERNAME

# Utility to log
function Write-AgentLog {
    param([string]$Message)
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $logLine = "[$timestamp] $Message"
    Write-Host $logLine
    Add-Content -Path "$InstallPath\agent.log" -Value $logLine
}

Write-AgentLog "Starting PepiAgent Execution Cycle..."

# 1. Gather Telemetry (Live Resource Metrics)
try {
    $cpu = Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average | Select-Object -ExpandProperty Average
    
    $os = Get-CimInstance Win32_OperatingSystem
    $ramTotal = $os.TotalVisibleMemorySize
    $ramFree = $os.FreePhysicalMemory
    $ramUsageRaw = (($ramTotal - $ramFree) / $ramTotal) * 100
    $ramUsage = [math]::Round($ramUsageRaw)

    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
    $diskTotal = $disk.Size
    $diskFree = $disk.FreeSpace
    $diskUsageRaw = (($diskTotal - $diskFree) / $diskTotal) * 100
    $diskUsage = [math]::Round($diskUsageRaw)

    $telemetryData = @{
        hostname = $Hostname
        cpu_usage = $cpu
        ram_usage = $ramUsage
        disk_usage = $diskUsage
    }

    $jsonTelemetry = $telemetryData | ConvertTo-Json
    Invoke-RestMethod -Uri "$ServerUrl/api/agent/telemetry" -Method Post -Body $jsonTelemetry -ContentType "application/json" -ErrorAction Stop
    Write-AgentLog "Telemetry sent successfully: CPU $cpu%, RAM $ramUsage%, DISK $diskUsage%"
} catch {
    Write-AgentLog "Failed to send telemetry: $_"
}

# 2. Check for Deployments
try {
    $PendingUrl = "$ServerUrl/api/agent/pending?hostname=$Hostname"
    $tasks = Invoke-RestMethod -Uri $PendingUrl -Method Get -ErrorAction Stop

    foreach ($task in $tasks) {
        Write-AgentLog "Processing deployment task: $($task.deployment_id) - Package: $($task.pkg_name)"
        
        $downloadUrl = "$ServerUrl/api/packages/download/$($task.package_id)"
        $tempZip = "$env:TEMP\update_$($task.package_id).zip"
        
        # Download Package
        Write-AgentLog "Downloading package from $downloadUrl to $tempZip"
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -ErrorAction Stop

        $TargetFolder = $task.target_path
        
        # SELF-UPDATE LOGIC
        if ($TargetFolder -eq "C:\Program Files\PepiUpdaterAgent" -or $task.pkg_name -match "Agent") {
            Write-AgentLog "Self-Update detected! Applying rename trick..."
            
            # Rename currently running script to avoid file lock
            $currentScriptPath = $MyInvocation.MyCommand.Path
            $oldScriptPath = "$currentScriptPath.old"
            
            if (Test-Path $oldScriptPath) { Remove-Item $oldScriptPath -Force -ErrorAction SilentlyContinue }
            
            Write-AgentLog "Renaming $currentScriptPath to $oldScriptPath"
            Rename-Item -Path $currentScriptPath -NewName (Split-Path $oldScriptPath -Leaf) -Force
            
            Write-AgentLog "Extracting new agent over $TargetFolder"
            Expand-Archive -Path $tempZip -DestinationPath $TargetFolder -Force
            
            Write-AgentLog "Extraction complete. The new agent is in place."
            $statusStr = "success"
            $logStr = "Agent updated successfully."
            
            # Cleanup Zip
            Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
        } else {
            # Standard Deployment Logic
            Write-AgentLog "Extracting package to $TargetFolder"
            if (!(Test-Path $TargetFolder)) { New-Item -ItemType Directory -Force -Path $TargetFolder | Out-Null }
            Expand-Archive -Path $tempZip -DestinationPath $TargetFolder -Force
            
            $statusStr = "success"
            $logStr = "Extracted to $TargetFolder successfully."
            
            # Cleanup
            Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
        }

        # Report Status back to server
        $statusBody = @{
            deployment_id = $task.deployment_id
            device_id = $task.device_id
            status = $statusStr
            progress = 100
            log = $logStr
        } | ConvertTo-Json
        
        Invoke-RestMethod -Uri "$ServerUrl/api/agent/deploy-status" -Method Post -Body $statusBody -ContentType "application/json" -ErrorAction Stop
        Write-AgentLog "Deployment status reported: $statusStr"
        
        # If it was a self-update, exit so task scheduler brings up the new version next cycle
        if ($TargetFolder -eq "C:\Program Files\PepiUpdaterAgent" -or $task.pkg_name -match "Agent") {
            Write-AgentLog "Self-update finished. Exiting current process. New version will run next cycle."
            exit 0
        }
    }
} catch {
    Write-AgentLog "Failed during deployment processing: $_"
}

# 3. Check for PowerShell Commands
try {
    $CommandUrl = "$ServerUrl/api/agent/commands?hostname=$Hostname"
    $psTasks = Invoke-RestMethod -Uri $CommandUrl -Method Get -ErrorAction Stop

    foreach ($psTask in $psTasks) {
        Write-AgentLog "Processing PS command task: $($psTask.id)"
        
        $scriptToRun = $psTask.script
        $psLog = ""
        $psStatus = "success"

        # Skip internal server-side commands that should NOT be executed locally by the agent
        $internalCommands = @("INTERNAL_PUSH_AGENT", "INTERNAL_REBOOT", "INTERNAL_SHUTDOWN")
        if ($internalCommands -contains $scriptToRun.Trim()) {
            Write-AgentLog "Skipping internal server command: $scriptToRun"
            $psStatus = "skipped"
            $psLog = "This command is handled server-side via WMI and is not executed locally."
            
            $psStatusBody = @{
                task_id = $psTask.id
                status = $psStatus
                log = $psLog
            } | ConvertTo-Json
            Invoke-RestMethod -Uri "$ServerUrl/api/agent/command-status" -Method Post -Body $psStatusBody -ContentType "application/json" -ErrorAction SilentlyContinue
            continue
        }

        try {
            Write-AgentLog "Executing Script Content..."
            # Execute and capture output/error
            $output = Invoke-Expression $scriptToRun 2>&1 | Out-String
            $psLog = $output
        } catch {
            $psStatus = "failed"
            $psLog = $_.Exception.Message
            Write-AgentLog "Script execution failed: $psLog"
        }

        # Report Status back to server
        $psStatusBody = @{
            task_id = $psTask.id
            status = $psStatus
            log = $psLog
        } | ConvertTo-Json
        
        Invoke-RestMethod -Uri "$ServerUrl/api/agent/command-status" -Method Post -Body $psStatusBody -ContentType "application/json" -ErrorAction Stop
        Write-AgentLog "PS Command status reported: $psStatus"
    }
} catch {
    Write-AgentLog "Failed during PS command processing: $_"
}

# 4. Software Inventory Sync (Once per 24 hours or if missing)
try {
    $inventoryLastRunFile = "$InstallPath\inventory_last_run.txt"
    $shouldRunInventory = $true
    
    if (Test-Path $inventoryLastRunFile) {
        $lastRunDate = Get-Content $inventoryLastRunFile
        if ([DateTime]$lastRunDate -gt (Get-Date).AddHours(-24)) {
            $shouldRunInventory = $false
        }
    }

    if ($shouldRunInventory) {
        Write-AgentLog "Starting Software Inventory Sync..."
        
        # Collect from Registry (more reliable than Get-Package for all types)
        $software = @()
        $registryPaths = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*", 
                         "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
                         "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
        
        foreach ($path in $registryPaths) {
            $items = Get-ItemProperty $path -ErrorAction SilentlyContinue
            foreach ($item in $items) {
                if ($item.DisplayName) {
                    $software += @{
                        name = $item.DisplayName
                        version = $item.DisplayVersion
                        publisher = $item.Publisher
                        install_date = $item.InstallDate
                    }
                }
            }
        }
        
        # Unique by name to avoid duplicates from multiple registry locations
        $uniqueSoftware = $software | Sort-Object name -Unique
        
        $inventoryBody = @{
            device_id = $Hostname # Using Hostname as device_id for simplicity if IDs match
            software = $uniqueSoftware
        } | ConvertTo-Json -Depth 10
        
        Invoke-RestMethod -Uri "$ServerUrl/api/agent/software-inventory" -Method Post -Body $inventoryBody -ContentType "application/json" -ErrorAction Stop
        Write-AgentLog "Software inventory synced: $($uniqueSoftware.Count) items found."
        
        (Get-Date).ToString("yyyy-MM-dd HH:mm:ss") | Out-File $inventoryLastRunFile -Force
    }
} catch {
    Write-AgentLog "Failed during Software Inventory Sync: $_"
}

Write-AgentLog "Cycle Complete."
