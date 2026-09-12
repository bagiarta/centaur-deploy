param(
    [string]$ServerUrl
)

$Hostname = $env:COMPUTERNAME

# Save ServerUrl to registry for the WMI Action block to read
$RegPath = "HKLM:\SOFTWARE\CentaurAgent"
if (!(Test-Path $RegPath)) { New-Item -Path $RegPath -Force | Out-Null }
Set-ItemProperty -Path $RegPath -Name "ServerUrl" -Value $ServerUrl | Out-Null

function Set-UsbPolicy {
    param([string]$Action)
    try {
        $UsbStorPath = "HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR"
        $RemovablePolicyPath = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices"
        $StoragePoliciesPath = "HKLM:\SYSTEM\CurrentControlSet\Control\StorageDevicePolicies"
        
        if (!(Test-Path $StoragePoliciesPath)) { New-Item -Path $StoragePoliciesPath -Force | Out-Null }
        if (!(Test-Path $RemovablePolicyPath)) { New-Item -Path $RemovablePolicyPath -Force -ErrorAction SilentlyContinue | Out-Null }
        
        if ($Action -eq "block") {
            Set-ItemProperty -Path $UsbStorPath -Name "Start" -Value 4
            Set-ItemProperty -Path $RemovablePolicyPath -Name "Deny_All" -Value 1 -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $StoragePoliciesPath -Name "WriteProtect" -Value 0
        } elseif ($Action -eq "readonly") {
            Set-ItemProperty -Path $UsbStorPath -Name "Start" -Value 3
            Set-ItemProperty -Path $RemovablePolicyPath -Name "Deny_All" -Value 0 -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $RemovablePolicyPath -Name "Deny_Write" -Value 1 -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $StoragePoliciesPath -Name "WriteProtect" -Value 1
        } else {
            Set-ItemProperty -Path $UsbStorPath -Name "Start" -Value 3
            Set-ItemProperty -Path $RemovablePolicyPath -Name "Deny_All" -Value 0 -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $RemovablePolicyPath -Name "Deny_Write" -Value 0 -ErrorAction SilentlyContinue
            Set-ItemProperty -Path $StoragePoliciesPath -Name "WriteProtect" -Value 0
        }
        
        Start-Process "gpupdate.exe" -ArgumentList "/force", "/wait:0" -WindowStyle Hidden -ErrorAction SilentlyContinue
    } catch {
    }
}

function Sync-Policy {
    try {
        $Response = Invoke-RestMethod -Uri "$ServerUrl/api/usb/policies/evaluate?hostname=$Hostname" -Method Get -TimeoutSec 10
        $AppliedAction = $Response.action
        Set-UsbPolicy -Action $AppliedAction
    } catch {}
}

# 1. Sync policy immediately upon execution
Sync-Policy

# 2. Register WMI listener for logging
$Query = "SELECT * FROM __InstanceCreationEvent WITHIN 2 WHERE TargetInstance ISA 'Win32_PnPEntity' AND TargetInstance.DeviceID LIKE 'USB\\%'"
$Identifier = "USBInsertionListener"
Get-EventSubscriber -SourceIdentifier $Identifier -ErrorAction SilentlyContinue | Unregister-Event -Force

Register-WmiEvent -Query $Query -SourceIdentifier $Identifier -Action {
    $Target = $Event.SourceEventArgs.NewEvent.TargetInstance
    if ($Target.Service -ne 'USBSTOR' -and $Target.Service -ne 'UASPStor') { return }
    
    $RegStart = (Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\USBSTOR" -ErrorAction SilentlyContinue).Start
    $RegDenyAll = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices" -ErrorAction SilentlyContinue).Deny_All
    $RegDenyWrite = (Get-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices" -ErrorAction SilentlyContinue).Deny_Write
    
    $ActionTaken = "UNKNOWN"
    if ($RegStart -eq 4 -or $RegDenyAll -eq 1) {
        $ActionTaken = "BLOCKED"
    } elseif ($RegDenyWrite -eq 1) {
        $ActionTaken = "READ-ONLY"
    } else {
        $ActionTaken = "ALLOWED"
    }
    
    $VendorID = ""
    $ProductID = ""
    try {
        $PnpParts = $Target.PNPDeviceID.Split('\')[1].Split('&')
        $VendorID = $PnpParts[0] -replace 'VEN_',''
        $ProductID = $PnpParts[1] -replace 'DEV_',''
    } catch {}
    
    try {
        $SavedUrl = (Get-ItemProperty -Path "HKLM:\SOFTWARE\CentaurAgent" -Name "ServerUrl" -ErrorAction SilentlyContinue).ServerUrl
        if (-not $SavedUrl) { return }
        
        $Payload = @{
            device_id = $env:COMPUTERNAME
            hostname = $env:COMPUTERNAME
            action_taken = $ActionTaken
            device_details = @{
                vendor_id = $VendorID
                product_id = $ProductID
                serial_number = "N/A"
                manufacturer = $Target.Manufacturer
                product_name = $Target.Name
            }
        } | ConvertTo-Json -Depth 5
        Invoke-RestMethod -Uri "$SavedUrl/api/usb/webhook" -Method Post -Body $Payload -ContentType "application/json" -TimeoutSec 5 | Out-Null
    } catch {}
}
