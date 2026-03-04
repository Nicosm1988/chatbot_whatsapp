# Runtime Patterns

## 1. Flujo de Procesamiento Recomendado

1. Recibir evento en webhook.
2. Validar estructura y firma.
3. Extraer identificadores (`wamid`, `from`, `timestamp`).
4. Aplicar deduplicacion.
5. Publicar evento a cola interna.
6. Procesar intent y generar respuesta.
7. Enviar respuesta por Cloud API.
8. Persistir resultado y metricas.

## 2. Campos Minimos a Persistir

- `event_id`
- `message_id`
- `contact_id`
- `message_type`
- `raw_payload`
- `received_at`
- `processed_at`
- `status`

## 3. Politica de Errores

- Error transitorio API externa: retry con backoff.
- Error validacion negocio: no retry, marcar como descartado.
- Error desconocido: retry corto y luego dead-letter.

## 4. Timeouts Recomendados

- Webhook handler: 3-5s maximo.
- Llamada API WhatsApp: 5-10s.
- Consultas internas DB: 1-2s por operacion critica.

## 5. Metricas Minimas

- Eventos recibidos por minuto.
- Latencia p95 de procesamiento.
- Ratio de errores por tipo.
- Ratio de mensajes duplicados.
- Exito/fallo en envio saliente.

## 6. Pruebas Minimas del Runtime

- Evento valido procesa y responde.
- Evento duplicado no reprocesa.
- Evento invalido no cae el servicio.
- Falla API externa activa retry.
- Falla permanente termina en DLQ.
