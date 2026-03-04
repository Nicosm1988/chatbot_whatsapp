---
name: whatsapp-chatbot-discovery
description: Definir objetivos de negocio, alcance, flujos, requisitos funcionales y no funcionales para chatbots de WhatsApp. Usar cuando se necesite transformar una idea en plan de implementacion, backlog tecnico, criterios de exito o roadmap.
---

# WhatsApp Chatbot Discovery

## Overview

Convertir una idea de chatbot en un plan ejecutable antes de escribir codigo. Reducir retrabajo identificando alcance, restricciones y dependencias desde el inicio.

## Workflow

1. Recopilar contexto base.
2. Definir objetivo principal del bot y metricas de exito.
3. Delimitar alcance MVP vs. fases futuras.
4. Diseñar mapa conversacional de alto nivel.
5. Identificar integraciones, riesgos y supuestos.
6. Transformar resultados en backlog priorizado.

## Recopilar Contexto Base

Solicitar informacion minima:
- Industria y caso de uso.
- Tipo de usuarios y volumen esperado.
- Horario de operacion y necesidad de agente humano.
- Idiomas requeridos.
- Sistemas existentes (CRM, ERP, helpdesk, e-commerce).

Si falta informacion critica, declarar supuestos explicitos para no bloquear avance.

## Definir Objetivo y Metricas

Definir una meta principal y 2-5 metricas.

Ejemplos de metricas tradicionales:
- Tasa de resolucion sin agente.
- Tiempo medio de respuesta.
- Satisfaccion de usuario.

**Métricas B2B Clave (ROI & Ventas):**
- **CPL (Costo por Lead Generado):** Reducción respecto al CPL de Ads tradicionales usando el bot conversacional.
- **Tasa de Cualificación Automática:** Porcentaje de leads que llegan al CRM listos para cierre sin pasar por el SDR humano.
- **Tasa de Conversión a Reunión Agendada:** Porcentaje de conversaciones que resultan en handoff a calendario/sales exec.
- **CAC (Costo de Adquisición de Cliente):** Impacto del bot en la reducción de horas-hombre invertidas antes de la firma.

Evitar metricas ambiguas como "mejorar experiencia" sin criterio cuantificable.

## Delimitar Alcance

Separar:
- MVP: funcionalidades indispensables para salir a produccion.
- Fase 2: mejoras que no bloquean el lanzamiento.
- Fuera de alcance: solicitudes descartadas por ahora.

Cada capacidad debe tener criterio de aceptacion verificable.

## Diseñar Conversacion de Alto Nivel

Definir:
- Entradas del usuario (texto, audio, imagen, botones).
- Intents principales.
- Respuestas esperadas por intent.
- Fallback y recuperacion cuando el bot no entiende.
- Escalamiento a humano.

Para detalle operativo usar `references/discovery-checklists.md`.

## Entregables

Entregar siempre:
- Resumen ejecutivo de 5-10 lineas.
- Tabla de intents priorizados.
- Lista de requerimientos tecnicos.
- Lista de riesgos con mitigacion.
- Backlog inicial con prioridad (P0, P1, P2).

## Calidad de la Salida

Verificar antes de cerrar:
- El alcance del MVP es realizable en una iteracion.
- Todas las dependencias externas estan identificadas.
- Los criterios de aceptacion permiten pruebas objetivas.
- Existen decisiones claras para fallback y handoff.
