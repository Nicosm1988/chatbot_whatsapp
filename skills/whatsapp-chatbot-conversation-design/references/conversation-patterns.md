# Conversation Patterns

## 1. Plantilla de Intent

- Nombre:
- Objetivo:
- Ejemplos de entrada:
- Datos requeridos:
- Respuesta principal:
- Fallback:
- Escalamiento:

## 2. Patrons de Mensaje

### Apertura

"Hola, soy el asistente virtual. Te ayudo con estado de pedido, devoluciones y soporte. Que necesitas?"

### Solicitud de dato faltante

"Para continuar necesito tu numero de pedido. Puedes compartirlo aqui?"

### Confirmacion

"Confirmo: quieres cancelar el pedido 12345. Responde SI para continuar."

### Cierre

"Listo, ya quedo registrado. Si necesitas algo mas, escribeme cuando quieras."

## 3. Fallback de 3 Niveles

- F1: "No te entendi bien. Puedes escribirlo de otra forma?"
- F2: "Puedo ayudarte con: 1) estado 2) devolucion 3) agente. Elige una opcion."
- F3: "Te paso con un agente para resolverlo mejor."

## 4. Guardrails Conversacionales

- No inventar datos de pedidos o cuentas.
- No confirmar acciones irreversibles sin doble confirmacion.
- Pedir informacion minima necesaria.
- Evitar solicitudes sensibles no justificadas.

## 5. Criterios de Calidad

- Mensajes de una sola idea.
- Lenguaje claro y directo.
- Tiempo de avance bajo por tarea.
- Tasa baja de loops de fallback.
