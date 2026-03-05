---
description: Implementación y arquitectura de un Chatbot de WhatsApp para el sector farmacéutico (Farmacias), incluye configuración estática y Agente LLM.
---

# 🏥 WhatsApp Chatbot for Pharma (Farmacias)

Este skill provee la documentación y guía de configuración para desplegar un bot de WhatsApp enfocado en resolver consultas de farmacias.
Se adapta a dos niveles de madurez tecnológica:

1. **Chatbot Basado en Reglas (Rule-Based)**: Conduce al usuario a través de un menú rígido y estructurado.
2. **Chatbot Basado en Agente IA (LLM)**: Procesa intenciones conversacionales abiertas utilizando GPT-4o.

---

## 🚀 Instalación y Configuración Base

1. Posiciónate en la carpeta base `apps/whatsapp-bot-node`.
2. Instala las dependencias con `npm install`.
3. Copia el archivo de variables de entorno: `cp .env.example .env`.

Configura las siguientes variables en tu `.env` para la conectividad con Meta (WhatsApp):

```bash
PORT=3000
WHATSAPP_ACCESS_TOKEN=TU_TOKEN
WHATSAPP_PHONE_NUMBER_ID=TU_PHONE_ID
WHATSAPP_WEBHOOK_VERIFY_TOKEN=mi-token-seguro
WHATSAPP_APP_SECRET=Opcional
```

---

## 🔀 Modo 1: Chatbot Basado en Reglas

Por defecto, si no configuras `AGENTIC_MODE=true`, el bot utilizará la estructura estática ubicada en `src/conversation_rules.js`.

**Flujo Implementado:**

- **Menú de Bienvenida:** Saludo y presentación de opciones.
  - 📦 **Consultar Stock:** Instrucciones para que el cliente envíe foto/nombre.
  - 📝 **Enviar Receta:** Instrucciones sobre cómo enviar foto legible de prescripción médica.
  - 📅 **Sacar Turno:** Sub-menú para servicios de enfermería (Vacunación, Toma de presión, Asesoría).
  - 📍 **Sucursales:** Respuesta directa con direcciones y horarios.

**Para modificar este flujo:**
Edita las funciones `handleIdleState()`, `handleTurnosState()`, etc., dentro de `apps/whatsapp-bot-node/src/conversation_rules.js`.

---

## 🤖 Modo 2: Chatbot Basado en Agente IA (GPT-4o)

Si quieres habilitar la conversación fluida natural y el triaje automático:

1. Asegúrate de tener una API Key de OpenAI.
2. Añade en tu `.env`:

```bash
AGENTIC_MODE=true
OPENAI_API_KEY=tu-api-key-de-openai
```

**Comportamiento del Agente:**
El bot será ruteado automáticamente hacia `src/conversation_agent.js`. Este script guarda el historial conversacional (las últimas 10 interacciones de un usuario) en memoria (un Map simple de JS).
Luego utiliza el archivo `src/llm.js` donde está configurado el **System Prompt** de "Farmacia Modelo".

**⚙️ Tool Calling (Herramientas del Asistente):**
El agente tiene habilitadas herramientas para reaccionar a la intención del cliente:

- `consultar_stock_precio`: Evalúa el contexto si el cliente pregunta por la existencia de un medicamento específico.
- `agendar_turno`: Identifica y reacciona cuando un cliente pide toma de presión o vacunación.

Para agregar más herramientas o ajustar el prompt, edita `src/llm.js`.

---

## 🧪 Pruebas Locales (Mock Mode)

Puedes iniciar el servidor en modo mock para simular eventos de entrada sin necesidad de conectarlo a Meta o exponer un puerto a internet con Ngrok:

```bash
WHATSAPP_MOCK_MODE=true npm run dev
```

Luego puedes lanzar un Request POST al servidor:

```bash
curl -X POST http://localhost:3000/webhook \
-H "Content-Type: application/json" \
-d '{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "5491112345678",
          "id": "wamid.mock",
          "text": { "body": "Hola, necesito saber si tienen Ibuprofeno 400" }
        }]
      }
    }]
  }]
}'
```

Dependiendo del modo configurado (Agentic vs Rules), obtendrás respuestas adaptadas en consola y simulación de envío a través de WhatsApp.
