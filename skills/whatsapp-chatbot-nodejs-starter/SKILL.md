---
name: whatsapp-chatbot-nodejs-starter
description: Crear y adaptar una base de chatbot de WhatsApp con Node.js y Express, incluyendo webhook de Meta, validacion de firma y cliente de envio de mensajes. Usar cuando se necesite iniciar implementacion rapida en Node.js o refactorizar un backend existente.
---

# WhatsApp Node.js Starter

## Overview

Usar este skill para iniciar rapidamente un backend Node.js para WhatsApp Cloud API con estructura lista para desarrollo.

## Workflow

1. Copiar la plantilla base de `assets/nodejs-express-template/` al proyecto destino.
2. Configurar variables de entorno y endpoint publico de webhook.
3. Probar handshake de verificacion de webhook.
4. Probar recepcion de mensaje y respuesta saliente.
5. Reemplazar logica de eco por intents de negocio.

## Quick Start

Copiar plantilla:

```bash
mkdir -p <ruta-proyecto>
cp -R assets/nodejs-express-template/. <ruta-proyecto>/
```

Instalar dependencias y ejecutar:

```bash
cd <ruta-proyecto>
npm install
npm run dev
```

## Configuracion

Definir en `.env`:
- `PORT`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET` (opcional pero recomendado)
- `META_API_VERSION`

## Implementacion

- Mantener `GET /webhook` para handshake de Meta.
- Mantener `POST /webhook` con respuesta rapida y procesamiento asincrono.
- Usar deduplicacion por `message.id`.
- Sustituir la funcion `buildReplyText` por logica de intents.

## Testing

Seguir `references/local-testing.md` para pruebas locales con `ngrok` y configuracion en Meta.

## Entregables

Entregar:
- Proyecto Node.js funcional con webhook validado.
- Variables de entorno documentadas.
- Flujo de prueba inbound/outbound exitoso.
