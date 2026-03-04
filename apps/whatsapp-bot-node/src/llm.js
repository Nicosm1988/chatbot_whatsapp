const { OpenAI } = require("openai");
const { config } = require("./config");

let _openaiClient = null;

function getOpenAIClient() {
    if (!_openaiClient && config.openaiApiKey) {
        _openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
    }
    return _openaiClient;
}

const SYSTEM_PROMPT = `Eres un asistente de ventas B2B experto por WhatsApp.
Tu objetivo es perfilar leads (empresas o profesionales) y derivarlos asertivamente a un ejecutivo de ventas humano (Agendar reunión/demo).
Debes ser conciso, profesional pero ameno (puedes usar algún emoji).
Aplica BANT de forma conversacional: averigua su dolor (problema), tiempos esperados, y si hay más decisores.
Si te preguntan precios o si son dudas muy técnicas, diles que eso lo verán en la reunión y ofréceles agendar.
Si el usuario dice "agente", "asesor" o "humano", debes escalar la conversación inmediatamente asintiendo.
Nunca des respuestas largas de más de 3-4 líneas.`;

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
            model: "gpt-4o-mini",
            messages,
            temperature: 0.5,
            max_tokens: 150
        });

        return response.choices[0].message.content || "Lo siento, tuve un problema procesando tu mensaje.";
    } catch (error) {
        console.error("Error calling OpenAI:", error);
        return "Disculpa, en este momento tengo problemas de conexión. Por favor intenta de nuevo en unos minutos.";
    }
}

module.exports = { generateReply };
