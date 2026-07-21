$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $PSScriptRoot
$healthUrl = "http://localhost:3000/health"
$readyUrl = "http://localhost:3000/api/system/ready"
$targetsUrl = "http://127.0.0.1:9222/json/list"
$restartScript = Join-Path $PSScriptRoot "restart_whatsapp_lab.ps1"
$resetUrl = "http://localhost:3000/api/dev/whatsapp/reset-contact-state"
$simulateInboundUrl = "http://localhost:3000/api/dev/whatsapp/simulate-runtime-inbound"
$simulateAdvisorClosureUrl = "http://localhost:3000/api/dev/whatsapp/simulate-advisor-closure"
$labelsStatusUrl = "http://localhost:3000/api/dev/whatsapp/native-labels/status"
if (-not $env:WHATSAPP_VALIDATE_CONTACT_ID) {
  throw "Defini WHATSAPP_VALIDATE_CONTACT_ID con un numero de prueba autorizado. No hay un destinatario predeterminado."
}

if ($env:WHATSAPP_VALIDATE_ALLOW_REAL_SEND -ne "CONFIRMO") {
  throw "Esta validacion envia mensajes reales. Defini WHATSAPP_VALIDATE_ALLOW_REAL_SEND=CONFIRMO para continuar."
}

$contactId = $env:WHATSAPP_VALIDATE_CONTACT_ID
$contactName = if ($env:WHATSAPP_VALIDATE_CONTACT_NAME) { $env:WHATSAPP_VALIDATE_CONTACT_NAME } else { "Prueba autorizada" }
$iterations = 5

function Invoke-JsonPost {
  param(
    [string]$Uri,
    [hashtable]$Body
  )

  return Invoke-RestMethod -Method Post -Uri $Uri -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 10)
}

function Get-ReadySnapshot {
  try {
    return Invoke-RestMethod -Uri $readyUrl -TimeoutSec 5
  } catch {
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      return $_.ErrorDetails.Message | ConvertFrom-Json
    }
    throw
  }
}

function Get-RemoteTargets {
  try {
    return @(Invoke-RestMethod -Uri $targetsUrl -TimeoutSec 5)
  } catch {
    return @()
  }
}

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw $Message
  }
}

function Assert-CleanRemoteBrowser {
  $targets = Get-RemoteTargets
  Assert-True ($targets.Count -gt 0) "El navegador remoto no expone targets en 127.0.0.1:9222."

  $pages = @($targets | Where-Object { $_.type -eq "page" })
  $whatsAppPages = @($pages | Where-Object { $_.url -like "https://web.whatsapp.com/*" })
  $garbagePages = @(
    $pages | Where-Object {
      $_.url -like "http://personales/*" -or
      $_.url -like "http://whatsapp/*" -or
      $_.url -like "chrome-error://*" -or
      $_.url -like "file://*" -or
      $_.url -like "edge-error://*"
    }
  )

  Assert-True ($whatsAppPages.Count -eq 1) "El navegador remoto no tiene exactamente una sola pestaña de WhatsApp."
  Assert-True ($garbagePages.Count -eq 0) ("Hay pestañas basura en el navegador remoto: " + (($garbagePages | ForEach-Object { $_.url }) -join ", "))
}

function Get-ContactState {
  param([string]$Id)
  $uri = "http://localhost:3000/api/dev/whatsapp/contact-state?contactId=$([System.Uri]::EscapeDataString($Id))"
  return Invoke-RestMethod -Uri $uri -TimeoutSec 5
}

function Wait-ContactState {
  param(
    [scriptblock]$Predicate,
    [string]$FailureMessage,
    [int]$TimeoutSeconds = 15
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $snapshot = Get-ContactState -Id $contactId
    if (& $Predicate $snapshot) {
      return $snapshot
    }
    Start-Sleep -Milliseconds 500
  }

  throw $FailureMessage
}

Write-Output "Validando laboratorio de WhatsApp Web..."
Write-Output "Contacto de prueba: $contactName <$contactId>"

for ($startupIteration = 1; $startupIteration -le $iterations; $startupIteration += 1) {
  Write-Output ""
  Write-Output "Bootstrap $startupIteration/$iterations"

  & $restartScript | Out-Null
  Start-Sleep -Seconds 8

  $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5
  Assert-True ([bool]$health.ok) "El backend local no responde en /health."
  Assert-CleanRemoteBrowser

  $ready = Get-ReadySnapshot
  Assert-True ([bool]$ready.services.auditStorage.ready) "Audit storage no esta listo."
  Assert-True ([bool]$ready.services.pharmacyLookup.ready) "Pharmacy lookup no esta listo."

  $whatsApp = $ready.services.whatsapp
  $statusLabel = if ([bool]$whatsApp.authenticated) { "autenticado" } elseif ([bool]$whatsApp.awaitingScan) { "esperando QR" } else { "inicializando" }
  Write-Output ("  OK bootstrap | whatsapp={0}" -f $statusLabel)
}

$ready = Get-ReadySnapshot
$whatsapp = $ready.services.whatsapp

if (-not [bool]$whatsapp.authenticated) {
  if ([bool]$whatsapp.awaitingScan) {
    Write-Output ""
    Write-Output "Bootstrap validado en 5 iteraciones."
    Write-Output "WhatsApp quedo estable y esperando un unico escaneo de QR para la validacion conversacional."
    exit 0
  }

  throw "WhatsApp no esta autenticado. Revisar http://localhost:3000/whatsapp-qr."
}

$labels = Invoke-RestMethod -Uri $labelsStatusUrl -TimeoutSec 5
$managedLabels = @($labels.labels | ForEach-Object { $_.name })
$requiredLabels = @(
  "Delivery",
  "Mostrador",
  "Particular",
  "Programa de sobrepeso y diabetes",
  "Obra social",
  "Aguardando ser atendido",
  "Atendido"
)

foreach ($requiredLabel in $requiredLabels) {
  Assert-True ($managedLabels -contains $requiredLabel) "Falta la etiqueta nativa requerida: $requiredLabel"
}

for ($iteration = 1; $iteration -le $iterations; $iteration += 1) {
  Write-Output ""
  Write-Output "Iteracion $iteration/$iterations"

  Invoke-JsonPost -Uri $resetUrl -Body @{ contactId = $contactId } | Out-Null

  $timestampMenu = [int][double]::Parse((Get-Date -UFormat %s))
  Invoke-JsonPost -Uri $simulateInboundUrl -Body @{
    contactId = $contactId
    contactName = $contactName
    text = "MENU"
    messageId = "lab-$iteration-menu"
    timestamp = $timestampMenu
  } | Out-Null

  $afterMenu = Wait-ContactState -Predicate {
    param($snapshot)
    $state = $snapshot.currentState
    return $state -and $state.state -eq "order" -and $state.step -eq "menu"
  } -FailureMessage "No se pudo retomar el menu principal en la iteracion $iteration."

  Invoke-JsonPost -Uri $simulateInboundUrl -Body @{
    contactId = $contactId
    contactName = $contactName
    text = "A"
    messageId = "lab-$iteration-delivery"
    timestamp = $timestampMenu + 1
  } | Out-Null

  $afterDelivery = Wait-ContactState -Predicate {
    param($snapshot)
    $state = $snapshot.currentState
    return $state -and $state.state -eq "order" -and $state.step -eq "service_type" -and $state.state -ne "agent"
  } -FailureMessage "No se pudo avanzar a Delivery en la iteracion $iteration."

  Invoke-JsonPost -Uri $simulateInboundUrl -Body @{
    contactId = $contactId
    contactName = $contactName
    text = "A"
    messageId = "lab-$iteration-particular"
    timestamp = $timestampMenu + 2
  } | Out-Null

  $afterParticular = Wait-ContactState -Predicate {
    param($snapshot)
    $state = $snapshot.currentState
    return $state -and $state.state -eq "order" -and $state.step -eq "particular_search_mode"
  } -FailureMessage "No se pudo avanzar a Particular en la iteracion $iteration."

  Assert-True (
    [string]$afterParticular.currentState.state -eq "order" -and
      [string]$afterParticular.currentState.step -eq "particular_search_mode"
  ) "El contacto no quedo en particular_search_mode en la iteracion $iteration."

  $advisorResult = Invoke-JsonPost -Uri $simulateAdvisorClosureUrl -Body @{
    contactId = $contactId
    text = "Damos por cerrada la operacion."
    messageId = "lab-$iteration-closure"
  }
  Assert-True ([bool]$advisorResult.handled) "El cierre automatico del asesor no se ejecuto en la iteracion $iteration."

  $afterClosure = Wait-ContactState -Predicate {
    param($snapshot)
    $state = $snapshot.currentState
    return $state -and [string]$state.state -eq "idle" -and -not $state.step
  } -FailureMessage "El contacto no volvio a estado idle tras cierre de asesor en la iteracion $iteration."

  Write-Output ("  OK menu -> delivery -> particular -> cierre | labels={0}" -f (($afterClosure.nativeLabels | ForEach-Object { $_ }) -join ", "))
}

Write-Output ""
Write-Output "Validacion completa: $iterations iteraciones OK."
