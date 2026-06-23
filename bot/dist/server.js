import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';
import cors from 'cors';
import QRCode from 'qrcode';
import { initBot, addAuthorized, removeAuthorized, getAuthorized, getBotConfig, client } from './bot.js';
import { askOllama, checkOllamaHealth, getOllamaInfo } from './ollama.js';
const app = express();
const httpServer = createServer(app);
const io = new SocketIO(httpServer, {
    cors: { origin: '*' }
});
app.use(cors());
app.use(express.json({ limit: '1mb' }));
let botStatus = 'disconnected';
let currentQR = '';
const recentMessages = [];
function rememberMessage(from, body, response) {
    recentMessages.unshift({ from, body, response, timestamp: new Date().toISOString() });
    if (recentMessages.length > 50)
        recentMessages.pop();
}
async function buildQrPayload() {
    if (!currentQR)
        return { qr: '', image: '', bot: botStatus };
    const image = await QRCode.toDataURL(currentQR, { width: 320, margin: 1 });
    return { qr: currentQR, image, bot: botStatus };
}
function renderPanelHtml() {
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agrosoft CM Bot</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; background: #f4f6f8; color: #111827; }
    main { max-width: 920px; margin: 0 auto; padding: 32px 16px; }
    .card { background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 24px; box-shadow: 0 8px 28px rgba(15, 23, 42, .08); }
    .top { display: flex; justify-content: space-between; gap: 16px; align-items: center; flex-wrap: wrap; }
    .badge { border-radius: 999px; padding: 8px 12px; font-size: 13px; font-weight: 700; background: #eef2ff; color: #3730a3; }
    .ready { background: #dcfce7; color: #166534; }
    .qr { display: grid; grid-template-columns: minmax(220px, 340px) 1fr; gap: 24px; align-items: center; margin-top: 24px; }
    img { width: 100%; max-width: 320px; border: 1px solid #e5e7eb; border-radius: 8px; }
    button { border: 0; border-radius: 8px; background: #16a34a; color: white; padding: 10px 14px; font-weight: 700; cursor: pointer; }
    pre { background: #111827; color: #e5e7eb; padding: 14px; border-radius: 8px; overflow: auto; font-size: 12px; }
    @media (max-width: 720px) { .qr { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <div class="card">
      <div class="top">
        <div>
          <h1>Agrosoft CM WhatsApp Bot</h1>
          <p>Escanea el QR con WhatsApp del numero 3153863179 para activar las respuestas automaticas con Ollama.</p>
        </div>
        <span id="status" class="badge">Cargando...</span>
      </div>
      <div class="qr">
        <div id="qrBox"><p>Esperando QR...</p></div>
        <div>
          <p><strong>URL API:</strong> <code id="base"></code></p>
          <p><strong>Ollama:</strong> <span id="ollama">...</span></p>
          <p><strong>Modelo:</strong> <span id="model">...</span></p>
          <button onclick="refresh()">Actualizar</button>
        </div>
      </div>
      <h3>Ultimos mensajes</h3>
      <pre id="messages">[]</pre>
    </div>
  </main>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const BASE = location.pathname.startsWith('/bot-api/') ? '/bot-api' : '';
    document.getElementById('base').textContent = BASE || '/';
    const socket = io({ path: '/socket.io/' });

    async function refresh() {
      const status = await fetch(BASE + '/api/status').then(r => r.json());
      document.getElementById('status').textContent = status.bot;
      document.getElementById('status').className = 'badge ' + (status.bot === 'ready' ? 'ready' : '');
      document.getElementById('ollama').textContent = status.ollama;
      document.getElementById('model').textContent = status.ollamaModel;

      const qr = await fetch(BASE + '/api/qr-image').then(r => r.json());
      document.getElementById('qrBox').innerHTML = qr.image
        ? '<img alt="QR WhatsApp" src="' + qr.image + '" />'
        : '<p>WhatsApp ya esta conectado o aun no hay QR.</p>';

      const messages = await fetch(BASE + '/api/messages').then(r => r.json());
      document.getElementById('messages').textContent = JSON.stringify(messages.messages || [], null, 2);
    }

    socket.on('qr', refresh);
    socket.on('status', refresh);
    socket.on('message', refresh);
    refresh();
  </script>
</body>
</html>`;
}
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
    const { number } = req.body;
    if (!number) {
        res.status(400).json({ error: 'Numero requerido' });
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
    const { message } = req.body;
    if (!message) {
        res.status(400).json({ error: 'Mensaje requerido' });
        return;
    }
    const response = await askOllama(message);
    res.json({ response });
});
app.post('/api/send', async (req, res) => {
    const { number, message } = req.body;
    if (!number || !message) {
        res.status(400).json({ error: 'number y message son requeridos' });
        return;
    }
    if (botStatus !== 'ready') {
        res.status(409).json({ error: 'WhatsApp aun no esta conectado' });
        return;
    }
    const clean = number.replace(/\D/g, '');
    const finalNumber = clean.length === 10 && clean.startsWith('3') ? `57${clean}` : clean;
    await client.sendMessage(`${finalNumber}@c.us`, message);
    res.json({ ok: true });
});
io.on('connection', (socket) => {
    console.log('Panel conectado al bot');
    socket.emit('status', { bot: botStatus });
    socket.emit('contacts_updated', { contacts: getAuthorized() });
    socket.emit('messages', { messages: recentMessages });
    if (currentQR)
        socket.emit('qr', currentQR);
});
if (String(process.env.BOT_AUTOSTART || 'true').toLowerCase() === 'true') {
    initBot((qr) => {
        currentQR = qr;
        botStatus = 'qr';
        io.emit('qr', qr);
        io.emit('status', { bot: botStatus });
    }, () => {
        currentQR = '';
        botStatus = 'ready';
        io.emit('status', { bot: botStatus });
    }, (from, body, response) => {
        rememberMessage(from, body, response);
        io.emit('message', { from, body, response, timestamp: new Date().toISOString() });
    }, (status, detail) => {
        if (status === 'disconnected')
            botStatus = 'disconnected';
        if (status === 'auth_failure')
            botStatus = 'auth_failure';
        if (status === 'qr')
            botStatus = 'qr';
        if (status === 'ready')
            botStatus = 'ready';
        io.emit('status', { bot: botStatus, detail });
    });
}
const PORT = Number(process.env.BOT_PORT || 3001);
httpServer.listen(PORT, () => {
    console.log(`Bot server corriendo en http://localhost:${PORT}`);
});
