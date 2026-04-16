$ErrorActionPreference = "Stop"

$desktopPath = [Environment]::GetFolderPath("Desktop")
$launcherPath = Join-Path $PSScriptRoot "start_whatsapp_bot_silent.ps1"
$shortcutPath = Join-Path $desktopPath "Farmacia Delko Bot.lnk"

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$launcherPath`""
$shortcut.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$shortcut.WindowStyle = 7
$shortcut.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,220"
$shortcut.Description = "Inicia el bot de WhatsApp de Farmacia Delko en segundo plano."
$shortcut.Save()

Write-Output "Acceso directo creado: $shortcutPath"
