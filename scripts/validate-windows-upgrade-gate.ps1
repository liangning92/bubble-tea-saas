$ErrorActionPreference = 'Stop'
$installer = (Get-ChildItem 'release/BTPS-*-Windows-x64.exe' | Select-Object -First 1).FullName
$appPath = (Resolve-Path 'release/win-unpacked/BTPS.exe').Path
$seed = (Resolve-Path 'release/win-unpacked/resources/app.asar.unpacked/server/prisma/seed.db').Path
$fixture = Join-Path $env:RUNNER_TEMP 'btps-installer-guard-synthetic'
if (Test-Path $fixture) { throw 'Synthetic fixture must be new' }
New-Item -ItemType Directory $fixture | Out-Null
$target = Join-Path $fixture 'BTPS'
New-Item -ItemType Directory $target | Out-Null
$oldExe = Join-Path $target 'BTPS.exe'
$aliveScript = Join-Path $fixture 'keep-synthetic-old-process.cjs'
Set-Content $aliveScript 'setInterval(() => {}, 1000)' -Encoding utf8
$guid = node -e "const {UUID}=require('builder-util-runtime'); console.log(UUID.v5('com.bubbletea.pos',UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3')))"
$registry = "HKCU:\Software\$guid"
if (Test-Path $registry) { throw 'Existing registry refused: runner is not clean' }
$dataRoot = Join-Path $env:APPDATA 'BTPS'
if (Test-Path $dataRoot) { throw 'Existing app data refused: runner is not clean' }
$env:ELECTRON_RUN_AS_NODE = '1'
$oldProcess = Start-Process $appPath -ArgumentList "`"$aliveScript`"" -PassThru
$registryOwned = $false
$dataOwned = $false
$reports = @()
function Invoke-BlockedInstaller($case) {
  $process = Start-Process $installer -ArgumentList '/S', "/D=$target" -Wait -PassThru
  if ($process.ExitCode -ne 73) { throw "$case did not refuse before installation: $($process.ExitCode)" }
  $oldProcess.Refresh()
  if ($oldProcess.HasExited) { throw "$case killed the usable old POS process" }
  return @{ case = $case; installerExitCode = $process.ExitCode; oldProcessPreserved = $true }
}
try {
  Start-Sleep -Seconds 1
  Set-Content $oldExe 'synthetic usable old version' -Encoding utf8
  $hash = (Get-FileHash $oldExe -Algorithm SHA256).Hash
  $reports += Invoke-BlockedInstaller 'existing executable, no registered installation'
  if ((Get-FileHash $oldExe -Algorithm SHA256).Hash -ne $hash) { throw 'Old executable overwritten' }
  Remove-Item $oldExe

  New-Item $registry | Out-Null
  $registryOwned = $true
  New-ItemProperty $registry -Name InstallLocation -Value $target -PropertyType String | Out-Null
  $reports += Invoke-BlockedInstaller 'registered installation, no executable'
  if ((Get-ItemProperty $registry).InstallLocation -ne $target) { throw 'Old installation registry changed' }
  Remove-Item $registry
  $registryOwned = $false

  New-Item -ItemType Directory (Join-Path $dataRoot 'data') | Out-Null
  $dataOwned = $true
  $db = Join-Path $dataRoot 'data/dev.db'
  Copy-Item $seed $db
  $dbHash = (Get-FileHash $db -Algorithm SHA256).Hash
  $reports += Invoke-BlockedInstaller 'existing user database, even with new compatible column'
  if ((Get-FileHash $db -Algorithm SHA256).Hash -ne $dbHash) { throw 'User database bytes changed' }
  if (Test-Path $oldExe) { throw 'Candidate files installed despite refusal' }
  @{ syntheticOnly = $true; noRealDatabaseAccess = $true; databaseBytesPreserved = $true; cases = $reports } | ConvertTo-Json -Depth 5 | Set-Content 'desktop-upgrade-gate-report.json' -Encoding utf8
  Write-Host 'All silent installer refusals preserve old process, files, registry and database'
} finally {
  if (!$oldProcess.HasExited) { Stop-Process -Id $oldProcess.Id -Force }
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  if ($registryOwned) { Remove-Item $registry }
  if ($dataOwned) { Remove-Item $dataRoot -Recurse }
}
