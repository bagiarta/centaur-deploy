param(
    [string]$ServerUrl = "http://192.168.85.30:3001",
    [switch]$LocalOnly = $false
)

# 0. Global Setup
# MANDATORY: Run as Administrator
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "ERROR: This script must be run as Administrator." -ForegroundColor Red
    Write-Output "STATUS:FAILED|LOG:Execution denied. Running without Administrator privileges."
    exit 1
}

$AgentDir = "C:\Program Files\PepiUpdaterAgent"
$AgentFile = "CentaurAgent_v25.ps1"
$AgentPath = "$AgentDir\$AgentFile"
$TaskName = "CentaurAgentUpdater"
$LogPath = "C:\Windows\Temp\centaur_v25_install.log"

# Force Correct IP if local is detected
if (!$ServerUrl -or $ServerUrl -like "*localhost*" -or $ServerUrl -like "*127.0.0.1*") {
    $ServerUrl = "http://192.168.85.30:3001"
}

# Ensure TLS 1.2
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Write-Log($msg) {
    try {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        "$timestamp - $msg" | Out-File -FilePath $LogPath -Append
    } catch { }
    Write-Host $msg
}

Write-Log "--- Centaur Deploy Agent v2.5.0 Installer Start ---"

# 1. CLEANUP OLD INSTALLATIONS
Write-Log "[1/4] Cleaning up legacy components..."
try {
    taskkill /f /im agent.exe /t 2>$null | Out-Null
    taskkill /f /im PepiAgent.exe /t 2>$null | Out-Null

    $oldServices = @("CentaurAgent", "PepiUpdaterAgent", "AgentService")
    foreach ($svcName in $oldServices) {
        if (Get-Service -Name $svcName -ErrorAction SilentlyContinue) {
            Write-Log "Removing legacy service: $svcName"
            Stop-Service -Name $svcName -Force -ErrorAction SilentlyContinue
            & sc.exe delete $svcName
        }
    }

    $oldTasks = @("CentaurAgent", "PepiAgent", "PepiUpdaterTask", "CentaurAgentUpdater")
    foreach ($tName in $oldTasks) {
        & schtasks /delete /tn $tName /f 2>$null | Out-Null
    }
} catch {
    Write-Log "Warning: Cleanup error: $($_.Exception.Message)"
}

# 2. PREPARE ENVIRONMENT
Write-Log "[2/4] Wiping and preparing target directory: $AgentDir"
if (Test-Path $AgentDir) {
    try {
        Get-ChildItem -Path $AgentDir -File -Recurse | Remove-Item -Force -ErrorAction SilentlyContinue
        Get-ChildItem -Path $AgentDir -Directory -Recurse | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
    } catch { }
} else {
    New-Item -ItemType Directory -Path $AgentDir -Force | Out-Null
}

# 3. OBTAIN NEW AGENT
Write-Log "[3/4] Obtaining Agent core file..."
try {
    $TempSource = "C:\Windows\Temp\$AgentFile"
    if ($LocalOnly -and (Test-Path $TempSource)) {
        Write-Log "Offline Copy from Temp..."
        Copy-Item -Path $TempSource -Destination $AgentPath -Force -ErrorAction Stop
    } else {
        Write-Log "Online Download from $ServerUrl..."
        Invoke-WebRequest -Uri "$ServerUrl/$AgentFile" -OutFile $AgentPath -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
    }
    Write-Log "Success: Agent core placed."
} catch {
    Write-Log "FATAL ERROR: Fetching agent failed: $($_.Exception.Message)"
    Write-Output "STATUS:FAILED|LOG:Fetch Error: $($_.Exception.Message)"
    exit 1
}

# 4. REGISTER SCHEDULED TASK
Write-Log "[4/4] Registering Task Scheduler (Every 5 Minutes)..."
try {
    # Building command string with robust quoting for Paths and URLs
    $taskRun = "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File \`"$AgentPath\`" -ServerUrl \`"$ServerUrl\`""
    
    # Use schtasks as primary, check $LASTEXITCODE instead of string matching (to support non-English Windows)
    & schtasks /create /sc minute /mo 5 /tn "$TaskName" /tr "$taskRun" /ru SYSTEM /rl HIGHEST /f 2>$null | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Log "Success: Task registered via SchTasks."
        & schtasks /run /tn "$TaskName" | Out-Null
    } else {
        # Try fallback using PS cmdlets if schtasks failed or produced non-zero exit
        Write-Log "SchTasks returned exit code $LASTEXITCODE. Trying PowerShell Fallback (v4.0+)..."
        
        $Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$AgentPath`" -ServerUrl `"$ServerUrl`""
        $Trigger = New-ScheduledTaskTrigger -At (Get-Date).AddSeconds(10) -RepetitionInterval (New-TimeSpan -Minutes 5) 
        $Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
        $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances Parallel
        
        Register-ScheduledTask -TaskName "$TaskName" -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force -ErrorAction Stop | Out-Null
        Start-ScheduledTask -TaskName "$TaskName" | Out-Null
        Write-Log "Success: Task registered via PS Fallback."
    }
} catch {
    Write-Log "FATAL ERROR: Both registration methods failed: $($_.Exception.Message)"
    Write-Output "STATUS:FAILED|LOG:Registration Error: $($_.Exception.Message)"
    exit 1
}

# FINAL RE-VERIFICATION
if (& schtasks /query /tn "$TaskName" 2>$null) {
    Write-Log "INSTALLATION COMPLETE (Verified 5min Interval via $ServerUrl)!"
    Write-Output "STATUS:SUCCESS|LOG:Agent v2.5.0 installed and task verified (Server: $ServerUrl)."
} else {
    Write-Output "STATUS:FAILED|LOG:Verification Error: Task missing."
    exit 1
}

exit 0
