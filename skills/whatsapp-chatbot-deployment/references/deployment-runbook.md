# Deployment Runbook

## 1. Checklist Pre-Deploy

- Variables de entorno completas.
- Migraciones validadas en staging.
- Tests P0 y P1 exitosos.
- Alertas activas.
- Plan de rollback confirmado.

## 2. Estrategias de Release

- Rolling update para cambios compatibles.
- Blue/green para cambios de alto riesgo.
- Canario para monitoreo progresivo.

## 3. Rollback

- Conservar imagen estable previa.
- Revertir version de app.
- Revertir migraciones solo si son reversibles y seguras.
- Notificar incidente y estado.

## 4. Metricas Operativas Minimas

- Disponibilidad webhook.
- p95 de latencia por mensaje.
- Ratio de errores API WhatsApp.
- Tasa de mensajes no entregados.

## 5. Alertas Recomendadas

- Error rate > umbral 5-10 min.
- Latencia p95 fuera de objetivo.
- Caida de consumidores de cola.
- Incremento de DLQ.

## 6. Operacion Continua

- Rotacion periodica de secretos.
- Revision semanal de incidentes.
- Ajuste de capacidad por demanda.
- Pruebas mensuales de recuperacion.
