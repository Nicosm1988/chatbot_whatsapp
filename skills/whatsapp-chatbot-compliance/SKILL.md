---
name: whatsapp-chatbot-compliance
description: Aplicar cumplimiento para chatbot de WhatsApp en opt-in, uso de templates, privacidad de datos y politicas de mensajeria de Meta. Usar cuando se definan reglas legales y operativas para evitar bloqueos o sanciones.
---

# WhatsApp Bot Compliance

## Overview

Asegurar que el chatbot opere dentro de politicas de WhatsApp y requisitos de privacidad, reduciendo riesgo de bloqueo de numero o cuenta.

## Workflow

1. Definir estrategia de consentimiento (opt-in).
2. Clasificar mensajes por tipo y ventana conversacional.
3. Gestionar templates aprobados.
4. Definir politicas de privacidad y retencion.
5. Preparar controles de abuso y auditoria.
6. Revisar cumplimiento antes de cada release.

## Opt-in

Registrar evidencia de consentimiento:
- Fuente del consentimiento.
- Fecha y canal.
- Proposito comunicado al usuario.
- Mecanismo de opt-out.

## Ventana y Templates

Aplicar reglas:
- Dentro de ventana de conversacion: mensajes de sesion.
- Fuera de ventana: usar templates aprobados.
- No enviar mensajes promocionales sin base de consentimiento valida.

Detalles practicos en `references/compliance-checklist.md`.

## Privacidad y Seguridad

Definir:
- Datos recolectados y finalidad.
- Tiempo de retencion por categoria.
- Procedimiento para borrado/anonimizacion.
- Control de acceso por roles.

## Entregables

Entregar:
- Matriz de cumplimiento por requisito.
- Inventario de templates con estado.
- Politica de opt-in/opt-out.
- Riesgos y acciones correctivas.
