$packageName = 'DigiNET v3.0.3(1)';
$sourcePath = 'F:\PepiUpdater\DIGINET\DigiNET v3.0.3(1)';
$targetDir = Join-Path ([System.IO.Path]::GetTempPath()) 'centaur-diginet';
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null;
$targetPath = Join-Path $targetDir $packageName;

if (Test-Path -LiteralPath $sourcePath) {
  if (Test-Path -LiteralPath $targetPath) { Remove-Item -LiteralPath $targetPath -Recurse -Force -ErrorAction SilentlyContinue; }
  Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Recurse -Force;

  if ($sourcePath -match '\.(exe|msi)$') {
    Write-Host "Launching installer: $targetPath";
    Start-Process -FilePath $targetPath -ArgumentList '/S' -Wait;
  } else {
    Write-Host "Package staged to $targetPath";
  }

  Write-Output "STATUS:SUCCESS|LOG:Package staged/updated at $targetPath";
} else {
  Write-Output "STATUS:FAILED|LOG:Source package not found: $sourcePath";
  exit 1;
}
