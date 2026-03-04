# Discovery Checklists

## 1. Preguntas Iniciales

- Cual es el objetivo principal del chatbot?
- Cuales son los 3 problemas de negocio que debe resolver?
- Que sistemas debe consultar o actualizar?
- Se requiere atencion 24/7?
- Cual es la tolerancia a errores y caidas?

## 2. Mapa de Intents Minimo

- Saludo y primer contacto.
- Consulta de estado (pedido, ticket, cuenta).
- FAQ frecuentes.
- Captura de datos clave.
- Escalamiento a agente humano.
- Cierre de conversacion.

## 3. Requisitos No Funcionales

- Disponibilidad objetivo (ejemplo: 99.9%).
- Tiempo de respuesta objetivo (ejemplo: < 3 segundos).
- Seguridad de datos y acceso.
- Retencion y borrado de datos.
- Trazabilidad de decisiones del bot.

## 4. Dependencias Tipicas

- Cuenta Meta Business verificada.
- Numero habilitado en WhatsApp Business Platform.
- Endpoint HTTPS publico para webhooks.
- Servicio de base de datos.
- Canal de soporte humano para handoff.

## 5. Plantilla de Backlog Inicial

- P0: Recibir y enviar mensajes por webhook.
- P0: Resolver intents de alta frecuencia.
- P0: Implementar fallback y handoff.
- P1: Persistir historial y contexto.
- P1: Panel basico de monitoreo.
- P2: Personalizacion avanzada por segmento.

## 6. Riesgos Frecuentes

- Alcance demasiado grande para MVP.
- Integraciones externas no listas.
- Falta de entrenamiento para casos ambiguos.
- Mala definicion de templates para mensajes fuera de ventana.
- Ausencia de plan de contingencia ante incidentes.
