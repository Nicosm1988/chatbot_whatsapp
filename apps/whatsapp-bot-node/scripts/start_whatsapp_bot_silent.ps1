$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "run_whatsapp_bot_forever.ps1"
$restartPath = Join-Path $PSScriptRoot "restart_whatsapp_lab.ps1"
$browserPath = Join-Path $PSScriptRoot "start_whatsapp_remote_browser.ps1"
$appRoot = Split-Path -Parent $PSScriptRoot
$readyUrl = "http://localhost:3000/api/system/ready"
$livenessUrl = "http://localhost:3000/api/system/liveness"
$mutexName = "FarmaciaDelkoBotWatchdog"

function Test-BotHealth {
  try {
    $response = Invoke-RestMethod -Uri $readyUrl -TimeoutSec 3
    return [bool]$response.services.whatsapp.ready -and [bool]$response.services.whatsapp.authenticated
  } catch {
    return $false
  }
}

function Test-BotLiveness {
  try {
    $response = Invoke-RestMethod -Uri $livenessUrl -TimeoutSec 3
    return [bool]$response.ok
  } catch {
    return $false
  }
}

$alreadyRunning = $false
try {
  $mutex = [System.Threading.Mutex]::OpenExisting($mutexName)
  if ($mutex) {
    $alreadyRunning = $true
    $mutex.Dispose()
  }
} catch [System.Threading.WaitHandleCannotBeOpenedException] {
  $alreadyRunning = $false
}

if ($alreadyRunning) {
  if ((Test-BotHealth) -and (Test-BotLiveness)) {
    Write-Output "El watchdog del bot ya esta corriendo. Se recupera la ventana operativa."
    & $browserPath | Out-Null
    exit 0
  }

  Write-Output "El watchdog ya estaba corriendo, pero el bot no estaba operativo. Se solicita una recomposicion del stack."
  Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$restartPath`"" `
    -WorkingDirectory $appRoot `
    -WindowStyle Hidden | Out-Null
  exit 0
}

Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`"" `
  -WorkingDirectory $appRoot `
  -WindowStyle Hidden | Out-Null

Start-Sleep -Seconds 2
& $browserPath | Out-Null

Write-Output "Bot iniciado en segundo plano."
