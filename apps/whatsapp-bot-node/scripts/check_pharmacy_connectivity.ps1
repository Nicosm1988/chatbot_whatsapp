$ErrorActionPreference = "Stop"

$appRoot = Split-Path -Parent $PSScriptRoot
$envFilePath = Join-Path $appRoot ".env.local"
$exampleEnvFilePath = Join-Path $appRoot ".env.example"

function Get-EnvFileValue {
  param(
    [string]$Path,
    [string]$Name
  )

  if (-not (Test-Path $Path)) {
    return ""
  }

  $prefix = "$Name="
  foreach ($line in Get-Content $Path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    if ($trimmed.StartsWith($prefix)) {
      return $trimmed.Substring($prefix.Length).Trim()
    }
  }

  return ""
}

function Get-ConfigValue {
  param([string]$Name)

  $value = Get-EnvFileValue -Path $envFilePath -Name $Name
  if ($value) {
    return $value
  }

  return Get-EnvFileValue -Path $exampleEnvFilePath -Name $Name
}

function Write-Section {
  param([string]$Title)
  Write-Output ""
  Write-Output $Title
}

$baseUrl = Get-ConfigValue -Name "PHARMACY_SYSTEM_API_BASE_URL"
$username = Get-ConfigValue -Name "PHARMACY_SYSTEM_API_USERNAME"
$password = Get-ConfigValue -Name "PHARMACY_SYSTEM_API_PASSWORD"

if (-not $baseUrl) {
  throw "Falta PHARMACY_SYSTEM_API_BASE_URL. Completa .env.local o .env.example antes de validar conectividad."
}

try {
  $uri = [System.Uri]$baseUrl
} catch {
  throw "PHARMACY_SYSTEM_API_BASE_URL no es una URL valida: $baseUrl"
}

$port = if ($uri.IsDefaultPort) {
  if ($uri.Scheme -eq "https") { 443 } else { 80 }
} else {
  $uri.Port
}

Write-Output "Chequeando conectividad con el sistema de farmacia..."
Write-Output "Base URL: $baseUrl"
Write-Output "Host: $($uri.Host)"
Write-Output "Puerto: $port"
Write-Output "Archivo de entorno detectado: $(if (Test-Path $envFilePath) { $envFilePath } else { "solo .env.example" })"

Write-Section "1) DNS"
try {
  $addresses = [System.Net.Dns]::GetHostAddresses($uri.Host)
  if (-not $addresses -or $addresses.Count -eq 0) {
    throw "Sin IPs resueltas."
  }

  Write-Output ("OK DNS -> " + (($addresses | ForEach-Object { $_.IPAddressToString }) -join ", "))
} catch {
  Write-Output "Fallo resolviendo el host."
  Write-Output "Si esta PC es nueva, probablemente falte conectarse a la VPN de la farmacia."
  throw
}

Write-Section "2) TCP"
try {
  $tcp = Test-NetConnection -ComputerName $uri.Host -Port $port -WarningAction SilentlyContinue
  if (-not $tcp.TcpTestSucceeded) {
    Write-Output "No se pudo abrir conexion TCP al servidor."
    Write-Output "Esto suele indicar VPN desconectada, firewall o servidor caido."
    throw "tcp_connection_failed"
  }

  Write-Output "OK TCP -> conexion abierta"
} catch {
  throw
}

$healthUrl = "$($baseUrl.TrimEnd('/'))/wsplexcenter/sucursales"

Write-Section "3) HTTP"
if (-not $username -or -not $password) {
  Write-Output "No hay usuario/password cargados en .env.local."
  Write-Output "La red parece alcanzable, pero falta validar login HTTP con credenciales reales."
  exit 0
}

try {
  $basic = [Convert]::ToBase64String([System.Text.Encoding]::ASCII.GetBytes("${username}:${password}"))
  $headers = @{ Authorization = "Basic $basic" }
  $response = Invoke-WebRequest -Uri $healthUrl -Headers $headers -TimeoutSec 12 -UseBasicParsing

  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
    throw "unexpected_status_$($response.StatusCode)"
  }

  Write-Output "OK HTTP -> autenticacion y endpoint accesibles"
  Write-Output "La PC deberia poder consultar el sistema de farmacia desde el bot."
} catch {
  Write-Output "La red llega al servidor, pero la llamada autenticada fallo."
  Write-Output "Revisar usuario/password o confirmar que la VPN correcta este conectada."
  throw
}
