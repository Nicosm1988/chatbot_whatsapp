$ErrorActionPreference = "Stop"

function Find-Browser {
  $candidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }

  throw "No se encontro Chrome o Edge instalado."
}

$browser = Find-Browser
$port = if ($env:WHATSAPP_WEB_REMOTE_DEBUGGING_PORT) { $env:WHATSAPP_WEB_REMOTE_DEBUGGING_PORT } else { "9222" }
$profileRoot = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "DelkoBot\chrome-remote-profile" } else { ".chrome-remote-profile" }
$extensionSource = (Resolve-Path (Join-Path $PSScriptRoot "..\..\whatsapp-web-companion-extension")).Path
$extensionRoot = if ($env:LOCALAPPDATA) {
  Join-Path $env:LOCALAPPDATA "DelkoBot\browser-assets\whatsapp-web-companion-extension"
} else {
  ".whatsapp-web-companion-extension"
}
$loadCompanionExtension = if ($env:WHATSAPP_WEB_LOAD_COMPANION_EXTENSION) {
  $env:WHATSAPP_WEB_LOAD_COMPANION_EXTENSION.ToLowerInvariant() -eq "true"
} else {
  $true
}
$debugUrl = "http://127.0.0.1:$port/json/version"
$targetsUrl = "http://127.0.0.1:$port/json/list"

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class TaligentWindowTools {
  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

function Test-RemoteBrowser {
  try {
    Invoke-RestMethod -Uri $debugUrl -TimeoutSec 3 | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Sync-ExtensionAssets {
  if (-not $loadCompanionExtension) {
    return
  }

  New-Item -ItemType Directory -Path (Split-Path -Parent $extensionRoot) -Force | Out-Null

  if (Test-Path $extensionRoot) {
    Remove-Item -LiteralPath $extensionRoot -Recurse -Force
  }

  Copy-Item -LiteralPath $extensionSource -Destination $extensionRoot -Recurse -Force
}

function Wait-RemoteBrowser {
  $deadline = (Get-Date).AddSeconds(25)

  while ((Get-Date) -lt $deadline) {
    if (Test-RemoteBrowser) {
      return $true
    }

    Start-Sleep -Milliseconds 500
  }

  return $false
}

function Get-RemoteTargets {
  try {
    return @(Invoke-RestMethod -Uri $targetsUrl -TimeoutSec 3)
  } catch {
    return @()
  }
}

function Invoke-ActivateRemoteTarget {
  param([string]$TargetId)

  if (-not $TargetId) {
    return
  }

  try {
    Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/json/activate/{1}" -f $port, $TargetId) -TimeoutSec 3 | Out-Null
  } catch {
    # si falla la activacion, seguimos con el foco de ventana
  }
}

function Get-RemoteBrowserWindowProcesses {
  $browserProcesses = Get-CimInstance Win32_Process |
    Where-Object {
      ($_.Name -eq "chrome.exe" -or $_.Name -eq "msedge.exe") -and
      (
        $_.CommandLine -like "*$profileRoot*" -or
        $_.CommandLine -like "*--remote-debugging-port=$port*"
      )
    }

  $result = @()
  foreach ($processInfo in $browserProcesses) {
    $process = Get-Process -Id $processInfo.ProcessId -ErrorAction SilentlyContinue
    if ($process -and $process.MainWindowHandle -ne 0) {
      $result += $process
    }
  }

  return @($result)
}

function Restore-RemoteBrowserWindows {
  $windows = Get-RemoteBrowserWindowProcesses
  foreach ($window in $windows) {
    [TaligentWindowTools]::ShowWindowAsync($window.MainWindowHandle, 9) | Out-Null
    [TaligentWindowTools]::SetForegroundWindow($window.MainWindowHandle) | Out-Null
  }
}

function Close-RemoteTarget {
  param([string]$TargetId)

  if (-not $TargetId) {
    return
  }

  try {
    Invoke-RestMethod -Uri ("http://127.0.0.1:{0}/json/close/{1}" -f $port, $TargetId) -TimeoutSec 3 | Out-Null
  } catch {
    # si el endpoint no responde, seguimos igual
  }
}

function Cleanup-RemoteTabs {
  $targets = Get-RemoteTargets
  if (-not $targets.Count) {
    return
  }

  $pages = @($targets | Where-Object { $_.type -eq "page" })
  $whatsAppPages = @($pages | Where-Object { $_.url -like "https://web.whatsapp.com/*" })
  $blankPages = @($pages | Where-Object { $_.url -eq "about:blank" })
  $garbagePages = @(
    $pages | Where-Object {
      $_.url -like "http://personales/*" -or
      $_.url -like "http://whatsapp/*" -or
      $_.url -like "chrome-error://*" -or
      $_.url -like "chrome://newtab/*"
    }
  )

  $garbagePages | ForEach-Object { Close-RemoteTarget $_.id }

  if ($whatsAppPages.Count -gt 1) {
    $whatsAppPages | Select-Object -Skip 1 | ForEach-Object { Close-RemoteTarget $_.id }
  }

  if ($whatsAppPages.Count -ge 1 -and $blankPages.Count -ge 1) {
    $blankPages | ForEach-Object { Close-RemoteTarget $_.id }
  } elseif ($blankPages.Count -gt 1) {
    $blankPages | Select-Object -Skip 1 | ForEach-Object { Close-RemoteTarget $_.id }
  }
}

function Focus-OperationalRemoteTab {
  $targets = Get-RemoteTargets
  if (-not $targets.Count) {
    Restore-RemoteBrowserWindows
    return
  }

  $pages = @($targets | Where-Object { $_.type -eq "page" })
  $whatsAppPage = @($pages | Where-Object { $_.url -like "https://web.whatsapp.com/*" }) | Select-Object -First 1
  $blankPage = @($pages | Where-Object { $_.url -eq "about:blank" }) | Select-Object -First 1
  $target = if ($whatsAppPage) { $whatsAppPage } else { $blankPage }

  if ($target) {
    Invoke-ActivateRemoteTarget -TargetId $target.id
  }

  Restore-RemoteBrowserWindows
}

if (Test-RemoteBrowser) {
  Write-Output "El navegador remoto ya estaba activo en $debugUrl"
  Cleanup-RemoteTabs
  Focus-OperationalRemoteTab
  exit 0
}

New-Item -ItemType Directory -Path $profileRoot -Force | Out-Null
Sync-ExtensionAssets

$arguments = New-Object System.Collections.Generic.List[string]
$arguments.Add("--remote-debugging-port=$port")
$arguments.Add("--remote-debugging-address=127.0.0.1")
$arguments.Add("--user-data-dir=`"$profileRoot`"")
$arguments.Add("--no-first-run")
$arguments.Add("--no-default-browser-check")
$arguments.Add("--disable-backgrounding-occluded-windows")
$arguments.Add("--disable-renderer-backgrounding")
$arguments.Add("--disable-background-timer-throttling")
$arguments.Add("--disable-features=CalculateNativeWinOcclusion")
$arguments.Add("--new-window")

if ($loadCompanionExtension) {
  $arguments.Add("--disable-extensions-except=`"$extensionRoot`"")
  $arguments.Add("--load-extension=`"$extensionRoot`"")
}

$arguments.Add("about:blank")
$argumentString = ($arguments -join " ")

Write-Output "Abriendo navegador remoto para WhatsApp Web..."
Write-Output "Browser: $browser"
Write-Output "Profile: $profileRoot"
Write-Output "Extension: $(if ($loadCompanionExtension) { $extensionRoot } else { "deshabilitada por defecto" })"
Write-Output "Debug URL: http://127.0.0.1:$port"

Start-Process -FilePath $browser -ArgumentList $argumentString | Out-Null

if (Wait-RemoteBrowser) {
  Cleanup-RemoteTabs
  Focus-OperationalRemoteTab
}
