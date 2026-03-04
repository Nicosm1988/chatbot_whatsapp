---
name: whatsapp-meta-cloud-api-setup
description: Configurar y validar Meta WhatsApp Cloud API, credenciales, webhooks y telefonia para un chatbot productivo. Usar cuando se necesite onboarding tecnico de la plataforma, conexion segura y pruebas de envio/recepcion.
---

# WhatsApp Cloud API Setup

## Overview

Preparar la base de plataforma en Meta para que el bot pueda recibir y enviar mensajes de forma segura y estable.

## Workflow

1. Confirmar proveedor de WhatsApp.
2. Configurar activos de Meta Business.
3. Crear app y permisos necesarios.
4. Configurar webhook y token de verificacion.
5. Probar eventos entrantes y mensajes salientes.
6. Documentar secretos y rotacion de credenciales.

## Confirmar Proveedor

Asumir Cloud API oficial de Meta salvo que el usuario pida explicitamente BSP externo (ejemplo: Twilio, 360dialog).

Si hay BSP externo, detener este skill y recomendar skill especifico del proveedor.

## Configurar Activos de Meta

Verificar:
- Business Manager activo.
- WhatsApp Business Account (WABA) disponible.
- Numero de telefono no reutilizado por otra integracion.
- Metodo para generar token de larga duracion.

Usar checklist detallada en `references/meta-cloud-api-runbook.md`.

## Configurar Webhook

Definir endpoint HTTPS publico con:
- `GET /webhook` para verificacion.
- `POST /webhook` para eventos.

Requisitos:
- Validar `hub.verify_token`.
- Responder `200` rapido al POST.
- Encolar procesamiento pesado fuera del request.

## Seguridad

Aplicar minimo:
- Guardar token en secret manager.
- No exponer secretos en logs.
- Validar firma de Meta (`X-Hub-Signature-256`) cuando aplique.
- Rotar tokens en ventanas programadas.

## Entregables

Entregar:
- Estado de onboarding por item (hecho/pendiente).
- Variables de entorno requeridas.
- Resultado de prueba de webhook y mensaje.
- Bloqueadores actuales y accion siguiente.
