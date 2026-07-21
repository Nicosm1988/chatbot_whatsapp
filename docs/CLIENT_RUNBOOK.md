# Client Runbook - Farmacia Delko

Last update: 2026-07-21

## Decisión operativa actual

- El alta oficial de Meta Cloud queda pausada mientras Meta revisa la restricción del portfolio.
- El canal de avance es WhatsApp Web con opciones escritas `A`, `B`, `C`, etc.
- La persona recibe un menú de texto y responde con la letra elegida; no necesita botones oficiales.
- Vercel mantiene el tablero y las vistas web, pero no puede mantener una sesión de WhatsApp Web abierta.
- El bot de WhatsApp debe correr en la PC Windows operativa de la farmacia, con el navegador controlado y la sesión vinculada.

Advertencia: este modo usa `whatsapp-web.js`, que no es una integración oficial autorizada por WhatsApp. No tiene soporte ni SLA de Meta y existe riesgo de restricción o pérdida de la cuenta asociada al número. Antes de vincular el número principal, la dueña debe conocer ese riesgo; para una prueba inicial se recomienda un número secundario no crítico. El opt-in y evitar envíos masivos reducen riesgo de spam, pero no vuelven oficial este método.

## Modos de atención disponibles

- **Bot inicial**:
  - envía una sola bienvenida por conversación, incluso si el proceso se reinicia mientras el cliente espera
  - marca el chat como `Aguardando ser atendido`
  - no vuelve a responder mientras espera a una persona
  - cuando alguien de la farmacia contesta por texto, audio o archivo, cambia el chat a `Atendido` y permanece en silencio
- **Bot completo**:
  - conserva el flujo guiado actual con opciones escritas por letras

El cambio puede hacerse desde el tablero de conversaciones abierto en la misma PC del bot, o desde el chat propio del número de la farmacia con uno de estos textos exactos:

- `Activá el bot inicial`
- `Activá el bot completo`

Por seguridad, un mensaje de un cliente no puede cambiar el modo. El comando sólo se acepta en el chat del número consigo mismo y el bot responde allí con una confirmación.

El selector del tablero queda deshabilitado cuando se abre desde Vercel, otra PC o una dirección pública. No publicar el tablero local mediante un proxy o túnel; para operación remota usar los comandos del chat propio.

Mensaje propuesto para el Bot inicial, pendiente de aprobación antes de vincular el teléfono:

> 👋 ¡Hola! Muchas gracias por comunicarte con Farmacia Delko.
>
> Recibimos tu mensaje. En breve, una persona de nuestro equipo te atenderá por este medio.
>
> 💚 Gracias por tu paciencia.

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
- `WHATSAPP_MOCK_MODE=false`
- `WHATSAPP_WEB_AUTH_MODE=connected_browser`
- `WHATSAPP_WEB_BROWSER_URL=http://127.0.0.1:9222`
- `BUSINESS_DISPLAY_NAME=Farmacia Delko`
- `DATABASE_URL`
- `AUDIT_STORAGE_PROVIDER=postgres`
- `AUDIT_ALLOW_MEMORY_FALLBACK=false`
- `PHARMACY_SYSTEM_API_BASE_URL`
- `PHARMACY_SYSTEM_API_USERNAME`
- `PHARMACY_SYSTEM_API_PASSWORD`
- `WHATSAPP_WEB_INACTIVITY_CHECK_INTERVAL_MS=300000`

Variables opcionales utiles:

- `WHATSAPP_WEB_SESSION_NAME`
- `WHATSAPP_WEB_AUTH_DATA_PATH`
- `WHATSAPP_WEB_EXECUTABLE_PATH`
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `CRON_SECRET` (sólo para diagnósticos manuales del endpoint; no hace falta para el control local)

## 4) Inicio recomendado en modo web

Desde `apps/whatsapp-bot-node` en la PC Windows de la farmacia:

```powershell
npm ci
npm run lab:restart
```

Despues:

1. Abrir `http://localhost:3000/whatsapp-qr`
2. Si aparece un QR, vincularlo desde el teléfono que tiene el WhatsApp de prueba o de la farmacia, según el piloto aprobado.
3. Confirmar que la sesión quede autenticada.
4. Verificar `http://localhost:3000/api/system/ready` y `http://localhost:3000/api/system/liveness`.
5. Desde un segundo teléfono, escribir `Hola`, responder `A` y confirmar que avanza al siguiente menú.

No ejecutar `npm run deploy:prod` ni sincronizar webhooks de Meta para activar este modo. Esos pasos corresponden al canal Cloud oficial.

### Cambiar del número de prueba al número de la farmacia

En modo Web no se cambia una variable de teléfono. El número activo es la cuenta de WhatsApp Business que escanea el QR.

1. Confirmar que la versión aprobada del proyecto está instalada en la PC Windows.
2. Desvincular la sesión `Bot Delko` del teléfono de prueba anterior o cerrar esa sesión en el navegador controlado.
3. Ejecutar `npm run lab:restart`.
4. Abrir `http://localhost:3000/whatsapp-qr`.
5. En el teléfono de la farmacia: WhatsApp Business → Dispositivos vinculados → Vincular un dispositivo.
6. Escanear el QR.
7. Desde un segundo teléfono autorizado, enviar un mensaje de prueba.
8. Confirmar que llega una sola bienvenida, que aparece `Aguardando ser atendido` y que la primera respuesta humana lo cambia a `Atendido`.

No instalar todavía el inicio automático hasta que esa prueba sea correcta.

### Colores de las etiquetas

El bot crea/reconoce las etiquetas y realiza el cambio automático entre ellas. El color debe elegirse una sola vez dentro de WhatsApp Business:

- `Aguardando ser atendido`: rojo
- `Atendido`: verde

El transporte Web no ofrece una forma estable de imponer esos colores por código.

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
5. Enviar `Hola`, elegir al menos dos menús por letra y probar `Volver`.
6. Confirmar que foto y PDF de receta llegan al paso de asesor.
7. Confirmar que no se vea JSON ni IDs internos en pantallas cliente.
8. Confirmar que el editor guarda y el bot refleja el cambio.

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
- Si el storage no persiste:
  - revisar `DATABASE_URL`
  - revisar `/api/system/storage`
- Si no sale el recordatorio por inactividad:
  - confirmar que el proceso local y el navegador siguen abiertos
  - revisar `/api/system/liveness`
  - reiniciar con `npm run lab:restart`
- Si falla Cloud API:
  - revisar `WHATSAPP_APP_SECRET`
  - revisar `WHATSAPP_ACCESS_TOKEN`
  - revisar `WHATSAPP_PHONE_NUMBER_ID`
