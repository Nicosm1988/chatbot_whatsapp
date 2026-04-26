# Client Runbook - Farmacia Delko

Last update: 2026-04-15

## 1) URLs de uso diario

- Control center: `/`
- Editor de flujos: `/flows`
- Conversaciones: `/conversations`
- Estado de WhatsApp Web: `/whatsapp-qr`
- Readiness: `/api/system/ready`
- Liveness operativo: `/api/system/liveness`
- Storage: `/api/system/storage`

Nota:
- `/flows/client` existe pero hoy redirige a `/flows`.

## 2) Flujo operativo recomendado

1. Abrir `/`.
2. Si hay cambios en el flujo, entrar a `/flows`.
3. Editar y guardar.
4. Validar con un chat de prueba.
5. Revisar `/conversations`.
6. Verificar `/api/system/ready` y `/api/system/liveness`.

## 3) Variables minimas para el modo web actual

- `WHATSAPP_TRANSPORT=web`
- `WHATSAPP_WEB_AUTH_MODE=connected_browser`
- `WHATSAPP_WEB_BROWSER_URL=http://127.0.0.1:9222`
- `BUSINESS_DISPLAY_NAME=Farmacia Delko`
- `DATABASE_URL`
- `AUDIT_STORAGE_PROVIDER=postgres`
- `AUDIT_ALLOW_MEMORY_FALLBACK=false`
- `PHARMACY_SYSTEM_API_BASE_URL`
- `PHARMACY_SYSTEM_API_USERNAME`
- `PHARMACY_SYSTEM_API_PASSWORD`

Variables opcionales utiles:

- `WHATSAPP_WEB_SESSION_NAME`
- `WHATSAPP_WEB_AUTH_DATA_PATH`
- `WHATSAPP_WEB_EXECUTABLE_PATH`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `CRON_SECRET`

Nota operativa:
- si la farmacia consulta por una PC nueva y el lookup deja de responder, antes de tocar el bot revisar si falta la VPN de la farmacia
- la evidencia actual apunta a que podria estar usando `Radmin VPN`
- chequeo rapido: `npm run lab:check-pharmacy`

## 4) Inicio recomendado en modo web

Desde `apps/whatsapp-bot-node`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start_whatsapp_remote_browser.ps1
npm run dev
```

Despues:

1. Abrir `http://localhost:3000/whatsapp-qr`
2. Confirmar que la sesion quede autenticada
3. Verificar `http://localhost:3000/api/system/ready`

## 5) Inicio simple para operadores no tecnicos

Desde `apps/whatsapp-bot-node`:

```powershell
npm run lab:start-silent
npm run lab:install-shortcut
npm run lab:install-startup
```

Comportamiento:

- si la tarea programada no puede instalarse, se crea un acceso directo en la carpeta `Inicio`
- el watchdog deja el bot corriendo en segundo plano

## 6) Variables solo para modo cloud

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_ENFORCE_SIGNATURE=true`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WEBHOOK_BASE_URL`

## 7) Checks antes de entregar o reiniciar operacion

1. `/health` responde `200`.
2. `/api/system/ready` responde `ok: true`.
3. `/api/system/liveness` responde `ok: true` cuando la sesion ya esta lista.
4. En modo `web`, confirmar `transport=web`, `authenticated=true` y `sessionReady=true`.
5. En modo `cloud`, confirmar endurecimiento de firma webhook.
6. Confirmar que no se vea JSON ni IDs internos en pantallas cliente.
7. Confirmar que el editor guarda y el bot refleja el cambio.

## 8) Acciones rapidas ante incidentes

- Si `web` no responde:
  - correr `npm run lab:restart`
  - revisar `http://localhost:3000/whatsapp-qr`
- Si el navegador remoto se cerro:
  - volver a correr `scripts/start_whatsapp_remote_browser.ps1`
- Si el watchdog debe quedar activo:
  - correr `npm run lab:watch`
- Si necesitas una validacion guiada:
  - correr `npm run lab:validate`
- Si falla la conexion con farmacia:
  - conectar la VPN de la farmacia si aplica
  - correr `npm run lab:check-pharmacy`
- Si el storage no persiste:
  - revisar `DATABASE_URL`
  - revisar `/api/system/storage`
- Si falla el cron:
  - revisar `CRON_SECRET`
- Si falla Cloud API:
  - revisar `WHATSAPP_APP_SECRET`
  - revisar `WHATSAPP_ACCESS_TOKEN`
  - revisar `WHATSAPP_PHONE_NUMBER_ID`
