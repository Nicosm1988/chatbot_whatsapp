$ErrorActionPreference = "Stop"

$stoppedWatchdogs = 0
$stoppedBots = 0

Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -in @("powershell.exe", "pwsh.exe") -and
    $_.CommandLine -like "*run_whatsapp_bot_forever.ps1*"
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    $stoppedWatchdogs += 1
  }

Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq "node.exe" -and
    $_.CommandLine -like "*src/index.js*"
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    $stoppedBots += 1
  }

Write-Output "Runtime detenido. Watchdogs: $stoppedWatchdogs. Procesos del bot: $stoppedBots."
