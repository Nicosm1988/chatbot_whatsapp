# Data Model Guide

## 1. Esquema Base Sugerido

### contacts

- `id` (PK)
- `wa_id` (UNIQUE)
- `display_name`
- `language`
- `created_at`
- `updated_at`

### conversations

- `id` (PK)
- `contact_id` (FK)
- `status` (open, pending_handoff, closed)
- `active_intent`
- `fallback_level`
- `last_message_at`
- `created_at`
- `updated_at`

### messages

- `id` (PK)
- `conversation_id` (FK)
- `direction` (inbound, outbound)
- `message_id` (UNIQUE)
- `message_type`
- `body`
- `raw_payload`
- `created_at`

### handoffs

- `id` (PK)
- `conversation_id` (FK)
- `reason`
- `agent_id`
- `status`
- `created_at`
- `resolved_at`

## 2. Indices Recomendados

- `messages(message_id)`
- `messages(conversation_id, created_at)`
- `conversations(contact_id, status)`
- `contacts(wa_id)`

## 3. Politica de Retencion Sugerida

- Mensajes crudos: 90-180 dias segun politica legal.
- Metadatos operativos: 12 meses.
- Logs tecnicos: 30-90 dias.

## 4. Reglas de Integridad

- No eliminar contacto si hay conversaciones activas.
- No permitir estados invalidos en transicion.
- Asegurar idempotencia por `message_id`.

## 5. Consultas Operativas Tipicas

- Ultimos N mensajes por conversacion.
- Conversaciones con fallback alto.
- Conversaciones pendientes de agente.
- Tasa de cierre por intent.
