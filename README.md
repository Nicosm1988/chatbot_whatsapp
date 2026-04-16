# WhatsApp Bot Farmacia Delko

Repositorio principal del chatbot de WhatsApp para Farmacia Delko.

## Links rapidos de GitHub

- Repositorio: `https://github.com/Nicosm1988/chatbot_whatsapp`
- Clonar por Git: `https://github.com/Nicosm1988/chatbot_whatsapp.git`
- Descargar ZIP de `main`: `https://github.com/Nicosm1988/chatbot_whatsapp/archive/refs/heads/main.zip`
- Commits: `https://github.com/Nicosm1988/chatbot_whatsapp/commits/main`
- Actions: `https://github.com/Nicosm1988/chatbot_whatsapp/actions`
- Codigo app principal: `https://github.com/Nicosm1988/chatbot_whatsapp/tree/main/apps/whatsapp-bot-node`
- Extension companion: `https://github.com/Nicosm1988/chatbot_whatsapp/tree/main/apps/whatsapp-web-companion-extension`
- Produccion actual: `https://whatsapp-bot-node-chatbot1.vercel.app`

## Documentacion principal

- [Instalacion en otra maquina](docs/INSTALACION_EN_OTRA_MAQUINA.md)
- [Guia GitHub y mapa del repositorio](docs/GUIA_GITHUB_Y_REPOSITORIO.md)
- [Runbook operativo](docs/CLIENT_RUNBOOK.md)
- [Guia del editor de flujos](docs/FLOW_EDITOR_GUIDE.md)
- [Companion de WhatsApp Web](docs/WHATSAPP_WEB_COMPANION.md)
- [Migracion de storage a Neon/Postgres](docs/NEON_MIGRATION.md)
- [Productos y descuentos](docs/PRODUCTOS_Y_DESCUENTOS.md)
- [Memoria del proyecto](docs/PROJECT_MEMORY.md)
- [Historial de sesion](persistence/session_history.md)
- [Snapshot de contexto](persistence/context_snapshot.json)

## Que contiene este repo

- `apps/whatsapp-bot-node/`: backend Express, runtime del bot, dashboards, APIs, tests y scripts operativos.
- `apps/whatsapp-web-companion-extension/`: extension Chromium/Edge para ver filtros y etiquetas operativas dentro de WhatsApp Web.
- `docs/`: documentacion funcional, tecnica y operativa.
- `persistence/`: continuidad interna de trabajo y estado del proyecto.
- `.github/workflows/`: automatizaciones de GitHub Actions para deploy y cron operativo.
- Archivos raiz de referencia:
  - `API_OnzeCenter_Documentacion_Actualizada.pdf`: referencia preferida para la API de farmacia.
  - `API_OnzeCenter_Documentacion.pdf`: referencia historica anterior.
  - `WS Plex Center.postman_collection.json`: coleccion Postman.
  - `Productos y Descuentos.docx`: documento fuente del cliente.

## Arquitectura rapida

- App principal: Node.js + Express.
- Runtime activo de laboratorio: `WHATSAPP_TRANSPORT=web`.
- Modo alternativo soportado: `cloud` para WhatsApp Cloud API.
- Hosting: Vercel.
- Persistencia recomendada: Neon/Postgres.
- Persistencia legacy soportada: Upstash KV por REST.
- Integracion de stock/precio: Plex Center / sistema de farmacia.
- Companion visual: extension de navegador para WhatsApp Web.

## Inicio rapido

### Clonar el repo

```bash
git clone https://github.com/Nicosm1988/chatbot_whatsapp.git
cd chatbot_whatsapp/apps/whatsapp-bot-node
npm ci
```

### O bajar el ZIP

1. Descarga `https://github.com/Nicosm1988/chatbot_whatsapp/archive/refs/heads/main.zip`
2. Descomprime la carpeta
3. Entra en `chatbot_whatsapp-main/apps/whatsapp-bot-node`
4. Ejecuta `npm ci`

### Preparar variables

```powershell
Copy-Item .env.example .env.local
```

Completa al menos lo necesario para tu modo de trabajo.

- Web local recomendado:
  - `WHATSAPP_TRANSPORT=web`
  - `WHATSAPP_WEB_AUTH_MODE=connected_browser`
  - `WHATSAPP_WEB_BROWSER_URL=http://127.0.0.1:9222`
  - `DATABASE_URL`
  - `AUDIT_STORAGE_PROVIDER=postgres`
  - `PHARMACY_SYSTEM_API_BASE_URL`
  - `PHARMACY_SYSTEM_API_USERNAME`
  - `PHARMACY_SYSTEM_API_PASSWORD`
- Cloud:
  - `WHATSAPP_ACCESS_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`
  - `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
  - `WHATSAPP_APP_SECRET`

### Arranque local recomendado

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start_whatsapp_remote_browser.ps1
npm run dev
```

Luego abre:

- `http://localhost:3000/whatsapp-qr`
- `http://localhost:3000/health`
- `http://localhost:3000/api/system/ready`
- `http://localhost:3000/api/system/liveness`

## Scripts mas usados

- `npm test`
- `npm run dev`
- `npm run deploy:prod`
- `npm run refresh:plex-drugs`
- `npm run lab:restart`
- `npm run lab:watch`
- `npm run lab:start-silent`
- `npm run lab:install-startup`
- `npm run lab:install-shortcut`
- `npm run lab:validate`

## Rutas principales

- `/`: tablero principal
- `/flows`: editor de flujos
- `/flows/client`: actualmente redirige a `/flows`
- `/conversations`: conversaciones
- `/api/system/ready`: readiness del sistema
- `/api/system/liveness`: liveness operativo
- `/api/system/storage`: estado del storage de auditoria
- `/api/companion/conversations`: feed saneado para la extension
- `/whatsapp-qr`: estado o QR del modo web

## Requisitos recomendados

- Windows 10/11
- Node.js 22
- Git
- Chrome o Edge
- Cuenta Vercel si vas a desplegar
- Base Postgres/Neon para auditoria persistente

La guia completa de reinstalacion y enlaces oficiales esta en [docs/INSTALACION_EN_OTRA_MAQUINA.md](docs/INSTALACION_EN_OTRA_MAQUINA.md).
