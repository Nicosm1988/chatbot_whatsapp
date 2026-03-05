const { OpenAI } = require("openai");
const { config } = require("./config");

let _openaiClient = null;

function getOpenAIClient() {
    if (!_openaiClient && config.openaiApiKey) {
        _openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
    }
    return _openaiClient;
}

const SYSTEM_PROMPT = `Eres el asistente virtual experto de Farmacia Modelo.
Tu objetivo es ayudar a los clientes de forma empática, rápida y profesional.
Puedes ayudarles con:
1. Consultar si hay stock o precio de medicamentos de venta libre y bajo receta.
2. Indicarles cómo enviar una receta médica para su preparación.
3. Agendar turnos para vacunación, toma de presión o atención personalizada con un farmacéutico.
4. Informar sobre horarios (Centro 8 a 22hs, Norte 24hs, Sur 9 a 20hs).

Reglas importantes:
- Sé conciso, no explayes más de 3-4 líneas.
- SIEMPRE que alguien pida un medicamento bajo receta, recuérdale que deberá presentar la receta (enviar foto por acá o llevarla en persona).
- Si un cliente necesita hacer una consulta que requiere la decisión de un farmacéutico titular, dile que vas a derivarlo con un especialista e infórmaselo.
- Mantén un tono cordial, amable y cuidadoso, es un servicio de salud.`;

const TOOLS = [
    {
        type: "function",
        function: {
            name: "consultar_stock_precio",
            description: "Consulta el sistema para verificar si un medicamento está en stock y su precio estimado.",
            parameters: {
                type: "object",
                properties: {
                    nombre_medicamento: {
                        type: "string",
                        description: "Nombre del medicamento a consultar (p.ej. Ibuprofeno 400mg)."
                    }
                },
                required: ["nombre_medicamento"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "agendar_turno",
            description: "Inicia el flujo de agendamiento para vacunación o toma de presión.",
            parameters: {
                type: "object",
                properties: {
                    servicio: {
                        type: "string",
                        description: "Servicio a agendar.",
                        enum: ["vacunacion", "toma_presion", "asesoria_farmaceutica"]
                    }
                },
                required: ["servicio"]
            }
        }
    }
];

async function generateReply(conversationHistory) {
    const client = getOpenAIClient();

    if (!client) {
        // Fallback if no API key is provided
        return "Estoy en modo de mantenimiento (falta configurar OPENAI_API_KEY). Pero puedo derivarte a un asesor si escribes 'agente'.";
    }

    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...conversationHistory
    ];

    try {
        const response = await client.chat.completions.create({
            model: "gpt-4o",
            messages,
            tools: TOOLS,
            temperature: 0.5,
            max_tokens: 250
        });

        const choice = response.choices[0];
        if (choice.finish_reason === "tool_calls") {
            // Simulated tool output
            const toolCall = choice.message.tool_calls[0];
            const funcName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);
            
            if (funcName === "consultar_stock_precio") {
                return `*(Sistema: Evaluando stock de ${args.nombre_medicamento}...)*\n\n¡Sí! Tenemos ${args.nombre_medicamento} en stock en nuestras sucursales con un valor aproximado de $12.500. ¿Preferís acercarte o enviarlo a domicilio?`;
            } else if (funcName === "agendar_turno") {
                return `*(Sistema: Verificando agenda para ${args.servicio}...)*\n\nPerfecto, un operador humano de Farmacia Modelo va a tomar tu solicitud y confirmarte el horario disponible para el turno de ${args.servicio.replace("_", " ")}. ¿A qué hora te quedaría mejor venir?`;
            }
        }

        return choice.message.content || "Lo siento, tuve un problema procesando tu mensaje.";
    } catch (error) {
        console.error("Error calling OpenAI:", error);
        return "Disculpa, en este momento tengo problemas de conexión. Por favor intenta de nuevo en unos minutos.";
    }
}

module.exports = { generateReply };
