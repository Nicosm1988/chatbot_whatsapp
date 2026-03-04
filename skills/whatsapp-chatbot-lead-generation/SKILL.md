---
name: whatsapp-chatbot-lead-generation
description: Crear flujos conversacionales enfocados en la captura inteligente de datos, perfilamiento y nutrición de leads en WhatsApp antes de ingresar al CRM.
---

# WhatsApp Lead Generation & Profiling

## Overview

Convertir conversaciones en WhatsApp en registros estructurados (leads) listos para la gestión comercial. El enfoque debe equilibrar la recolección de datos útil con una fricción mínima para el usuario.

## Workflow

1. Diseñar el gancho o "Lead Magnet" adaptado a WhatsApp (ej. un PDF útil, una evaluación, una consulta rápida).
2. Segmentar progresivamente: Hacer preguntas clave para perfilar antes de pedir los datos de contacto tradicionales.
3. Establecer reglas de re-engagement (nutrición) si el usuario abandona a mitad del flujo.
4. Definir estructura del payload (JSON) para mapear al CRM.

## Recolección Progresiva (Progressive Profiling)

No pedir todos los datos de una sola vez ("Dime tu Nombre, Email, Empresa, Puesto, Presupuesto..."). Eso mata la conversión.

**Patrón Recomendado:**
- Turno 1: Entregar valor o responder duda rápida. Pida una métrica del negocio.
- Turno 2: Entregar resultado parcial. Pedir nombre e industria.
- Turno 3: Entregar resultado final o escalar a Asesor. Pedir email corporativo si aplica.

## Manejo de Datos (Opt-in & Consentimiento)

- Siempre ser explícito sobre que un asesor se pondrá en contacto.
- WhatsApp Business por diseño valida el número de teléfono, por tanto el ID de WhatsApp es tu primer y más importante "dato".
- Solo pide el correo si tu CRM / embudo de marketing requiere cruzar datos por email, de lo contrario, comunica todo por WhatsApp.

## Payload de Referencia (Export to CRM)

Cada flujo de Lead Gen debe retornar al final un payload limpio para webhook/CRM:

```json
{
  "whatsapp_id": "5491122334455",
  "name": "Juan Perez",
  "company": "Acme Corp",
  "industry": "Retail",
  "pain_point": "Alta tasa de abandono en carrito",
  "urgency": "Alta",
  "source": "WhatsApp_LandingPage",
  "opt_in_marketing": true
}
```

Ver archivo `references/data-collection-patterns.md` para buenas prácticas conversacionales al solicitar datos.
