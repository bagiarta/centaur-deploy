<#
.SYNOPSIS
    Mettler Toledo Scale Bridge Script for Centaur Agent.
.DESCRIPTION
    This script facilitates direct communication with Mettler Toledo scales on the local network (LAN) 
    from the store computer running Centaur Agent. Supports sending MT-SICS commands via TCP socket 
    and uploading sync files via FTP.
.PARAMETER Action
    The action to execute: "Command" or "Sync"
.PARAMETER ScaleIp
    IP address of the target scale.
.PARAMETER ScalePort
    Port number of the target scale (default 3001).
.PARAMETER SicsCommand
    The MT-SICS command string (e.g. "S", "Z", "T", "SI"). Required if Action is "Command".
.PARAMETER SyncFileUrl
    The URL to download the sync file from the Centaur Server. Required if Action is "Sync".
.PARAMETER SyncFileName
    The file name to upload. Required if Action is "Sync".
.PARAMETER ScaleJobId
    The ID of the Scale Job on the Centaur Server. Required if Action is "Sync".
.PARAMETER ServerStatusUrl
    Centaur server callback URL to report job progress.
#>

param(
    [ValidateSet("Command", "Sync")]
    [string]$Action = "Command",
    [Parameter(Mandatory=$true)]
    [string]$ScaleIp,
    [int]$ScalePort = 3001,
    [string]$SicsCommand = "S",
    [string]$SyncFileUrl,
    [string]$SyncFileName,
    [string]$ScaleJobId,
    [string]$ServerStatusUrl
)

# Bypass SSL validations
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

# ── 1. SEND MT-SICS COMMAND ──────────────────────────────────────────────────
if ($Action -eq "Command") {
    $formattedCmd = "$SicsCommand`r`n"
    Write-Host "Connecting to Mettler Toledo Scale at $ScaleIp:$ScalePort..."
    
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $connect = $client.BeginConnect($ScaleIp, $ScalePort, $null, $null)
        $wait = $connect.AsyncWaitHandle.WaitOne(3000, $false)
        if (-not $wait) {
            $client.Close()
            throw "Connection timeout to scale at $ScaleIp:$ScalePort"
        }
        $client.EndConnect($connect)
        
        $stream = $client.GetStream()
        $writer = New-Object System.IO.StreamWriter($stream)
        $reader = New-Object System.IO.StreamReader($stream)
        
        # Write MT-SICS command
        Write-Host "Sending Command: $SicsCommand"
        $writer.Write($formattedCmd)
        $writer.Flush()
        
        # Read response
        Start-Sleep -Milliseconds 300
        $response = ""
        while ($stream.DataAvailable) {
            $response += $reader.ReadLine() + "`n"
        }
        
        $writer.Close()
        $client.Close()
        
        $trimmedResponse = $response.Trim()
        if ($trimmedResponse -eq "") {
            Write-Output "STATUS:SUCCESS|LOG:Command sent. No immediate response."
        } else {
            Write-Output "STATUS:SUCCESS|LOG:$trimmedResponse"
        }
    } catch {
        Write-Output "STATUS:FAILED|LOG:Error communicating with scale: $_"
        exit 1
    }
}

# ── 2. SYNC PLU FILE VIA FTP ─────────────────────────────────────────────────
elseif ($Action -eq "Sync") {
    if (-not $SyncFileUrl -or -not $SyncFileName -or -not $ScaleJobId -or -not $ServerStatusUrl) {
        Write-Error "Parameters SyncFileUrl, SyncFileName, ScaleJobId and ServerStatusUrl are mandatory for Action 'Sync'"
        exit 1
    }

    $localTempFile = "$env:TEMP\$SyncFileName"

    # Helper function to report status back to Centaur Server
    function Report-JobStatus {
        param([string]$status, [int]$progress, [string]$log)
        $body = @{ status = $status; progress = $progress; log = $log } | ConvertTo-Json
        try {
            Invoke-RestMethod -Uri $ServerStatusUrl -Method Post -Body $body -ContentType "application/json" | Out-Null
        } catch {
            Write-Host "Warning: Failed to update Server scale job status: $_"
        }
    }

    Report-JobStatus -status "running" -progress 30 -log "Downloading PLU file from Centaur Server..."

    try {
        # Download PLU file from server
        Write-Host "Downloading $SyncFileUrl to $localTempFile..."
        $wc = New-Object System.Net.WebClient
        $wc.DownloadFile($SyncFileUrl, $localTempFile)

        Report-JobStatus -status "running" -progress 60 -log "PLU file downloaded. Uploading to scale via FTP..."

        # Upload to Scale via FTP
        $ftpUrl = "ftp://$ScaleIp/import/$SyncFileName"
        Write-Host "Uploading local file $localTempFile to FTP: $ftpUrl..."
        
        $ftpRequest = [System.Net.FtpWebRequest]::Create($ftpUrl)
        $ftpRequest.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
        $ftpRequest.Credentials = New-Object System.Net.NetworkCredential("admin", "admin") # default MT scale credentials
        $ftpRequest.Timeout = 10000 # 10s timeout
        
        $fileBytes = [System.IO.File]::ReadAllBytes($localTempFile)
        $ftpRequest.ContentLength = $fileBytes.Length
        $ftpStream = $ftpRequest.GetRequestStream()
        $ftpStream.Write($fileBytes, 0, $fileBytes.Length)
        $ftpStream.Close()
        $ftpStream.Dispose()

        # Clean up local file
        Remove-Item $localTempFile -Force -ErrorAction SilentlyContinue

        # Report Success
        Report-JobStatus -status "success" -progress 100 -log "PLU data synchronized successfully."
        Write-Output "STATUS:SUCCESS|LOG:PLU data uploaded successfully to scale at $ScaleIp"
    } catch {
        # Clean up local file
        Remove-Item $localTempFile -Force -ErrorAction SilentlyContinue

        # Report Failure
        $errorMsg = $_.Exception.Message
        Report-JobStatus -status "failed" -progress 0 -log "Sync failed: $errorMsg"
        Write-Output "STATUS:FAILED|LOG:Sync failed: $errorMsg"
        exit 1
    }
}
