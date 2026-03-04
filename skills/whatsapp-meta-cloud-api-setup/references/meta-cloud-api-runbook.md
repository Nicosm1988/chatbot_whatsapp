# Meta Cloud API Runbook

## 1. Variables de Entorno Recomendadas

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `META_API_VERSION` (ejemplo: `v22.0`)

## 2. Checklist de Onboarding

- Crear o seleccionar Meta App.
- Agregar producto WhatsApp en la app.
- Vincular WABA y numero de telefono.
- Generar token de acceso.
- Configurar webhook URL y verify token.
- Suscribir campos de eventos requeridos.
- Ejecutar mensaje de prueba.

## 3. Endpoints Tipicos

- Verificacion webhook: `GET /webhook`
- Recepcion eventos: `POST /webhook`
- Envio mensajes: `POST /{PHONE_NUMBER_ID}/messages`

## 4. Validaciones Criticas

- Endpoint accesible por HTTPS publico.
- Verify token correcto en handshake.
- Respuesta 200 en menos de 5 segundos.
- Manejo de duplicados por `message_id`.
- Registro de errores de API por codigo y detalle.

## 5. Errores Comunes

- Token vencido o con permisos insuficientes.
- Numero no habilitado para produccion.
- Webhook sin suscripcion a eventos correctos.
- No validacion de firma en ambientes productivos.
- Procesamiento sin cola que causa timeouts.

## 6. Criterio de Listo

- Mensaje entrante recibido y persistido.
- Respuesta saliente entregada desde backend propio.
- Manejo de errores basico en envio.
- Secretos gestionados fuera del codigo.
