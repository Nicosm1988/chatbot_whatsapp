---
name: whatsapp-chatbot-runtime
description: Implementar el runtime del chatbot de WhatsApp con webhook, envio de mensajes, idempotencia, manejo de errores y observabilidad basica. Usar cuando se construya o refactorice el backend que procesa eventos en tiempo real.
---

# WhatsApp Chatbot Runtime

## Overview

Construir un backend robusto para procesar eventos entrantes, ejecutar logica de negocio y responder por WhatsApp sin perder mensajes.

## Workflow

1. Definir arquitectura de procesamiento.
2. Implementar endpoints de webhook.
3. Normalizar eventos entrantes.
4. Aplicar idempotencia y control de reintentos.
5. Implementar cliente de envio de mensajes.
6. Agregar trazas, logs y metricas minimas.

## Arquitectura Base

Separar capas:
- Capa HTTP webhook.
- Cola o dispatcher de eventos.
- Motor conversacional.
- Adaptador de API WhatsApp.
- Persistencia de estado.

No mezclar logica conversacional con el controlador HTTP.

## Requisitos de Webhook

Aplicar:
- Responder rapido al POST con `200`.
- Enviar trabajo pesado a cola asincrona.
- Guardar evento crudo para auditoria.
- Rechazar payload invalido sin romper servicio.

Detalles tecnicos en `references/runtime-patterns.md`.

## Idempotencia y Reintentos

Usar `message_id` o `wamid` como llave de deduplicacion.

Reglas:
- Si evento ya procesado, devolver exito sin reprocesar.
- Si falla dependencia externa, reintentar con backoff exponencial.
- Si supera maximo de reintentos, mover a dead-letter queue.

## Envio de Mensajes

Implementar un adaptador con:
- Metodo unico para texto, plantillas y media.
- Parseo estandar de errores.
- Timeouts configurables.
- Correlation ID por solicitud.

## Entregables

Entregar:
- Diagrama simple de componentes.
- Contrato de eventos internos.
- Tabla de errores y politica de retry.
- Lista de endpoints con ejemplos de payload.
