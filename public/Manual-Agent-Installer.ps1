param(
    [string]$ServerUrl = "http://192.168.85.30:3001"
)

# Elevate privileges if not running as admin
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warning "Please run this script as Administrator. Relaunching..."
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -ServerUrl `"$ServerUrl`"" -Verb RunAs
    exit
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   CentralDeploy Agent Manual Installer   " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

$installPath = "C:\Program Files\PepiUpdaterAgent"

if (!(Test-Path $installPath)) {
    New-Item -ItemType Directory -Force -Path $installPath | Out-Null
}

$Hostname = $env:COMPUTERNAME
# Get primary IPv4 address
$IPAddress = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi","Ethernet" -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^169\.' -and $_.IPAddress -notmatch '^127\.' } | Select-Object -First 1).IPAddress

if (-not $IPAddress) {
    # Fallback to older method
    $IPAddress = [System.Net.Dns]::GetHostAddresses($Hostname) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -ExpandProperty IPAddressToString -First 1
}

$OSVersion = (Get-CimInstance Win32_OperatingSystem).Caption
$Status = "online"
$LastSeen = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")

Write-Host "Registering device with CentralDeploy Server at $ServerUrl..."
Write-Host "Hostname: $Hostname"
Write-Host "IP: $IPAddress"
Write-Host "OS: $OSVersion"

# Simulate Agent Service by registering the device directly to the server database
$DeviceData = @{
    id = "dev-$(New-Guid)"
    hostname = $Hostname
    ip = $IPAddress
    os = $OSVersion
    status = $Status
    last_seen = $LastSeen
}

$jsonBody = $DeviceData | ConvertTo-Json

try {
    # Since we don't have a direct /api/agent/register yet, we use the logic to insert into Devices
    # Let's hit a specialized endpoint or just a generic device creation endpoint if it exists
    Invoke-RestMethod -Uri "$ServerUrl/api/devices/register" -Method Post -Body $jsonBody -ContentType "application/json" -ErrorAction Stop
    Write-Host "Registration successful!" -ForegroundColor Green
    
    # 2. Download the real agent.exe
    Write-Host "Cleaning up existing agent process..."
    Stop-Process -Name "agent" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    
    Write-Host "Downloading agent executable..."
    $agentUrl = "$ServerUrl/agent.exe"
    $agentPath = Join-Path $installPath "agent.exe"
    
    # Try multiple times in case of locks
    for ($i=1; $i -le 3; $i++) {
        try {
            Invoke-WebRequest -Uri $agentUrl -OutFile $agentPath -ErrorAction Stop
            break
        } catch {
            if ($i -eq 3) { throw $_ }
            Write-Warning "Retry $i: Failed to overwrite agent.exe. Waiting..."
            Stop-Process -Name "agent" -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
    }
    
    # Create a dummy config file
    $DeviceData | ConvertTo-Json | Out-File "$installPath\agent_config.json"
    
    # 3. Setup Scheduled Task to run every 5 minutes
    Write-Host "Setting up Scheduled Task 'CentaurAgent' to run every 5 minutes..."
    
    $action = New-ScheduledTaskAction -Execute $agentPath -WorkingDirectory $installPath
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    
    # Register the task (overwrite if exists)
    Unregister-ScheduledTask -TaskName "CentaurAgent" -Confirm:$false -ErrorAction SilentlyContinue
    Register-ScheduledTask -TaskName "CentaurAgent" -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
    
    Write-Host "Agent installed and scheduled successfully!" -ForegroundColor Green
    Write-Host "The agent will check for updates every 5 minutes."
} catch {
    Write-Error "Failed to install agent: $_"
    exit 1
}

Start-Sleep -Seconds 3
