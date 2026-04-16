$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $PSScriptRoot
$profileRoot = if ($env:LOCALAPPDATA) {
  Join-Path $env:LOCALAPPDATA "DelkoBot\chrome-remote-profile"
} else {
  ".chrome-remote-profile"
}
$debugPort = if ($env:WHATSAPP_WEB_REMOTE_DEBUGGING_PORT) {
  $env:WHATSAPP_WEB_REMOTE_DEBUGGING_PORT
} else {
  "9222"
}
$debugUrl = "http://127.0.0.1:$debugPort/json/version"
$healthUrl = "http://localhost:3000/health"
$readyUrl = "http://localhost:3000/api/system/ready"
$livenessUrl = "http://localhost:3000/api/system/liveness"
$logPath = Join-Path $appRoot ".watchdog.log"
$stdoutPath = Join-Path $appRoot ".run-connected.out.log"
$stderrPath = Join-Path $appRoot ".run-connected.err.log"
$envFilePath = Join-Path $appRoot ".env.local"
$startupGraceSeconds = 180
$nodeHealthFailures = 0
$botReadyFailures = 0
$botLivenessFailures = 0
$lastStackStartAt = Get-Date
$lastAwaitingScanLogAt = [datetime]::MinValue
$mutexName = "FarmaciaDelkoBotWatchdog"
$watchdogMutex = $null

function Write-WatchdogLog {
  param([string]$Message)

  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $logPath -Value $line
}

function Get-EnvFileValue {
  param(
    [string]$Name
  )

  if (-not (Test-Path $envFilePath)) {
    return ""
  }

  $prefix = "$Name="
  foreach ($line in Get-Content $envFilePath) {
    if ($line.StartsWith($prefix)) {
      return $line.Substring($prefix.Length).Trim()
    }
  }

  return ""
}

function Get-WhatsAppWebAuthMode {
  $value = (Get-EnvFileValue -Name "WHATSAPP_WEB_AUTH_MODE").ToLowerInvariant()
  if (-not $value) {
    return "local_auth"
  }

  return $value
}

$useConnectedBrowser = (Get-WhatsAppWebAuthMode) -eq "connected_browser"

function Get-AppNodeProcesses {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq "node.exe" -and
      $_.CommandLine -like "*src/index.js*"
    }
}

function Ensure-SingleAppNodeProcess {
  $processes = @(Get-AppNodeProcesses | Sort-Object CreationDate)
  if ($processes.Count -le 1) {
    return
  }

  $keep = $processes[-1]
  foreach ($process in $processes[0..($processes.Count - 2)]) {
    Write-WatchdogLog "Deteniendo instancia duplicada de node PID=$($process.ProcessId)"
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }

  Write-WatchdogLog "Se conserva la instancia principal de node PID=$($keep.ProcessId)"
}

function Stop-AppNodeProcesses {
  Get-AppNodeProcesses | ForEach-Object {
    Write-WatchdogLog "Deteniendo node PID=$($_.ProcessId)"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Stop-RemoteBrowserProcesses {
  if (-not $useConnectedBrowser) {
    return
  }

  Get-CimInstance Win32_Process |
    Where-Object {
      ($_.Name -eq "chrome.exe" -or $_.Name -eq "msedge.exe") -and
      (
        $_.CommandLine -like "*$profileRoot*" -or
        $_.CommandLine -like "*--remote-debugging-port=$debugPort*"
      )
    } |
    ForEach-Object {
      Write-WatchdogLog "Deteniendo navegador remoto PID=$($_.ProcessId)"
      $process = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
      if ($process) {
        $null = $process.CloseMainWindow()
        Start-Sleep -Milliseconds 700
        if (-not $process.HasExited) {
          Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
      }
    }
}

function Test-RemoteBrowser {
  if (-not $useConnectedBrowser) {
    return $true
  }

  try {
    Invoke-RestMethod -Uri $debugUrl -TimeoutSec 3 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Start-RemoteBrowser {
  if (-not $useConnectedBrowser) {
    return
  }

  Write-WatchdogLog "Levantando navegador remoto"
  & (Join-Path $PSScriptRoot "start_whatsapp_remote_browser.ps1") | Out-Null
}

function Start-AppNode {
  if (-not (Test-Path $stdoutPath)) {
    Set-Content -Path $stdoutPath -Value ""
  }

  if (-not (Test-Path $stderrPath)) {
    Set-Content -Path $stderrPath -Value ""
  }

  Write-WatchdogLog "Levantando bot Node"
  Start-Process -FilePath "node.exe" `
    -WorkingDirectory $appRoot `
    -ArgumentList "src/index.js" `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath | Out-Null

  $script:lastStackStartAt = Get-Date
}

function Restart-NodeOnly {
  Write-WatchdogLog "Reiniciando solo Node para preservar la sesion del navegador"
  Stop-AppNodeProcesses
  Start-Sleep -Seconds 1
  Start-AppNode
}

function Test-Health {
  try {
    $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
    return [bool]$response.ok
  } catch {
    return $false
  }
}

function Test-BotReady {
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

function Get-ReadySnapshot {
  try {
    return Invoke-RestMethod -Uri $readyUrl -TimeoutSec 3
  } catch {
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      try {
        return $_.ErrorDetails.Message | ConvertFrom-Json
      } catch {
        return $null
      }
    }

    return $null
  }
}

function Restart-BotStack {
  Write-WatchdogLog "Reiniciando stack completo del bot"
  Stop-AppNodeProcesses
  if ($useConnectedBrowser) {
    Stop-RemoteBrowserProcesses
    Start-Sleep -Seconds 2
    Start-RemoteBrowser
    Start-Sleep -Seconds 3
  }
  Start-AppNode
}

function In-StartupGraceWindow {
  $elapsed = ((Get-Date) - $script:lastStackStartAt).TotalSeconds
  return $elapsed -lt $startupGraceSeconds
}

function Should-LogAwaitingScan {
  $now = Get-Date
  if ((($now - $script:lastAwaitingScanLogAt).TotalSeconds) -ge 30) {
    $script:lastAwaitingScanLogAt = $now
    return $true
  }

  return $false
}

try {
  $createdNew = $false
  $watchdogMutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)
  if (-not $createdNew) {
    exit 0
  }

  Write-WatchdogLog "Watchdog iniciado"

  while ($true) {
    try {
    Ensure-SingleAppNodeProcess

    if ($useConnectedBrowser -and -not (Test-RemoteBrowser)) {
      Restart-BotStack
      $nodeHealthFailures = 0
      $botReadyFailures = 0
      $botLivenessFailures = 0
      Start-Sleep -Seconds 8
      continue
    }

    if (-not (Get-AppNodeProcesses)) {
      Start-AppNode
      Start-Sleep -Seconds 6
      continue
    }

    if (-not (Test-Health)) {
      $nodeHealthFailures += 1
      Write-WatchdogLog "Health local fallido ($nodeHealthFailures/5)"
      if ($nodeHealthFailures -ge 5) {
        if ($useConnectedBrowser -and (Test-RemoteBrowser)) {
          Restart-NodeOnly
        } else {
          Restart-BotStack
        }
        $nodeHealthFailures = 0
        $botReadyFailures = 0
        $botLivenessFailures = 0
        Start-Sleep -Seconds 8
        continue
      }
    } else {
      $nodeHealthFailures = 0
    }

    $readySnapshot = Get-ReadySnapshot
    $whatsAppService = $readySnapshot.services.whatsapp
    $awaitingScan = [bool]$whatsAppService.awaitingScan
    $authenticated = [bool]$whatsAppService.authenticated
    $sessionInitialized = [bool]$whatsAppService.sessionInitialized

    if (-not ($authenticated -and [bool]$whatsAppService.ready)) {
      if ($awaitingScan) {
        if ((Should-LogAwaitingScan)) {
          Write-WatchdogLog "WhatsApp esperando escaneo del QR; no se reinicia el stack."
        }
        Start-Sleep -Seconds 5
        continue
      }

      if ((-not $sessionInitialized) -and (In-StartupGraceWindow)) {
        Write-WatchdogLog "WhatsApp aun inicializando sesion; se respeta la ventana de gracia de $startupGraceSeconds s"
        Start-Sleep -Seconds 5
        continue
      }

      if ((In-StartupGraceWindow)) {
        Write-WatchdogLog "WhatsApp aun iniciando; se respeta la ventana de gracia de $startupGraceSeconds s"
        Start-Sleep -Seconds 5
        continue
      }

      $botReadyFailures += 1
      Write-WatchdogLog "WhatsApp no listo ($botReadyFailures/6)"
      if ($botReadyFailures -ge 6) {
        if ($useConnectedBrowser -and (Test-RemoteBrowser)) {
          Restart-NodeOnly
        } else {
          Restart-BotStack
        }
        $nodeHealthFailures = 0
        $botReadyFailures = 0
        $botLivenessFailures = 0
        Start-Sleep -Seconds 8
        continue
      }
    } else {
      $botReadyFailures = 0
    }

    if (-not (Test-BotLiveness)) {
      $botLivenessFailures += 1
      Write-WatchdogLog "Liveness operativo fallido ($botLivenessFailures/2)"
      if ($botLivenessFailures -ge 2) {
        if ($useConnectedBrowser -and (Test-RemoteBrowser)) {
          Restart-NodeOnly
        } else {
          Restart-BotStack
        }
        $nodeHealthFailures = 0
        $botReadyFailures = 0
        $botLivenessFailures = 0
        Start-Sleep -Seconds 8
        continue
      }
    } else {
      $botLivenessFailures = 0
    }
    } catch {
      Write-WatchdogLog "Error en watchdog: $($_.Exception.Message)"
    }

    Start-Sleep -Seconds 5
  }
} finally {
  if ($watchdogMutex) {
    try {
      $watchdogMutex.ReleaseMutex() | Out-Null
    } catch {
    }
    $watchdogMutex.Dispose()
  }
}
