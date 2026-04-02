# Simulation of Tiered IP detection logic
$allIPs = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" }
Write-Host "All available IPv4 addresses:"
$allIPs | Select-Object InterfaceAlias, IPAddress | Format-Table

# 1. Try RFC 1918 Private Ranges (Highest Priority)
$SelectedIP = ($allIPs | Where-Object { 
    $_.IPAddress -match "^10\." -or 
    $_.IPAddress -match "^172\.(1[6-9]|2[0-9]|3[01])\." -or 
    $_.IPAddress -match "^192\.168\."
} | Select-Object -First 1).IPAddress

# 2. Try APIPA / Link-Local (Second Priority)
if (!$SelectedIP) {
    Write-Host "No RFC 1918 IP found, trying APIPA..."
    $SelectedIP = ($allIPs | Where-Object { $_.IPAddress -match "^169\.254\." } | Select-Object -First 1).IPAddress
}

# 3. Fallback to any IPv4
if (!$SelectedIP) {
    Write-Host "No private IP found, falling back to anything..."
    $SelectedIP = ($allIPs | Select-Object -First 1).IPAddress
}

Write-Host "`nSelected Management IP: $SelectedIP"
