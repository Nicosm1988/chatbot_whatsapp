# Testing Matrix

## 1. Unit Tests

- Parser de eventos webhook.
- Router de intents.
- Politica de fallback.
- Politica de handoff.
- Formateo de respuestas.

## 2. Integration Tests

- Persistencia de mensaje inbound/outbound.
- Deduplicacion por `message_id`.
- Retry con backoff.
- Manejo de error de API externa.
- Actualizacion de estado de conversacion.

## 3. E2E Tests

- Handshake de webhook.
- Flujo completo de intent P0.
- Escalamiento a humano.
- Envio de template fuera de ventana.
- Recuperacion despues de fallo simulado.

## 4. Casos Negativos

- Payload invalido.
- Firma no valida.
- Token expirado.
- DB no disponible temporalmente.
- Cola saturada.

## 5. Datos de Prueba

- Usuario nuevo sin historial.
- Usuario con sesion activa.
- Usuario con sesion cerrada.
- Mensajes con texto ambiguo.
- Mensajes repetidos.

## 6. Definition of Done de QA

- Reporte de resultados por suite.
- Evidencia de casos P0 y P1.
- Lista de riesgos residuales.
- Recomendacion final: aprobar o bloquear release.
