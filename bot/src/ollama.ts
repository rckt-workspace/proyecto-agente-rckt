import 'dotenv/config';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURACIÓN
// En Docker usa el nombre del servicio: OLLAMA_URL=http://ollama:11434
// En local usa: OLLAMA_URL=http://localhost:11434
// ─────────────────────────────────────────────────────────────────────────────
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://ollama:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:latest';

// ─────────────────────────────────────────────────────────────────────────────
// CORPUS / SYSTEM PROMPT — Información real de Agrosoft CM
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres el asistente virtual de Agrosoft CM, un Sistema Inteligente de Producción Lechera colombiano, desarrollado en el Valle del Cauca, Colombia.

=== QUÉ ES AGROSOFT CM ===
Plataforma web y móvil para ganaderos lecheros colombianos que combina registro digital, análisis histórico e inteligencia artificial para optimizar la producción láctea de cada finca. Permite tomar decisiones basadas en datos reales desde el celular.

=== FUNCIONES PRINCIPALES ===
- Registro digital de ordeños por vaca y por sesión (mañana/tarde/noche)
- Predicción de producción diaria por vaca usando modelos de Machine Learning (Random Forest y otros)
- Dashboard en tiempo real con gráficas de producción vs objetivo
- Tareas diarias automáticas: registrar ordeño, generar predicción, validar predicción
- Gestión multi-finca: maneja varias fincas desde una sola cuenta
- Alertas de vacas con baja producción o datos faltantes
- Historial de 7 días y tendencias de producción
- Funciona offline: guarda datos sin conexión y sincroniza cuando vuelve la señal

=== TECNOLOGÍA ===
- Frontend: React + TypeScript + Tailwind CSS + Ionic (móvil)
- Base de datos: Supabase (PostgreSQL en la nube, cifrado en tránsito y en reposo)
- Motor IA: Python + FastAPI con modelos Random Forest y ML para predicciones
- Sin límite de vacas registradas
- Los datos son privados y nunca se comparten con terceros

=== CÓMO FUNCIONA LA IA ===
El sistema analiza el historial de producción de cada vaca, su estado de salud, ciclo reproductivo y prácticas de manejo para proyectar su producción futura. Se entrenan 6 modelos ML por finca. El backend Python corre en FastAPI y expone endpoints de predicción en tiempo real.

=== EQUIPO ===
- Jaime Andrés Cardona Montero: Fundador y desarrollador Full Stack, Ingeniero de Sistemas con orientación en IA y ML
- María Maura Montero: Gerente emprendedora, Contadora con experiencia en empresas agropecuarias
- Jaime Luis Cardona: Asesor financiero, Contador público de la DIAN
- Don Fernando: Operador de campo con más de 20 años de experiencia ganadera en la región

=== HISTORIA ===
- 2023: Nace la idea al detectar la falta de tecnología en la finca familiar
- 2024: Primer MVP con registro de ordeños e integración Supabase
- 2025: Se integran modelos predictivos de IA por vaca
- 2026: Expansión regional y alianzas con cooperativas lecheras

=== IMPACTO ===
- 3+ años de desarrollo
- 50+ vacas monitoreadas
- 2.000+ registros de ordeño
- 500+ predicciones generadas

=== PROBLEMAS QUE RESUELVE ===
- El 78% de ganaderos colombianos registra producción en papel o de memoria → pérdida de datos e imposibilidad de análisis
- Sin historial no se sabe qué vaca produce más ni cuándo baja su producción
- Pérdidas de hasta 20% de producción potencial por falta de predicción y planificación
- Decisiones basadas en intuición en vez de datos

=== PRECIOS Y ACCESO ===
El acceso se gestiona directamente con el equipo. No hay costos ocultos. Se ofrece acompañamiento personalizado en la implementación. Para solicitar acceso escribe por WhatsApp.

=== PREGUNTAS FRECUENTES ===
- ¿Se necesitan conocimientos de tecnología? No, si sabes usar WhatsApp puedes usar la plataforma.
- ¿Funciona sin internet? Sí, modo offline con sincronización automática al recuperar señal.
- ¿Cuántas vacas puedo registrar? Sin límite, desde 5 hasta cientos de cabezas.
- ¿Mis datos están seguros? Sí, Supabase con cifrado total y control total del usuario sobre sus datos.
- ¿Puedo gestionar varias fincas? Sí, multi-finca desde una sola cuenta.

=== CONTACTO ===
- WhatsApp: 3153863179 (Colombia)
- Correo: jaimeandrescardonam@gmail.com
- Ubicación: Valle del Cauca, Colombia 🇨🇴
- Atención: Lunes a Sábado, 7am a 7pm

=== INSTRUCCIONES DE COMPORTAMIENTO ===
- Usa un tono cercano, cálido y respetuoso, apropiado para ganaderos colombianos.
- Si preguntan por precio o acceso, indícales que escriban al WhatsApp 3153863179.
- Si preguntan algo muy ajeno al agro o al sistema, redirige amablemente hacia los temas de Agrosoft CM o ganadería.
- Responde SIEMPRE en español colombiano.
- Máximo 3 párrafos cortos por respuesta.
- Usa emojis ocasionalmente para que sea más amigable 🐄🥛.
- Si el usuario saluda, responde con entusiasmo y pregunta en qué puedes ayudarle.`;

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL: Consultar Ollama
// ─────────────────────────────────────────────────────────────────────────────
export async function askOllama(
  userMessage: string,
  conversationHistory: ChatMessage[] = []
): Promise<string> {
  const cleanedMessage = userMessage.trim().slice(0, 2500);

  if (!cleanedMessage) {
    return 'Cuéntame qué necesitas saber sobre Agrosoft CM o sobre tu producción lechera. 🐄';
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory.slice(-6),
    { role: 'user', content: cleanedMessage }
  ];

  const controller = new AbortController();
 const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    console.log(`[Ollama] Enviando a ${OLLAMA_URL} con modelo ${OLLAMA_MODEL}`);

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
          num_predict: 150,      // ANTES: 350 — reducir tokens generados
          num_ctx: 1024,         // Limitar contexto para que sea más rápido
          num_thread: 4          // Usar todos los núcleos disponibles
  }
})
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Ollama respondió con estado ${response.status}. ${detail}`);
    }

    const data = await response.json();
    const reply = data.message?.content?.trim();

    if (!reply) {
      return 'No pude generar una respuesta en este momento. Intenta de nuevo. 🙏';
    }

    console.log(`[Ollama] Respuesta generada: ${reply.slice(0, 80)}...`);
    return reply;

  } catch (error) {
    if (isAbortError(error)) {
      return 'La respuesta tardó demasiado. Intenta con una pregunta más corta. ⏱️';
    }
    console.error('[Ollama] Error comunicándose:', error);
    return 'En este momento no puedo procesar tu consulta. Puedes escribirnos directamente al 3153863179. 📞';
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────────────────────────────────────
export async function checkOllamaHealth(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    console.log(`[Ollama] Health check en ${OLLAMA_URL}/api/tags`);
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal });
    const ok = res.ok;
    console.log(`[Ollama] Health: ${ok ? 'online ✅' : 'offline ❌'}`);
    return ok;
  } catch (err) {
    console.error(`[Ollama] Health check falló:`, err);
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INFO COMPLETA DE OLLAMA
// ─────────────────────────────────────────────────────────────────────────────
export async function getOllamaInfo(): Promise<{
  online: boolean;
  model: string;
  models: string[];
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: controller.signal });
    if (!res.ok) return { online: false, model: OLLAMA_MODEL, models: [] };

    const data = await res.json();
    const models: string[] = Array.isArray(data.models)
      ? data.models.map((m: { name: string }) => m.name).filter(Boolean)
      : [];

    console.log(`[Ollama] Modelos instalados: ${models.join(', ') || 'ninguno'}`);
    return { online: true, model: OLLAMA_MODEL, models };
  } catch {
    return { online: false, model: OLLAMA_MODEL, models: [] };
  } finally {
    clearTimeout(timeoutId);
  }
}