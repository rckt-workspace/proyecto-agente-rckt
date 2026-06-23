const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:latest';
const SYSTEM_PROMPT = `Eres el asistente virtual de Agrosoft CM, un Sistema Inteligente de Produccion Lechera colombiano.
Respondes preguntas sobre la plataforma, ganaderia lechera, registro de ordenos, predicciones de leche, manejo de vacas y produccion lactea.
Usas un tono cercano, claro y respetuoso, apropiado para ganaderos colombianos.
Si te preguntan por contacto humano, ofrece el numero 3153863179 y el correo jaimeandrescardonam@gmail.com.
Si te preguntan algo muy fuera del tema agropecuario, redirige amablemente hacia temas del sistema o de la finca.
Responde siempre en espanol. Maximo 3 parrafos cortos por respuesta.`;
function isAbortError(error) {
    return error instanceof Error && error.name === 'AbortError';
}
export async function askOllama(userMessage, conversationHistory = []) {
    const cleanedMessage = userMessage.trim().slice(0, 2500);
    if (!cleanedMessage) {
        return 'Cuéntame qué necesitas saber sobre Agrosoft CM o sobre tu produccion lechera.';
    }
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversationHistory.slice(-6),
        { role: 'user', content: cleanedMessage }
    ];
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
        const response = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages,
                stream: false,
                options: {
                    temperature: 0.7,
                    num_predict: 300
                }
            })
        });
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`Ollama respondio con estado ${response.status}. ${detail}`);
        }
        const data = await response.json();
        return data.message?.content?.trim() || 'No pude generar una respuesta en este momento.';
    }
    catch (error) {
        if (isAbortError(error)) {
            return 'La respuesta tardo demasiado. Intenta con una pregunta mas corta.';
        }
        console.error('Error comunicandose con Ollama:', error);
        return 'En este momento no puedo procesar tu consulta. Intenta mas tarde o escribenos a 3153863179.';
    }
    finally {
        clearTimeout(timeoutId);
    }
}
export async function checkOllamaHealth() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal });
        return res.ok;
    }
    catch {
        return false;
    }
    finally {
        clearTimeout(timeoutId);
    }
}
export async function getOllamaInfo() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal });
        if (!res.ok)
            return { online: false, model: OLLAMA_MODEL, models: [] };
        const data = await res.json();
        const models = Array.isArray(data.models)
            ? data.models.map((m) => m.name).filter(Boolean)
            : [];
        return { online: true, model: OLLAMA_MODEL, models };
    }
    catch {
        return { online: false, model: OLLAMA_MODEL, models: [] };
    }
    finally {
        clearTimeout(timeoutId);
    }
}
