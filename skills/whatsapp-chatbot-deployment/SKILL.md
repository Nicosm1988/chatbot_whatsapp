---
name: whatsapp-chatbot-deployment
description: Desplegar y operar chatbot de WhatsApp en produccion con seguridad, escalabilidad y rollback controlado. Usar cuando se requiera preparar infraestructura, CI/CD, observabilidad y procedimientos operativos.
---

# WhatsApp Bot Deployment

## Overview

Llevar el chatbot a produccion con controles de seguridad y operacion para minimizar downtime y facilitar recuperacion.

## Workflow

1. Definir arquitectura de despliegue.
2. Preparar empaquetado y configuracion.
3. Configurar CI/CD con validaciones.
4. Gestionar secretos y networking seguro.
5. Publicar con estrategia de release.
6. Monitorear y activar plan de rollback si aplica.

## Arquitectura de Despliegue

Preferir arquitectura stateless para servicio webhook + workers asincronos + base de datos administrada.

Separar ambientes:
- Dev
- Staging
- Produccion

## CI/CD Minimo

Incluir pasos:
- Lint y tests.
- Escaneo basico de seguridad.
- Build de imagen versionada.
- Deploy automatizado a staging.
- Aprobacion para produccion.

Guia operativa en `references/deployment-runbook.md`.

## Seguridad Operativa

Aplicar:
- Secret manager para tokens.
- TLS en todo trafico externo.
- Principio de minimo privilegio.
- Logs estructurados sin datos sensibles.

## Entregables

Entregar:
- Diagrama de despliegue.
- Pipeline CI/CD descrito por etapas.
- Runbook de rollback.
- SLO y alertas iniciales.
