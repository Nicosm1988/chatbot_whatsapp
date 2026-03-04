---
name: whatsapp-chatbot-state-data
description: Diseñar modelo de datos, estado conversacional, retencion y trazabilidad para chatbot de WhatsApp. Usar cuando se necesite definir persistencia de usuarios, sesiones, mensajes y contexto para respuestas confiables.
---

# WhatsApp State and Data

## Overview

Definir una base de datos y un modelo de estado que permita conversaciones consistentes, auditables y faciles de evolucionar.

## Workflow

1. Identificar entidades de negocio.
2. Definir modelo de datos minimo.
3. Diseñar maquina de estados conversacional.
4. Establecer politicas de retencion.
5. Definir estrategia de migraciones.
6. Validar consultas criticas de rendimiento.

## Entidades Minimas

Incluir al menos:
- Contacto o usuario WhatsApp.
- Sesion conversacional.
- Mensaje entrante y saliente.
- Evento de negocio asociado.
- Handoff a agente (si aplica).

Ejemplo de esquema en `references/data-model-guide.md`.

## Estado Conversacional

Definir estado actual por sesion:
- Intent activo.
- Datos capturados.
- Paso pendiente.
- Ultima accion del bot.
- Nivel de fallback actual.

Evitar guardar estado solo en memoria de proceso.

## Retencion y Privacidad

Definir por entidad:
- Tiempo de retencion.
- Campos sensibles anonimizables.
- Procedimiento de borrado.
- Reglas de acceso por rol.

## Entregables

Entregar:
- Diagrama ER simplificado.
- Tabla de estados y transiciones.
- SQL inicial o migraciones equivalentes.
- Reglas de retencion y purga.
