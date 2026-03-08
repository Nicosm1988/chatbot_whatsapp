---
name: whatsapp-commercial-proposal-orchestrator
description: Orquestar la creacion de propuestas comerciales para proyectos de chatbot de WhatsApp usando un flujo de discovery, pricing, ROI, implementacion, riesgos y cierre.
---

# WhatsApp Commercial Proposal Orchestrator

## Overview

Coordinar especialistas para generar una propuesta comercial completa, coherente y vendible para clientes de chatbot WhatsApp.

## When to use

Usar cuando el usuario pida:
- propuesta comercial completa
- propuesta para cliente final
- version ejecutiva + version tecnica
- narrativa de valor y cierre comercial

## Orchestration flow

1. Ejecutar `whatsapp-commercial-proposal-discovery`.
2. Ejecutar `whatsapp-commercial-proposal-packaging-pricing`.
3. Ejecutar `whatsapp-commercial-proposal-roi`.
4. Ejecutar `whatsapp-commercial-proposal-implementation`.
5. Ejecutar `whatsapp-commercial-proposal-risk-governance`.
6. Ejecutar `whatsapp-commercial-proposal-writer`.
7. Ejecutar `whatsapp-commercial-proposal-negotiation` para preparar cierre.

## Required output

Entregar siempre:
- Resumen ejecutivo (max 1 pagina)
- Alcance y entregables
- Paquetes y precios
- Modelo de ROI
- Plan de implementacion por fases
- Riesgos y mitigaciones
- Proxima accion comercial concreta

## Quality gate

Antes de cerrar:
- Los numeros de pricing y ROI son consistentes entre secciones.
- El alcance no promete mas de lo que el equipo puede entregar.
- Existe CTA final claro (reunion, firma o pago inicial).

Ver `references/proposal-orchestration.md`.
