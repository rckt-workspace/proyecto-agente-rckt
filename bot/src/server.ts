import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import QRCode from 'qrcode';
import {
  initBot,
  addAuthorized,
  removeAuthorized,
  getAuthorized,
  getBotConfig,
  client
} from './bot.js';
import { askOllama, checkOllamaHealth, getOllamaInfo } from './ollama.js';

const app = express();
const httpServer = createServer(app);
const io = new SocketIO(httpServer, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ─────────────────────────────────────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────────────────────────────────────
let botStatus: 'disconnected' | 'qr' | 'ready' | 'auth_failure' = 'disconnected';
let currentQR = '';
const recentMessages: Array<{
  from: string;
  body: string;
  response: string;
  timestamp: string;
}> = [];

function rememberMessage(from: string, body: string, response: string) {
  recentMessages.unshift({ from, body, response, timestamp: new Date().toISOString() });
  if (recentMessages.length > 50) recentMessages.pop();
}

async function buildQrPayload() {
  if (!currentQR) return { qr: '', image: '', bot: botStatus };
  const image = await QRCode.toDataURL(currentQR, { width: 320, margin: 1 });
  return { qr: currentQR, image, bot: botStatus };
}

// ─────────────────────────────────────────────────────────────────────────────
// PANEL HTML
// ─────────────────────────────────────────────────────────────────────────────
function renderPanelHtml() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agrosoft CM Bot — Panel</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0fdf4; color: #111827; min-height: 100vh; }
    header { background: #15803d; color: white; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
    header h1 { font-size: 1.2rem; font-weight: 700; }
    header span { font-size: 0.8rem; opacity: 0.8; }
    main { max-width: 960px; margin: 0 auto; padding: 24px 16px; display: grid; gap: 20px; }
    .card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
    .card h2 { font-size: 1rem; font-weight: 700; margin-bottom: 14px; color: #374151; }
    .top { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
    .badge { border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
    .badge-blue    { background: #dbeafe; color: #1d4ed8; }
    .badge-green   { background: #dcfce7; color: #15803d; }
    .badge-red     { background: #fee2e2; color: #dc2626; }
    .badge-yellow  { background: #fef9c3; color: #a16207; }
    .badge-gray    { background: #f3f4f6; color: #374151; }
    .grid2 { display: grid; grid-template-columns: minmax(180px, 280px) 1fr; gap: 20px; align-items: start; }
    .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .stat { background: #f9fafb; border-radius: 8px; padding: 12px 16px; }
    .stat .label { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; }
    .stat .value { font-size: 1.4rem; font-weight: 800; color: #111827; margin-top: 4px; }
    img.qr { width: 100%; max-width: 260px; border: 2px solid #d1fae5; border-radius: 10px; }
    button { border: 0; border-radius: 8px; padding: 9px 16px; font-weight: 700; cursor: pointer; font-size: 13px; transition: opacity .15s; }
    button:hover { opacity: .85; }
    .btn-green  { background: #16a34a; color: white; }
    .btn-gray   { background: #e5e7eb; color: #374151; }
    input, select { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 12px; font-size: 13px; flex: 1; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    pre { background: #111827; color: #d1fae5; padding: 14px; border-radius: 8px; overflow: auto; font-size: 11px; max-height: 220px; white-space: pre-wrap; word-break: break-word; }
    .msg-item { background: #f0fdf4; border-left: 3px solid #16a34a; padding: 8px 12px; border-radius: 0 6px 6px 0; margin-bottom: 8px; font-size: 12px; }
    .msg-item .from { font-weight: 700; color: #15803d; }
    .msg-item .time { color: #9ca3af; float: right; }
    .msg-item .body { color: #374151; margin-top: 2px; }
    .msg-item .reply { color: #6b7280; font-style: italic; margin-top: 4px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .dot-green  { background: #22c55e; }
    .dot-red    { background: #ef4444; }
    .dot-yellow { background: #eab308; animation: pulse 1s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
    @media (max-width: 640px) { .grid2 { grid-template-columns: 1fr; } .grid3 { grid-template-columns: 1fr 1fr; } }
  </style>
</head>
<body>
  <header>
    <span style="font-size:1.6rem">🐄</span>
    <div>
      <h1>Agrosoft CM — Panel del Bot</h1>
      <span>WhatsApp Bot + Ollama IA · Valle del Cauca, Colombia</span>
    </div>
    <div style="margin-left:auto" id="headerStatus"></div>
  </header>

  <main>
    <!-- Estado general -->
    <div class="card">
      <div class="top">
        <h2>Estado del sistema</h2>
        <button class="btn-gray" onclick="refresh()">🔄 Actualizar</button>
      </div>
      <div class="grid3">
        <div class="stat">
          <div class="label">Bot WhatsApp</div>
          <div class="value" id="botStatus">—</div>
        </div>
        <div class="stat">
          <div class="label">Ollama IA</div>
          <div class="value" id="ollamaStatus">—</div>
        </div>
        <div class="stat">
          <div class="label">Modelo activo</div>
          <div class="value" id="ollamaModel" style="font-size:.9rem;margin-top:6px">—</div>
        </div>
        <div class="stat">
          <div class="label">Contactos auth.</div>
          <div class="value" id="authCount">—</div>
        </div>
        <div class="stat">
          <div class="label">Mensajes recientes</div>
          <div class="value" id="msgCount">—</div>
        </div>
        <div class="stat">
          <div class="label">URL API</div>
          <div class="value" style="font-size:.75rem;margin-top:6px"><code id="base">—</code></div>
        </div>
      </div>
    </div>

    <!-- QR + Modelos -->
    <div class="grid2">
      <div class="card">
        <h2>📱 Conexión WhatsApp</h2>
        <div id="qrBox" style="text-align:center;padding:10px 0"><p style="color:#6b7280">Esperando QR...</p></div>
        <p style="font-size:11px;color:#9ca3af;margin-top:8px;text-align:center">
          Escanea con el número <strong>3153863179</strong>
        </p>
      </div>
      <div class="card">
        <h2>🤖 Modelos Ollama</h2>
        <ul id="modelList" style="list-style:none;font-size:13px;color:#374151;line-height:2"></ul>
        <div style="margin-top:12px">
          <h2 style="margin-bottom:8px">🧪 Probar IA</h2>
          <div class="row">
            <input id="testMsg" type="text" placeholder="Escribe un mensaje de prueba..." />
            <button class="btn-green" onclick="testOllama()">Enviar</button>
          </div>
          <pre id="testResult" style="margin-top:10px;min-height:48px"></pre>
        </div>
      </div>
    </div>

    <!-- Contactos -->
    <div class="card">
      <h2>👥 Contactos autorizados</h2>
      <div class="row" style="margin-bottom:12px">
        <input id="newNumber" type="text" placeholder="Número (ej: 3001234567)" />
        <button class="btn-green" onclick="addContact()">+ Autorizar</button>
      </div>
      <ul id="contactList" style="list-style:none;font-size:13px;line-height:2.2"></ul>
    </div>

    <!-- Mensajes recientes -->
    <div class="card">
      <h2>💬 Últimos mensajes</h2>
      <div id="messageList"></div>
    </div>
  </main>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const BASE = location.pathname.startsWith('/bot-api/') ? '/bot-api' : '';
    document.getElementById('base').textContent = window.location.origin + (BASE || '/');
    const socket = io({ path: '/socket.io/' });

    function statusBadge(s) {
      const map = {
        ready:        '<span class="badge badge-green"><span class="dot dot-green"></span>Conectado</span>',
        qr:           '<span class="badge badge-yellow"><span class="dot dot-yellow"></span>Esperando QR</span>',
        disconnected: '<span class="badge badge-red"><span class="dot dot-red"></span>Desconectado</span>',
        auth_failure: '<span class="badge badge-red">Error de auth</span>',
      };
      return map[s] || '<span class="badge badge-gray">' + s + '</span>';
    }

    async function refresh() {
      try {
        const status = await fetch(BASE + '/api/status').then(r => r.json());
        document.getElementById('botStatus').innerHTML  = statusBadge(status.bot);
        document.getElementById('headerStatus').innerHTML = statusBadge(status.bot);
        document.getElementById('ollamaStatus').innerHTML = status.ollama === 'online'
          ? '<span class="badge badge-green">Online ✅</span>'
          : '<span class="badge badge-red">Offline ❌</span>';
        document.getElementById('ollamaModel').textContent = status.ollamaModel || '—';
        document.getElementById('authCount').textContent = status.authorizedCount;
        document.getElementById('msgCount').textContent = status.messageCount ?? '—';

        // Modelos
        const list = document.getElementById('modelList');
        list.innerHTML = '';
        (status.installedModels || []).forEach(m => {
          list.innerHTML += '<li>🟢 ' + m + '</li>';
        });
        if (!status.installedModels?.length) list.innerHTML = '<li style="color:#9ca3af">Sin modelos instalados</li>';

        // QR
        const qr = await fetch(BASE + '/api/qr-image').then(r => r.json());
        const qrBox = document.getElementById('qrBox');
        if (qr.image) {
          qrBox.innerHTML = '<img class="qr" alt="QR WhatsApp" src="' + qr.image + '" />';
        } else {
          qrBox.innerHTML = '<p style="color:#22c55e;font-weight:700">✅ WhatsApp conectado</p>';
        }

        // Mensajes
        const msgs = await fetch(BASE + '/api/messages').then(r => r.json());
        document.getElementById('msgCount').textContent = msgs.messages?.length ?? 0;
        const ml = document.getElementById('messageList');
        ml.innerHTML = '';
        (msgs.messages || []).slice(0, 10).forEach(m => {
          const d = new Date(m.timestamp).toLocaleString('es-CO', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'short' });
          ml.innerHTML += \`<div class="msg-item">
            <span class="from">\${m.from.replace('@c.us','')}</span>
            <span class="time">\${d}</span>
            <div class="body">📩 \${m.body}</div>
            <div class="reply">🤖 \${m.response}</div>
          </div>\`;
        });
        if (!msgs.messages?.length) ml.innerHTML = '<p style="color:#9ca3af;font-size:13px">Sin mensajes aún</p>';

        // Contactos
        const contacts = await fetch(BASE + '/api/contacts').then(r => r.json());
        const cl = document.getElementById('contactList');
        cl.innerHTML = '';
        (contacts.contacts || []).forEach(c => {
          cl.innerHTML += \`<li>📞 \${c} <button class="btn-gray" style="padding:2px 8px;font-size:11px;margin-left:8px" onclick="removeContact('\${c}')">Quitar</button></li>\`;
        });
        if (!contacts.contacts?.length) cl.innerHTML = '<li style="color:#9ca3af">Sin contactos autorizados</li>';

      } catch (err) {
        console.error('Error en refresh:', err);
      }
    }

    async function addContact() {
      const n = document.getElementById('newNumber').value.trim();
      if (!n) return alert('Ingresa un número');
      await fetch(BASE + '/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number: n }) });
      document.getElementById('newNumber').value = '';
      refresh();
    }

    async function removeContact(number) {
      await fetch(BASE + '/api/contacts/' + encodeURIComponent(number), { method: 'DELETE' });
      refresh();
    }

    async function testOllama() {
      const msg = document.getElementById('testMsg').value.trim();
      if (!msg) return;
      document.getElementById('testResult').textContent = 'Consultando Ollama...';
      try {
        const r = await fetch(BASE + '/api/ollama/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        });
        const data = await r.json();
        document.getElementById('testResult').textContent = data.response || data.error || '(sin respuesta)';
      } catch (err) {
        document.getElementById('testResult').textContent = 'Error: ' + err.message;
      }
    }

    socket.on('qr',    refresh);
    socket.on('status', refresh);
    socket.on('message', refresh);
    socket.on('contacts_updated', refresh);

    refresh();
    setInterval(refresh, 15000);
  </script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RUTAS
// ─────────────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    service: 'Agrosoft CM WhatsApp Bot',
    status: botStatus,
    endpoints: ['/panel', '/api/status', '/api/qr-image', '/api/contacts', '/api/ollama/health', '/api/messages']
  });
});

app.get('/panel', (_req, res) => {
  res.type('html').send(renderPanelHtml());
});

app.get('/api/status', async (_req, res) => {
  const ollama = await getOllamaInfo();
  res.json({
    bot: botStatus,
    ollama: ollama.online ? 'online' : 'offline',
    ollamaModel: ollama.model,
    installedModels: ollama.models,
    authorizedCount: getAuthorized().length,
    messageCount: recentMessages.length,
    config: getBotConfig(),
    hasQR: Boolean(currentQR)
  });
});

app.get('/api/qr', (_req, res) => {
  res.json({ qr: currentQR, bot: botStatus });
});

app.get('/api/qr-image', async (_req, res) => {
  res.json(await buildQrPayload());
});

app.get('/api/messages', (_req, res) => {
  res.json({ messages: recentMessages });
});

app.get('/api/contacts', (_req, res) => {
  res.json({ contacts: getAuthorized() });
});

app.post('/api/contacts', (req, res) => {
  const { number } = req.body as { number?: string };
  if (!number) {
    res.status(400).json({ error: 'Número requerido' });
    return;
  }
  addAuthorized(number);
  const contacts = getAuthorized();
  io.emit('contacts_updated', { contacts });
  res.json({ ok: true, contacts });
});

app.delete('/api/contacts/:number', (req, res) => {
  removeAuthorized(req.params.number);
  const contacts = getAuthorized();
  io.emit('contacts_updated', { contacts });
  res.json({ ok: true, contacts });
});

app.get('/api/ollama/health', async (_req, res) => {
  const ok = await checkOllamaHealth();
  res.json({ status: ok ? 'online' : 'offline' });
});

app.post('/api/ollama/test', async (req, res) => {
  const { message } = req.body as { message?: string };
  if (!message) {
    res.status(400).json({ error: 'Mensaje requerido' });
    return;
  }
  const response = await askOllama(message);
  res.json({ response });
});

app.post('/api/send', async (req, res) => {
  const { number, message } = req.body as { number?: string; message?: string };
  if (!number || !message) {
    res.status(400).json({ error: 'number y message son requeridos' });
    return;
  }
  if (botStatus !== 'ready') {
    res.status(409).json({ error: 'WhatsApp aún no está conectado' });
    return;
  }
  const clean = number.replace(/\D/g, '');
  const finalNumber = clean.length === 10 && clean.startsWith('3') ? `57${clean}` : clean;
  await client.sendMessage(`${finalNumber}@c.us`, message);
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// SOCKET.IO
// ─────────────────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[Server] Panel conectado al bot');
  socket.emit('status', { bot: botStatus });
  socket.emit('contacts_updated', { contacts: getAuthorized() });
  socket.emit('messages', { messages: recentMessages });
  if (currentQR) socket.emit('qr', currentQR);
});

// ─────────────────────────────────────────────────────────────────────────────
// ARRANQUE DEL BOT
// ─────────────────────────────────────────────────────────────────────────────
if (String(process.env.BOT_AUTOSTART || 'true').toLowerCase() === 'true') {
  initBot(
    // onQR
    (qr) => {
      currentQR = qr;
      botStatus = 'qr';
      io.emit('qr', qr);
      io.emit('status', { bot: botStatus });
    },
    // onReady
    () => {
      currentQR = '';
      botStatus = 'ready';
      io.emit('status', { bot: botStatus });
      console.log('[Server] Bot listo y escuchando mensajes ✅');
    },
    // onMessage
    (from, body, response) => {
      rememberMessage(from, body, response);
      io.emit('message', { from, body, response, timestamp: new Date().toISOString() });
    },
    // onStatus
    (status, detail) => {
      if (status === 'disconnected') botStatus = 'disconnected';
      if (status === 'auth_failure') botStatus = 'auth_failure';
      if (status === 'qr') botStatus = 'qr';
      if (status === 'ready') botStatus = 'ready';
      io.emit('status', { bot: botStatus, detail });
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVIDOR HTTP
// ─────────────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.BOT_PORT || 3001);
httpServer.listen(PORT, () => {
  console.log(`[Server] Bot server corriendo en http://localhost:${PORT}`);
  console.log(`[Server] Panel disponible en http://localhost:${PORT}/panel`);
});