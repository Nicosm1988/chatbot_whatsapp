# Instalacion En Otra Maquina

Esta guia deja el proyecto listo para bajar, instalar y levantar en otra PC Windows.

## 1. Links de descarga

### Proyecto

- Repositorio web: `https://github.com/Nicosm1988/chatbot_whatsapp`
- Clonar por Git: `https://github.com/Nicosm1988/chatbot_whatsapp.git`
- Descargar ZIP: `https://github.com/Nicosm1988/chatbot_whatsapp/archive/refs/heads/main.zip`
- Carpeta principal del app: `https://github.com/Nicosm1988/chatbot_whatsapp/tree/main/apps/whatsapp-bot-node`

### Software base

- Node.js: `https://nodejs.org/en/download`
- Git for Windows: `https://git-scm.com/install/windows`
- Microsoft Edge: `https://www.microsoft.com/edge`
- Google Chrome: `https://www.google.com/chrome/`
- WhatsApp Web: `https://web.whatsapp.com`

### Servicios externos

- Vercel CLI y docs: `https://vercel.com/docs/cli`
- Neon docs: `https://neon.com/docs`
- Upstash REST API docs: `https://upstash.com/docs/redis/features/restapi`

## 2. Requisitos recomendados

- Windows 10 u 11
- PowerShell habilitado
- Node.js 22
- Git
- Chrome o Edge
- Acceso a las credenciales de:
  - Postgres o Neon
  - Plex Center / sistema de farmacia
  - Meta Cloud API si vas a usar modo `cloud`
  - Vercel si vas a desplegar

## 3. Opcion A: clonar con Git

```powershell
git clone https://github.com/Nicosm1988/chatbot_whatsapp.git
cd chatbot_whatsapp\apps\whatsapp-bot-node
npm ci
```

## 4. Opcion B: descargar ZIP

1. Baja `https://github.com/Nicosm1988/chatbot_whatsapp/archive/refs/heads/main.zip`
2. Descomprime el ZIP
3. Entra en `chatbot_whatsapp-main\apps\whatsapp-bot-node`
4. Ejecuta:

```powershell
npm ci
```

Usa ZIP solo si no necesitas historial Git. Si despues quieres actualizar facil desde GitHub, conviene clonar.

## 5. Crear el archivo de entorno

Desde `apps/whatsapp-bot-node`:

```powershell
Copy-Item .env.example .env.local
```

## 6. Variables minimas segun el modo

### Modo web local recomendado

Estas son las minimas para el laboratorio y la operacion con navegador conectado:

```dotenv
PORT=3000
BUSINESS_DISPLAY_NAME=Farmacia Delko
WHATSAPP_TRANSPORT=web
WHATSAPP_MOCK_MODE=false
WHATSAPP_WEB_AUTH_MODE=connected_browser
WHATSAPP_WEB_BROWSER_URL=http://127.0.0.1:9222
WHATSAPP_WEB_INACTIVITY_CHECK_INTERVAL_MS=300000
AUDIT_STORAGE_PROVIDER=postgres
AUDIT_ALLOW_MEMORY_FALLBACK=false
DATABASE_URL=
PHARMACY_SYSTEM_API_BASE_URL=
PHARMACY_SYSTEM_API_USERNAME=
PHARMACY_SYSTEM_API_PASSWORD=
PHARMACY_SYSTEM_API_BRANCH_IDS=1
```

Usa `WHATSAPP_MOCK_MODE=true` únicamente para una prueba sin enviar mensajes reales.

Este modo usa una automatización no oficial de WhatsApp Web. Requiere una PC Windows encendida y con sesión iniciada, no tiene soporte de Meta y puede implicar restricción o pérdida de la cuenta asociada al número. Antes de vincular el número principal, la dueña debe conocer ese riesgo; para la primera validación conviene usar un número secundario no crítico.

### Modo cloud

Si vas a usar Meta Cloud API:

```dotenv
WHATSAPP_TRANSPORT=cloud
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_ENFORCE_SIGNATURE=true
WHATSAPP_BUSINESS_ACCOUNT_ID=
WEBHOOK_BASE_URL=
```

### Variables operativas adicionales

- `CRON_SECRET`: sólo para invocar manualmente `GET /api/cron/inactivity`; el modo Web ejecuta el control de inactividad dentro de la PC local.
- `KV_REST_API_URL` y `KV_REST_API_TOKEN`: solo si usas Upstash KV.
- `OPENAI_API_KEY`: opcional.
- `WHATSAPP_WEB_AUTH_DATA_PATH`: opcional. Si no lo defines, el runtime usa `%LOCALAPPDATA%\DelkoBot\wwebjs-auth`.
- `WHATSAPP_WEB_EXECUTABLE_PATH`: opcional si quieres forzar un browser especifico.

## 7. Arranque recomendado en otra PC

Desde `apps/whatsapp-bot-node`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start_whatsapp_remote_browser.ps1
npm run dev
```

Luego abre:

- `http://localhost:3000/whatsapp-qr`
- `http://localhost:3000/health`
- `http://localhost:3000/api/system/ready`
- `http://localhost:3000/api/system/liveness`

## 8. Arranque para operadores no tecnicos

Desde `apps/whatsapp-bot-node`:

```powershell
npm run lab:start-silent
npm run lab:install-shortcut
npm run lab:install-startup
```

Scripts disponibles:

- `npm run lab:restart`
- `npm run lab:watch`
- `npm run lab:validate`

## 9. Validaciones minimas despues de instalar

```powershell
npm test
```

Checks rapidos:

- `/health` debe devolver `ok: true`
- `/api/system/ready` debe mostrar WhatsApp autenticado o al menos esperando el QR correcto
- `/api/system/liveness` debe quedar en `ok: true` cuando la sesion este lista
- `/api/system/storage` debe mostrar storage persistente si `DATABASE_URL` esta bien

## 10. Donde quedan los datos locales del navegador

Por defecto Windows usa:

- Auth de `whatsapp-web.js`: `%LOCALAPPDATA%\DelkoBot\wwebjs-auth`
- Perfil del browser remoto: `%LOCALAPPDATA%\DelkoBot\chrome-remote-profile`
- Assets locales de la extension: `%LOCALAPPDATA%\DelkoBot\browser-assets\whatsapp-web-companion-extension`

## 11. Si también quieres desplegar el modo Cloud

Desde `apps/whatsapp-bot-node`:

```powershell
npm run deploy:prod
```

Necesitas:

- `VERCEL_TOKEN`
- `VERCEL_SCOPE`
- `META_API_VERSION`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WEBHOOK_BASE_URL`

Este despliegue no reemplaza el proceso local de WhatsApp Web. No ejecutes la sincronización de webhook para activar el modo Web.

Consulta tambien:

- [Runbook operativo](CLIENT_RUNBOOK.md)
- [Guia GitHub y mapa del repositorio](GUIA_GITHUB_Y_REPOSITORIO.md)
- [Migracion a Neon/Postgres](NEON_MIGRATION.md)
