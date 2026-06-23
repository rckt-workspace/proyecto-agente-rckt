import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import axios from 'axios';
import QRCode from 'qrcode';
import whatsappWeb from 'whatsapp-web.js';
import type { Message } from 'whatsapp-web.js';
import * as fs from 'fs';
import * as path from 'path';

const { Client, LocalAuth } = whatsappWeb;

const BACKEND_URL = (process.env.BACKEND_URL || 'http://backend:8000').replace(/\/$/, '');
const SESSION_DIR = process.env.WA_SESSION_DIR || './session';
const PORT = Number(process.env.WA_BRIDGE_PORT || 3001);
const PUPPETEER_PATH = process.env.PUPPETEER_EXECUTABLE_PATH;

const app = express();
const httpServer = createServer(app);
const io = new SocketIO(httpServer, { cors: { origin: '*' } });
app.use(express.json({ limit: '2mb' }));

let botStatus: 'disconnected' | 'qr' | 'ready' | 'auth_failure' = 'disconnected';
let currentQR = '';

// ─── Cliente WhatsApp ─────────────────────────────────────────────────────────
function cleanLocks(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { cleanLocks(full); continue; }
    if (['SingletonLock', 'SingletonSocket', 'SingletonCookie'].includes(entry.name)) {
      try { fs.rmSync(full, { force: true }); } catch {}
    }
  }
}

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
  puppeteer: {
    headless: true,
    executablePath: PUPPETEER_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'],
  },
});

client.on('qr', async (qr) => {
  currentQR = qr;
  botStatus = 'qr';
  io.emit('qr', qr);
  io.emit('status', { bot: botStatus });
  console.log('[Bridge] QR listo — panel: http://localhost:' + PORT + '/panel');
});

client.on('ready', () => {
  currentQR = '';
  botStatus = 'ready';
  io.emit('status', { bot: botStatus });
  console.log('[Bridge] WhatsApp conectado ✅');
});

client.on('auth_failure', (msg) => {
  botStatus = 'auth_failure';
  io.emit('status', { bot: botStatus });
  console.error('[Bridge] Auth failure:', msg);
});

client.on('disconnected', (reason) => {
  botStatus = 'disconnected';
  io.emit('status', { bot: botStatus });
  console.warn('[Bridge] Desconectado:', reason);
});

client.on('message', async (msg: Message) => {
  if (msg.from === 'status@broadcast' || msg.from.endsWith('@g.us')) return;
  if (msg.hasQuotedMsg) return;

  const body = msg.body?.trim();
  if (!body) return;

  const from = msg.fromMe ? msg.to : msg.from;
  console.log(`[Bridge] Mensaje de ${from.replace('@c.us', '')}: ${body.slice(0, 80)}`);

  try {
    const { data } = await axios.post(`${BACKEND_URL}/channels/whatsapp/message`, {
      from: from.replace('@c.us', ''),
      body,
      timestamp: new Date().toISOString(),
    }, { timeout: 35000 });

    if (data?.reply) {
      await msg.reply(data.reply);
    }
  } catch (err: any) {
    console.error('[Bridge] Error enviando al backend:', err.message);
  }
});

// ─── API del bridge ───────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.json({ service: 'WA Bridge', status: botStatus }));

app.get('/status', (_req, res) => res.json({ bot: botStatus, status: botStatus }));

app.get('/qr-image', async (_req, res) => {
  if (!currentQR) return res.json({ image: '', qr: '', status: botStatus });
  const image = await QRCode.toDataURL(currentQR, { width: 320, margin: 1 });
  res.json({ image, qr: currentQR, status: botStatus });
});

app.post('/send', async (req, res) => {
  const { to, message } = req.body as { to?: string; message?: string };
  if (!to || !message) return res.status(400).json({ error: 'to y message requeridos' });
  if (botStatus !== 'ready') return res.status(409).json({ error: 'WhatsApp no conectado' });

  const clean = to.replace(/\D/g, '');
  const number = clean.length === 10 && clean.startsWith('3') ? `57${clean}` : clean;
  try {
    await client.sendMessage(`${number}@c.us`, message);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Panel HTML mínimo ────────────────────────────────────────────────────────
app.get('/panel', (_req, res) => {
  res.type('html').send(`<!doctype html><html lang="es"><head>
<meta charset="utf-8"><title>WA Bridge — Elite Beauty</title>
<style>body{font-family:sans-serif;background:#fff0f5;display:flex;flex-direction:column;align-items:center;padding:40px}
h1{color:#9d174d}#qr{margin:20px}img{border:4px solid #f9a8d4;border-radius:12px}
.status{font-size:1.2rem;font-weight:700;margin-top:16px}</style></head>
<body><h1>Elite Beauty — WhatsApp QR</h1>
<div class="status" id="st">Conectando...</div>
<div id="qr"></div>
<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
socket.on('qr', () => fetch('/qr-image').then(r=>r.json()).then(d=>{
  document.getElementById('st').textContent = 'Escanea el QR';
  document.getElementById('qr').innerHTML = d.image ? '<img src="'+d.image+'" width="260"/>' : '';
}));
socket.on('status', d=>{
  const s = d.bot;
  document.getElementById('st').textContent = s==='ready'?'✅ Conectado':s==='qr'?'📱 Escanea el QR':'⏳ '+s;
  if(s==='ready') document.getElementById('qr').innerHTML='<p style="color:#16a34a;font-size:1.5rem">✅ WhatsApp conectado</p>';
});
fetch('/qr-image').then(r=>r.json()).then(d=>{
  if(d.image) document.getElementById('qr').innerHTML='<img src="'+d.image+'" width="260"/>';
  document.getElementById('st').textContent = d.status==='ready'?'✅ Conectado':'📱 Escanea el QR';
});
</script></body></html>`);
});

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  socket.emit('status', { bot: botStatus });
  if (currentQR) socket.emit('qr', currentQR);
});

// ─── Arranque ─────────────────────────────────────────────────────────────────
cleanLocks(SESSION_DIR);
client.initialize().catch((e: unknown) => console.error('[Bridge] Error init:', e));

httpServer.listen(PORT, () => {
  console.log(`[Bridge] Corriendo en http://localhost:${PORT}`);
  console.log(`[Bridge] Panel QR: http://localhost:${PORT}/panel`);
});
