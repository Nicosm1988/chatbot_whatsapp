---
name: whatsapp-chatbot-conversation-design
description: Diseñar intents, flujos, prompts y estrategias de fallback para chatbot de WhatsApp con experiencia consistente y escalamiento a humano. Usar cuando se definan conversaciones, tono y reglas de respuesta del bot.
---

# WhatsApp Conversation Design

## Overview

Diseñar conversaciones claras, cortas y accionables para WhatsApp, minimizando friccion y evitando bucles de confusion.

## Workflow

1. Definir objetivos por intent.
2. Diseñar estructura de turnos y contexto.
3. Crear reglas de respuesta y tono.
4. Implementar fallback multi-nivel.
5. Diseñar handoff a humano.
6. Validar con casos reales y edge cases.

## Catalogo de Intents

Para cada intent definir:
- Disparadores comunes.
- Datos requeridos.
- Respuesta ideal.
- Regla de exito.
- Condicion de escalamiento.

Mantener intents del MVP acotados y medibles.

## Reglas Conversacionales (General & B2B)

Aplicar:
- Mensajes cortos con una accion por turno.
- Confirmaciones explicitas para operaciones sensibles.
- Respuestas con opciones concretas cuando exista ambiguedad.
- Evitar respuestas largas que mezclen multiples objetivos.

**Para flujos B2B y Generación de Leads:**
- Usar el patrón "Dar para Recibir" (entregar valor o insights antes de exigir datos de contacto duro o presupuesto).
- Enfocarse en objeciones orientando el fallback no solo a "No entiendo", sino a "Aquí tienes el valor clave de lo que hacemos" antes de perder el prospecto.

Patrones y plantillas en `references/conversation-patterns.md`.

## Fallback y Recuperacion

Usar tres niveles:
- Nivel 1: reformulacion simple.
- Nivel 2: opciones guiadas.
- Nivel 3: transferencia a agente humano.

Nunca repetir la misma respuesta de fallback mas de 2 veces seguidas.

## Handoff a Humano

Definir criterio claro:
- Solicitud explicita del usuario.
- Baja confianza repetida.
- Tema fuera de politica o alcance.
- Caso con riesgo operativo.

Al transferir, incluir resumen de contexto para evitar que el usuario repita informacion.
