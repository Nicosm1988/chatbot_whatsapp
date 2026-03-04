---
name: whatsapp-chatbot-testing
description: Diseñar y ejecutar pruebas unitarias, integracion y end-to-end para chatbot de WhatsApp, incluyendo webhook, flujos conversacionales, retries y fallbacks. Usar cuando se valide calidad antes de despliegue o despues de cambios.
---

# WhatsApp Bot Testing

## Overview

Validar comportamiento funcional y tecnico del bot antes de cada release, reduciendo regresiones y fallos en produccion.

## Workflow

1. Definir estrategia de pruebas por capas.
2. Construir fixtures de eventos reales.
3. Probar intents y transiciones de estado.
4. Probar errores, retries e idempotencia.
5. Ejecutar pruebas E2E en entorno de staging.
6. Aprobar release con criterios objetivos.

## Estrategia por Capas

Aplicar:
- Unitarias para logica de intents y reglas.
- Integracion para DB, cola y API WhatsApp mock.
- E2E para webhook real + numero de prueba.

Usar matriz y criterios en `references/testing-matrix.md`.

## Casos Criticos

Cubrir siempre:
- Mensaje valido procesa y responde.
- Mensaje duplicado no duplica accion.
- Intent desconocido activa fallback correcto.
- Error transitorio reintenta y recupera.
- Error permanente escala o registra correctamente.

## Criterio de Aprobacion

Definir gate minimo:
- 100% de casos P0 verdes.
- Sin fallos criticos abiertos.
- Error budget de staging en rango.
- Prueba de humo post-deploy completada.
