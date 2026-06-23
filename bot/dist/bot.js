import whatsappWeb from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { askOllama, checkOllamaHealth } from './ollama.js';
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
let authorizedNumbers = new Set();
const conversationHistory = new Map();
const lastResponseTime = new Map();
function normalizePlainNumber(number) {
    const clean = number.replace(/\D/g, '');
    if (clean.length === 10 && clean.startsWith('3'))
        return `57${clean}`;
    return clean;
}
function normalizeNumberToWhatsAppId(number) {
    const clean = normalizePlainNumber(number.replace('@c.us', ''));
    return `${clean}@c.us`;
}
function getSenderNumber(senderId) {
    return senderId.replace('@c.us', '');
}
function loadAuthorized() {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        if (fs.existsSync(AUTHORIZED_FILE)) {
            const raw = fs.readFileSync(AUTHORIZED_FILE, 'utf-8');
            const data = JSON.parse(raw);
            const numbers = Array.isArray(data) ? data : data.numbers || [];
            authorizedNumbers = new Set(numbers.map((n) => normalizeNumberToWhatsAppId(n)));
        }
        else {
            authorizedNumbers = new Set();
        }
        authorizedNumbers.add(BOT_OWNER_ID);
        saveAuthorized();
        console.log(`Contactos autorizados cargados: ${authorizedNumbers.size}`);
    }
    catch (err) {
        console.error('Error cargando autorizados:', err);
        authorizedNumbers = new Set([BOT_OWNER_ID]);
    }
}
function saveAuthorized() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(AUTHORIZED_FILE, JSON.stringify({ numbers: Array.from(authorizedNumbers) }, null, 2));
}
export function addAuthorized(number) {
    authorizedNumbers.add(normalizeNumberToWhatsAppId(number));
    saveAuthorized();
}
export function removeAuthorized(number) {
    authorizedNumbers.delete(normalizeNumberToWhatsAppId(number));
    saveAuthorized();
}
export function getAuthorized() {
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
function updateHistory(userId, role, content) {
    if (!conversationHistory.has(userId))
        conversationHistory.set(userId, []);
    const history = conversationHistory.get(userId);
    history.push({ role, content });
    if (history.length > 6)
        history.splice(0, history.length - 6);
}
function clearHistory(userId) {
    conversationHistory.delete(userId);
}
function isGroupOrStatus(msg) {
    return msg.from === 'status@broadcast' || msg.from.endsWith('@g.us');
}
function isAuthorized(senderId) {
    return !BOT_REQUIRE_AUTH || senderId === BOT_OWNER_ID || authorizedNumbers.has(senderId);
}
function removeStaleChromiumLocks(dir) {
    if (!fs.existsSync(dir))
        return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            removeStaleChromiumLocks(fullPath);
            continue;
        }
        if (['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'DevToolsActivePort'].includes(entry.name)) {
            try {
                fs.rmSync(fullPath, { force: true });
                console.log(`Lock viejo de Chromium removido: ${fullPath}`);
            }
            catch (error) {
                console.warn(`No se pudo remover lock de Chromium: ${fullPath}`, error);
            }
        }
    }
}
async function handleOwnerCommand(msg, body) {
    if (msg.from !== BOT_OWNER_ID || !body.startsWith('!'))
        return false;
    const [command, ...args] = body.split(/\s+/);
    const value = args.join(' ').trim();
    if (command === '!status') {
        const ollamaOk = await checkOllamaHealth();
        await msg.reply([
            'Estado del bot Agrosoft CM:',
            `WhatsApp: conectado`,
            `Ollama: ${ollamaOk ? 'online' : 'offline'}`,
            `Modo autorizacion: ${BOT_REQUIRE_AUTH ? 'solo autorizados' : 'publico'}`,
            `Contactos autorizados: ${authorizedNumbers.size}`
        ].join('\n'));
        return true;
    }
    if (command === '!autorizar' && value) {
        addAuthorized(value);
        await msg.reply(`Contacto autorizado: ${normalizeNumberToWhatsAppId(value)}`);
        return true;
    }
    if (command === '!quitar' && value) {
        removeAuthorized(value);
        await msg.reply(`Contacto removido: ${normalizeNumberToWhatsAppId(value)}`);
        return true;
    }
    if (command === '!contactos') {
        await msg.reply(`Contactos autorizados:\n${getAuthorized().join('\n') || 'Sin contactos'}`);
        return true;
    }
    if (command === '!limpiar') {
        clearHistory(msg.from);
        await msg.reply('Historial de esta conversacion limpiado.');
        return true;
    }
    if (command === '!ayuda') {
        await msg.reply('Comandos: !status, !autorizar NUMERO, !quitar NUMERO, !contactos, !limpiar');
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
export function initBot(onQR, onReady, onMessage, onStatus) {
    loadAuthorized();
    client.on('qr', (qr) => {
        qrcode.generate(qr, { small: true });
        console.log('Escanea el QR para conectar WhatsApp.');
        onStatus?.('qr');
        onQR(qr);
    });
    client.on('ready', async () => {
        console.log(`Bot WhatsApp conectado. Numero publico esperado: ${BOT_PUBLIC_NUMBER}`);
        const ollamaOk = await checkOllamaHealth();
        console.log(`Ollama: ${ollamaOk ? 'disponible' : 'no disponible'}`);
        onStatus?.('ready');
        onReady();
    });
    client.on('auth_failure', (message) => {
        console.error('Fallo autenticando WhatsApp:', message);
        onStatus?.('auth_failure', message);
    });
    client.on('disconnected', (reason) => {
        console.warn('WhatsApp desconectado:', reason);
        onStatus?.('disconnected', reason);
    });
    client.on('message', async (msg) => {
        if (isGroupOrStatus(msg) || msg.fromMe)
            return;
        const senderId = msg.from;
        const body = msg.body?.trim();
        if (!body)
            return;
        if (await handleOwnerCommand(msg, body))
            return;
        if (!isAuthorized(senderId)) {
            console.log(`Mensaje ignorado de no autorizado: ${senderId}`);
            return;
        }
        const now = Date.now();
        const lastTime = lastResponseTime.get(senderId) || 0;
        if (now - lastTime < COOLDOWN_MS)
            return;
        lastResponseTime.set(senderId, now);
        console.log(`Mensaje de ${getSenderNumber(senderId)}: ${body.slice(0, 80)}`);
        try {
            const history = conversationHistory.get(senderId) || [];
            const response = await askOllama(body, history);
            updateHistory(senderId, 'user', body);
            updateHistory(senderId, 'assistant', response);
            await msg.reply(response);
            onMessage(senderId, body, response);
        }
        catch (error) {
            console.error('Error procesando mensaje:', error);
            await msg.reply('Ocurrio un error procesando tu mensaje. Intenta de nuevo en un momento.');
        }
    });
    removeStaleChromiumLocks(SESSION_DIR);
    client.initialize().catch((error) => {
        console.error('Error iniciando cliente WhatsApp:', error);
        onStatus?.('auth_failure', error instanceof Error ? error.message : 'Error iniciando WhatsApp');
    });
}
