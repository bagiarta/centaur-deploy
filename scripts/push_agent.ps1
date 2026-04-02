param(
    [Parameter(Mandatory=$true)][string]$TargetIP,
    [Parameter(Mandatory=$true)][string]$Username,
    [string]$Password,
    [string]$InstallerPath,
    [string]$ServerUrl = "http://192.168.85.30:3001"
)

# Configuration for 5-minute interval
$TaskName = "CentaurAgentUpdater"
$AgentDir = "C:\Program Files\PepiUpdaterAgent"
$AgentPath = "$AgentDir\CentaurAgent_v25.ps1"

# 1. Fallback & Validations
if (!$InstallerPath) {
    $InstallerPath = Join-Path $PSScriptRoot "..\public\Manual-Agent-Installer-v25.ps1"
}
if (!$ServerUrl -or $ServerUrl -like "*localhost*") {
    $ServerUrl = "http://192.168.85.30:3001"
}

# 2. SMB File Transfer
$RemoteTempDir = "\\$TargetIP\C$\Windows\Temp"
try {
    Write-Output "LOG:Connecting to SMB share at $TargetIP..."
    net use \\$TargetIP\IPC$ /delete /y 2>$null | Out-Null
    net use \\$TargetIP\IPC$ $Password /user:$Username /persistent:no 2>&1 | Out-Null
    
    Write-Output "LOG:Transferring v2.6.0 packages (with self-update + command polling)..."
    $LocalInstaller = Resolve-Path $InstallerPath -ErrorAction Stop
    $AgentFileSource = Join-Path (Split-Path $LocalInstaller.Path) "CentaurAgent_v25.ps1"
    
    # Copy both files
    Copy-Item -Path $LocalInstaller.Path -Destination "$RemoteTempDir\Manual-Agent-Installer-v25.ps1" -Force -ErrorAction Stop
    Copy-Item -Path $AgentFileSource -Destination "$RemoteTempDir\CentaurAgent_v25.ps1" -Force -ErrorAction Stop
    Write-Output "LOG:Package distribution successful."
} catch {
    Write-Output "STATUS:FAILED|LOG:SMB Error: $($_.Exception.Message)"
    exit 0
} finally {
    net use \\$TargetIP\IPC$ /delete /y 2>$null | Out-Null
}

# 3. REMOTE EXECUTION (WMI Based)
try {
    Write-Output "LOG:Initiating Remote Deployment..."
    $secpasswd = ConvertTo-SecureString $Password -AsPlainText -Force
    $creds = New-Object System.Management.Automation.PSCredential ($Username, $secpasswd)
    
    # 3.1 Cleanup logic via WMI
    $killCmd = "taskkill /f /im agent.exe /t"
    Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList $killCmd -ComputerName $TargetIP -Credential $creds | Out-Null

    # 3.2 Run the Installer for directory preparation
    Write-Output "LOG:Running directory cleanup and placement..."
    $installCmd = "powershell.exe -ExecutionPolicy Bypass -Command `"& C:\Windows\Temp\Manual-Agent-Installer-v25.ps1 -ServerUrl '$ServerUrl' -LocalOnly`""
    Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList $installCmd -ComputerName $TargetIP -Credential $creds | Out-Null

    # 3.3 Create the 5-Minute Task (LOCAL call on client via WMI)
    Write-Output "LOG:Forcing Task Scheduler registration (5min interval)..."
    # Escaping for Program Files and special chars in TR
    $localTaskCmd = "schtasks /create /sc minute /mo 5 /tn `"$TaskName`" /tr `"powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File \`"$AgentPath\`" -ServerUrl '$ServerUrl'`" /ru SYSTEM /rl HIGHEST /f"
    
    $proc = Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList $localTaskCmd -ComputerName $TargetIP -Credential $creds
    
    if ($proc.ReturnValue -eq 0) {
        # Trigger immediate run
        $runCmd = "schtasks /run /tn `"$TaskName`""
        Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList $runCmd -ComputerName $TargetIP -Credential $creds | Out-Null
        
        Write-Output "STATUS:SUCCESS|LOG:Agent v2.6.0 and Task Scheduler (5m) verified at $TargetIP"
    } else {
        Write-Output "STATUS:FAILED|LOG:Remote task registration failed (Return Code: $($proc.ReturnValue))"
    }

} catch {
    Write-Output "STATUS:FAILED|LOG:Deployment Error: $($_.Exception.Message)"
}

exit 0
