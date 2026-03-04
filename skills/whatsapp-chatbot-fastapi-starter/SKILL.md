---
name: whatsapp-chatbot-fastapi-starter
description: Crear y adaptar una base de chatbot de WhatsApp con Python FastAPI, incluyendo webhook de Meta, validacion de firma y cliente HTTP para envio de mensajes. Usar cuando se necesite arrancar rapido en Python o estandarizar un backend existente.
---

# WhatsApp FastAPI Starter

## Overview

Usar este skill para crear una base productiva en FastAPI para WhatsApp Cloud API con estructura clara y extensible.

## Workflow

1. Copiar la plantilla base de `assets/fastapi-template/` al proyecto destino.
2. Crear entorno virtual e instalar dependencias.
3. Configurar variables de entorno y webhook de Meta.
4. Probar verificacion del webhook.
5. Probar mensajes entrantes y respuestas salientes.
6. Reemplazar respuesta base por logica de negocio.

## Quick Start

Copiar plantilla:

```bash
mkdir -p <ruta-proyecto>
cp -R assets/fastapi-template/. <ruta-proyecto>/
```

Ejecutar:

```bash
cd <ruta-proyecto>
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
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

- Mantener `GET /webhook` para handshake.
- Mantener `POST /webhook` con respuesta rapida y procesamiento en background.
- Usar deduplicacion por `message.id`.
- Reemplazar `build_reply_text` por intents reales.

## Testing

Seguir `references/local-testing.md` para pruebas locales con ngrok y Meta.

## Entregables

Entregar:
- Proyecto FastAPI funcional con webhook validado.
- Variables de entorno documentadas.
- Flujo de prueba inbound/outbound exitoso.
