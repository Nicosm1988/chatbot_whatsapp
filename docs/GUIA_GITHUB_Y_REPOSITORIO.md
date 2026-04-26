# Guia GitHub Y Mapa Del Repositorio

Esta guia sirve para ubicar rapido cada parte del proyecto desde GitHub.

## Links canonicos

- Repo: `https://github.com/Nicosm1988/chatbot_whatsapp`
- Clone URL: `https://github.com/Nicosm1988/chatbot_whatsapp.git`
- ZIP de `main`: `https://github.com/Nicosm1988/chatbot_whatsapp/archive/refs/heads/main.zip`
- Commits de `main`: `https://github.com/Nicosm1988/chatbot_whatsapp/commits/main`
- Actions: `https://github.com/Nicosm1988/chatbot_whatsapp/actions`
- Carpeta `docs/`: `https://github.com/Nicosm1988/chatbot_whatsapp/tree/main/docs`
- Carpeta `apps/whatsapp-bot-node/`: `https://github.com/Nicosm1988/chatbot_whatsapp/tree/main/apps/whatsapp-bot-node`
- Carpeta `apps/whatsapp-web-companion-extension/`: `https://github.com/Nicosm1988/chatbot_whatsapp/tree/main/apps/whatsapp-web-companion-extension`

## Estructura principal

### Automatizacion GitHub

- `.github/workflows/whatsapp-bot-auto-deploy.yml`
  - instala Node 22
  - ejecuta `npm ci`
  - corre `npm test`
  - despliega a Vercel
- `.github/workflows/whatsapp-bot-inactivity-check.yml`
  - pega a `/api/cron/inactivity` cada 5 minutos

### App principal

- `apps/whatsapp-bot-node/package.json`
  - scripts npm y dependencias
- `apps/whatsapp-bot-node/.env.example`
  - plantilla de variables de entorno
- `apps/whatsapp-bot-node/vercel.json`
  - configuracion de runtime Vercel
- `apps/whatsapp-bot-node/src/`
  - backend, dashboards, rutas, runtime WhatsApp, auditoria y tests
- `apps/whatsapp-bot-node/scripts/`
  - arranque local, restart, watchdog, validacion y deploy

### Extension de WhatsApp Web

- `apps/whatsapp-web-companion-extension/README.md`
- `apps/whatsapp-web-companion-extension/manifest.json`
- `apps/whatsapp-web-companion-extension/content.js`
- `apps/whatsapp-web-companion-extension/background.js`

### Documentacion

- `README.md`
- `docs/INSTALACION_EN_OTRA_MAQUINA.md`
- `docs/CLIENT_RUNBOOK.md`
- `docs/FLOW_EDITOR_GUIDE.md`
- `docs/WHATSAPP_WEB_COMPANION.md`
- `docs/NEON_MIGRATION.md`
- `docs/PRODUCTOS_Y_DESCUENTOS.md`
- `docs/PROJECT_MEMORY.md`

### Continuidad interna

- `persistence/context_snapshot.json`
- `persistence/session_history.md`

## Archivos de referencia del negocio

### Fuente operativa preferida

- `API_OnzeCenter_Documentacion_Actualizada.pdf`
  - usar esta primero para la API de farmacia

### Referencias historicas o complementarias

- `API_OnzeCenter_Documentacion.pdf`
  - version anterior
- `WS Plex Center.postman_collection.json`
  - coleccion Postman
- `Productos y Descuentos.docx`
  - documento fuente del cliente
- `docs/PRODUCTOS_Y_DESCUENTOS.md`
  - version resumida y operativa para el bot

## Que abrir segun lo que necesites

- Instalar en otra PC:
  - [Instalacion en otra maquina](INSTALACION_EN_OTRA_MAQUINA.md)
- Operar el bot dia a dia:
  - [Runbook operativo](CLIENT_RUNBOOK.md)
- Entender rutas y tableros:
  - `apps/whatsapp-bot-node/src/index.js`
- Editar flujo:
  - [Guia del editor](FLOW_EDITOR_GUIDE.md)
- Cargar la extension:
  - [Companion](WHATSAPP_WEB_COMPANION.md)
- Revisar storage:
  - [Neon Migration](NEON_MIGRATION.md)
- Revisar memoria de producto:
  - [Project Memory](PROJECT_MEMORY.md)

## Scripts npm importantes

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
- `npm run lab:check-pharmacy`

## Rutas utiles del sistema

- Produccion: `https://whatsapp-bot-node-chatbot1.vercel.app`
- Local:
  - `http://localhost:3000/`
  - `http://localhost:3000/flows`
  - `http://localhost:3000/conversations`
  - `http://localhost:3000/whatsapp-qr`
  - `http://localhost:3000/api/system/ready`
  - `http://localhost:3000/api/system/liveness`
  - `http://localhost:3000/api/system/storage`
