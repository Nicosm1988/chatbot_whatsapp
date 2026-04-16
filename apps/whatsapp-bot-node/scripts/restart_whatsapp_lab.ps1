$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $appRoot ".run-connected.out.log"
$errLogPath = Join-Path $appRoot ".run-connected.err.log"
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
$envFilePath = Join-Path $appRoot ".env.local"

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

function Stop-AppNodeProcesses {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq "node.exe" -and
      $_.CommandLine -like "*src/index.js*"
    } |
    ForEach-Object {
      Write-Output "Deteniendo node previo PID=$($_.ProcessId)"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Stop-RemoteBrowserProcesses {
  Get-CimInstance Win32_Process |
    Where-Object {
      ($_.Name -eq "chrome.exe" -or $_.Name -eq "msedge.exe") -and
      (
        $_.CommandLine -like "*$profileRoot*" -or
        $_.CommandLine -like "*--remote-debugging-port=$debugPort*"
      )
    } |
    ForEach-Object {
      Write-Output "Deteniendo browser remoto previo PID=$($_.ProcessId)"
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

function Wait-RemoteBrowser {
  $deadline = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $deadline) {
    try {
      Invoke-RestMethod -Uri $debugUrl -TimeoutSec 3 | Out-Null
      return $true
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  return $false
}

Write-Output "Reiniciando laboratorio local de WhatsApp..."

Stop-AppNodeProcesses

if ($useConnectedBrowser) {
  Stop-RemoteBrowserProcesses
}

if (Test-Path $logPath) {
  try {
    Remove-Item $logPath -Force
  } catch {
    Start-Sleep -Milliseconds 500
    try {
      Remove-Item $logPath -Force
    } catch {
      Set-Content -Path $logPath -Value ""
    }
  }
}

if (Test-Path $errLogPath) {
  try {
    Remove-Item $errLogPath -Force
  } catch {
    Set-Content -Path $errLogPath -Value ""
  }
}

if ($useConnectedBrowser) {
  Write-Output "Levantando navegador remoto..."
  & (Join-Path $PSScriptRoot "start_whatsapp_remote_browser.ps1")
  Start-Sleep -Seconds 2

  if (-not (Wait-RemoteBrowser)) {
    throw "No se pudo levantar el navegador remoto en $debugUrl"
  }
} else {
  Write-Output "Modo LocalAuth persistente detectado. El navegador lo levanta whatsapp-web.js."
}

Write-Output "Levantando bot local..."
$stdoutHandle = [System.IO.File]::Open($logPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::ReadWrite)
$stdoutHandle.Close()

Start-Process -FilePath "node.exe" `
  -WorkingDirectory $appRoot `
  -ArgumentList "src/index.js" `
  -RedirectStandardOutput $logPath `
  -RedirectStandardError $errLogPath | Out-Null

Write-Output "Listo."
Write-Output "QR/estado: http://localhost:3000/whatsapp-qr"
Write-Output "Health: http://localhost:3000/health"
Write-Output "Readiness: http://localhost:3000/api/system/ready"
Write-Output "Log: $logPath"
Write-Output "Error log: $errLogPath"
