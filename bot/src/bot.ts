import whatsappWeb from 'whatsapp-web.js';
import type { Message } from 'whatsapp-web.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { askOllama, checkOllamaHealth, ChatMessage } from './ollama.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BOT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(process.env.BOT_DATA_DIR || path.join(BOT_ROOT, 'data'));
const AUTHORIZED_FILE = path.join(DATA_DIR, 'authorized.json');
const SESSION_DIR = path.resolve(process.env.WA_SESSION_DIR || path.join(BOT_ROOT, 'bot-session'));
const COOLDOWN_MS = Number(process.env.COOLDOWN_MS || 2000);
const BOT_REQUIRE_AUTH = String(process.env.BOT_REQUIRE_AUTH || 'false').toLowerCase() === 'true';
const BOT_OWNER_ID = normalizeNumberToWhatsAppId(process.env.BOT_OWNER_NUMBER || '573153863179');
const BOT_PUBLIC_NUMBER = normalizePlainNumber(process.env.BOT_PUBLIC_NUMBER || '573153863179');

const { Client, LocalAuth } = whatsappWeb;
const PUPPETEER_EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;

let authorizedNumbers: Set<string> = new Set();
const conversationHistory = new Map<string, ChatMessage[]>();
const lastResponseTime = new Map<string, number>();

function normalizePlainNumber(number: string): string {
  const clean = number.replace(/\D/g, '');
  if (clean.length === 10 && clean.startsWith('3')) return `57${clean}`;
  return clean;
}

function normalizeNumberToWhatsAppId(number: string): string {
  const clean = normalizePlainNumber(number.replace('@c.us', ''));
  return `${clean}@c.us`;
}

function getSenderNumber(senderId: string): string {
  return senderId.replace('@c.us', '');
}

function loadAuthorized(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(AUTHORIZED_FILE)) {
      const raw = fs.readFileSync(AUTHORIZED_FILE, 'utf-8');
      const data = JSON.parse(raw);
      const numbers = Array.isArray(data) ? data : data.numbers || [];
      authorizedNumbers = new Set(numbers.map((n: string) => normalizeNumberToWhatsAppId(n)));
    } else {
      authorizedNumbers = new Set();
    }
    authorizedNumbers.add(BOT_OWNER_ID);
    saveAuthorized();
    console.log(`[Bot] Contactos autorizados cargados: ${authorizedNumbers.size}`);
  } catch (err) {
    console.error('[Bot] Error cargando autorizados:', err);
    authorizedNumbers = new Set([BOT_OWNER_ID]);
  }
}

function saveAuthorized(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    AUTHORIZED_FILE,
    JSON.stringify({ numbers: Array.from(authorizedNumbers) }, null, 2)
  );
}

export function addAuthorized(number: string): void {
  authorizedNumbers.add(normalizeNumberToWhatsAppId(number));
  saveAuthorized();
}

export function removeAuthorized(number: string): void {
  authorizedNumbers.delete(normalizeNumberToWhatsAppId(number));
  saveAuthorized();
}

export function getAuthorized(): string[] {
  return Array.from(authorizedNumbers);
}

export function getBotConfig() {
  return {
    requireAuth: BOT_REQUIRE_AUTH,
    owner: BOT_OWNER_ID,
    publicNumber: BOT_PUBLIC_NUMBER,
    cooldownMs: COOLDOWN_MS
  };
}

function updateHistory(userId: string, role: 'user' | 'assistant', content: string): void {
  if (!conversationHistory.has(userId)) conversationHistory.set(userId, []);
  const history = conversationHistory.get(userId)!;
  history.push({ role, content });
  if (history.length > 6) history.splice(0, history.length - 6);
}

function clearHistory(userId: string): void {
  conversationHistory.delete(userId);
}

function isGroupOrStatus(msg: Message): boolean {
  return msg.from === 'status@broadcast' || msg.from.endsWith('@g.us');
}

function isAuthorized(senderId: string): boolean {
  return !BOT_REQUIRE_AUTH || senderId === BOT_OWNER_ID || authorizedNumbers.has(senderId);
}

function removeStaleChromiumLocks(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeStaleChromiumLocks(fullPath);
      continue;
    }
    if (['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'DevToolsActivePort'].includes(entry.name)) {
      try {
        fs.rmSync(fullPath, { force: true });
        console.log(`[Bot] Lock de Chromium removido: ${fullPath}`);
      } catch (error) {
        console.warn(`[Bot] No se pudo remover lock: ${fullPath}`, error);
      }
    }
  }
}

async function handleOwnerCommand(msg: Message, body: string): Promise<boolean> {
  if (msg.from !== BOT_OWNER_ID || !body.startsWith('!')) return false;
  const [command, ...args] = body.split(/\s+/);
  const value = args.join(' ').trim();
  if (command === '!status') {
    const ollamaOk = await checkOllamaHealth();
    await msg.reply([
      '📊 Estado del bot Agrosoft CM:',
      `✅ WhatsApp: conectado`,
      `${ollamaOk ? '✅' : '❌'} Ollama: ${ollamaOk ? 'online' : 'offline'}`,
      `🔒 Modo: ${BOT_REQUIRE_AUTH ? 'solo autorizados' : 'público'}`,
      `👥 Autorizados: ${authorizedNumbers.size}`
    ].join('\n'));
    return true;
  }
  if (command === '!autorizar' && value) {
    addAuthorized(value);
    await msg.reply(`✅ Autorizado: ${normalizeNumberToWhatsAppId(value)}`);
    return true;
  }
  if (command === '!quitar' && value) {
    removeAuthorized(value);
    await msg.reply(`🗑️ Removido: ${normalizeNumberToWhatsAppId(value)}`);
    return true;
  }
  if (command === '!contactos') {
    await msg.reply(`👥 Autorizados:\n${getAuthorized().join('\n') || 'Sin contactos'}`);
    return true;
  }
  if (command === '!limpiar') {
    clearHistory(msg.from);
    await msg.reply('🗑️ Historial limpiado.');
    return true;
  }
  if (command === '!ayuda') {
    await msg.reply('📋 Comandos:\n!status\n!autorizar NUMERO\n!quitar NUMERO\n!contactos\n!limpiar');
    return true;
  }
  return false;
}

export const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
  puppeteer: {
    headless: true,
    executablePath: PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote'
    ]
  }
});

export function initBot(
  onQR: (qr: string) => void,
  onReady: () => void,
  onMessage: (from: string, body: string, response: string) => void,
  onStatus?: (status: string, detail?: string) => void
): void {
  loadAuthorized();

  // ── QR: SOLO texto en consola, imagen disponible en el panel web ──
  client.on('qr', (qr) => {
    console.log('[Bot] ══════════════════════════════════════════════════');
    console.log('[Bot] 📱 QR listo — ábrelo en el navegador para escanearlo:');
    console.log('[Bot] ➜  http://localhost:3001/panel');
    console.log('[Bot] ══════════════════════════════════════════════════');
    onStatus?.('qr');
    onQR(qr); // el QR string se envía al servidor para mostrarlo como imagen en el panel
  });

  client.on('ready', async () => {
    console.log(`[Bot] ✅ WhatsApp conectado. Número: ${BOT_PUBLIC_NUMBER}`);
    const ollamaOk = await checkOllamaHealth();
    console.log(`[Bot] Ollama: ${ollamaOk ? 'disponible ✅' : 'no disponible ❌'}`);
    onStatus?.('ready');
    onReady();
  });

  client.on('auth_failure', (message) => {
    console.error('[Bot] ❌ Falló autenticando WhatsApp:', message);
    onStatus?.('auth_failure', message);
  });

  client.on('disconnected', (reason) => {
    console.warn('[Bot] ⚠️ WhatsApp desconectado:', reason);
    onStatus?.('disconnected', reason);
  });

  client.on('message', async (msg: Message) => {
    // Ignorar grupos y estados
    if (isGroupOrStatus(msg)) return;

    // Manejar mensajes propios (chat "Yo (Tú)") para pruebas del owner
    if (msg.fromMe) {
      // Si tiene cita es una respuesta del bot → ignorar para evitar bucle infinito
      if (msg.hasQuotedMsg) return;
      // Solo procesar si el owner se está escribiendo a sí mismo
      if (msg.to !== BOT_OWNER_ID) return;
    }

    const senderId = msg.fromMe ? BOT_OWNER_ID : msg.from;
    const body = msg.body?.trim();
    if (!body) return;

    // Comandos especiales del owner
    if (await handleOwnerCommand(msg, body)) return;

    // Verificar autorización
    if (!isAuthorized(senderId)) {
      console.log(`[Bot] No autorizado: ${senderId}`);
      return;
    }

    // Cooldown anti-spam
    const now = Date.now();
    const lastTime = lastResponseTime.get(senderId) || 0;
    if (now - lastTime < COOLDOWN_MS) return;
    lastResponseTime.set(senderId, now);

    console.log(`[Bot] 💬 Mensaje de ${getSenderNumber(senderId)}: ${body.slice(0, 80)}`);

    try {
      // Mostrar "escribiendo..." mientras Ollama genera la respuesta
      const chat = await msg.getChat();
      await chat.sendStateTyping();

      const history = conversationHistory.get(senderId) || [];
      const response = await askOllama(body, history);

      updateHistory(senderId, 'user', body);
      updateHistory(senderId, 'assistant', response);

      await chat.clearState();
      await msg.reply(response);
      onMessage(senderId, body, response);

    } catch (error) {
      console.error('[Bot] Error procesando mensaje:', error);
      try {
        const chat = await msg.getChat();
        await chat.clearState();
      } catch { /* ignorar */ }
      await msg.reply('Ocurrió un error. Intenta de nuevo en un momento. 🙏');
    }
  });

  removeStaleChromiumLocks(SESSION_DIR);

  client.initialize().catch((error: unknown) => {
    console.error('[Bot] Error iniciando WhatsApp:', error);
    onStatus?.('auth_failure', error instanceof Error ? error.message : 'Error iniciando WhatsApp');
  });
}