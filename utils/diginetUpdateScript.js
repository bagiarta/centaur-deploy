export function buildDigiNetUpdateScript({ packageName, packageUrl, tempRoot = '$env:TEMP' }) {
  const safePackageName = String(packageName).replace(/'/g, "''");
  const safePackageUrl = String(packageUrl).replace(/'/g, "''");
  const safeTempRoot = String(tempRoot).replace(/'/g, "''");

  return `
$packageName = '${safePackageName}';
$packageUrl = '${safePackageUrl}';
$targetRoot = '${safeTempRoot}';
$targetDir = Join-Path $targetRoot 'centaur-diginet';
$archivePath = Join-Path $targetDir "$packageName.zip";
$extractDir = Join-Path $targetDir $packageName;

New-Item -ItemType Directory -Path $targetDir -Force | Out-Null;

try {
  Invoke-WebRequest -Uri $packageUrl -OutFile $archivePath -UseBasicParsing;
  if (Test-Path -LiteralPath $extractDir) { Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue; }
  Expand-Archive -Path $archivePath -DestinationPath $extractDir -Force;
  Write-Output "STATUS:SUCCESS|LOG:Package downloaded and extracted to $extractDir";
} catch {
  Write-Output "STATUS:FAILED|LOG:$($_.Exception.Message)";
  exit 1;
}
`.trim();
}
