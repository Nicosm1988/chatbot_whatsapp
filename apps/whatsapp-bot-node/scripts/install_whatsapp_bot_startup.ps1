$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "run_whatsapp_bot_forever.ps1"
$taskName = "DelkoWhatsAppBotWatchdog"
$workingDirectory = Split-Path -Parent $PSScriptRoot
$startupFolder = [Environment]::GetFolderPath("Startup")
$startupShortcut = Join-Path $startupFolder "Farmacia Delko Bot Watchdog.lnk"

function Install-StartupShortcut {
  $wshShell = New-Object -ComObject WScript.Shell
  $shortcut = $wshShell.CreateShortcut($startupShortcut)
  $shortcut.TargetPath = "powershell.exe"
  $shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""
  $shortcut.WorkingDirectory = $workingDirectory
  $shortcut.WindowStyle = 7
  $shortcut.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,220"
  $shortcut.Description = "Inicia el watchdog del bot de WhatsApp de Farmacia Delko al iniciar sesion."
  $shortcut.Save()
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`"" `
  -WorkingDirectory $workingDirectory

$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable

try {
  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Force | Out-Null

  Write-Output "Tarea instalada: $taskName"
  Write-Output "Se ejecutara al iniciar sesion y dejara el bot monitoreado en segundo plano."
} catch {
  Install-StartupShortcut
  Write-Warning "No se pudo registrar la tarea programada. Se instalo un acceso directo en Inicio como alternativa."
  Write-Output "Acceso directo de inicio: $startupShortcut"
  Write-Output "Se ejecutara al iniciar sesion y dejara el bot monitoreado en segundo plano."
}
