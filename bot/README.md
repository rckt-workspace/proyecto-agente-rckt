# Agrosoft CM WhatsApp Bot

Bot local para responder mensajes de WhatsApp con Ollama + llama3.

## Flujo

1. El Home abre `https://wa.me/573153863179`.
2. El usuario envia el mensaje al WhatsApp `3153863179`.
3. Este bot, conectado con QR a ese mismo WhatsApp, recibe el mensaje.
4. El bot consulta Ollama y responde por WhatsApp.

## Configuracion

```powershell
cd bot
Copy-Item .env.example .env
npm install
npm run dev
```

Antes de iniciar el bot, verifica Ollama:

```powershell
ollama list
ollama pull llama3.2
ollama serve
```

## Variables importantes

- `BOT_PUBLIC_NUMBER=573153863179`: numero que recibe mensajes desde el Home.
- `BOT_REQUIRE_AUTH=false`: responde a cualquier contacto que escriba al bot.
- `BOT_REQUIRE_AUTH=true`: solo responde a numeros en `bot/data/authorized.json`.
- `OLLAMA_URL=http://localhost:11434`: URL local de Ollama.
- `OLLAMA_MODEL=llama3.2:latest`: modelo usado por el bot. En esta maquina ya esta instalado.

## Endpoints

- `GET /api/status`: estado del bot, Ollama y contactos.
- `GET /api/qr`: QR actual si WhatsApp no esta conectado.
- `POST /api/ollama/test`: prueba directa del LLM.
- `GET /api/messages`: ultimos mensajes procesados.
- `POST /api/contacts`: autoriza un contacto.
- `DELETE /api/contacts/:number`: quita un contacto.

## Comandos por WhatsApp

Desde el numero owner (`BOT_OWNER_NUMBER`) puedes escribir:

- `!status`
- `!autorizar 3001234567`
- `!quitar 3001234567`
- `!contactos`
- `!limpiar`
- `!ayuda`

## Docker + ngrok

El `docker-compose.prod.yml` levanta el bot como servicio `bot` y nginx lo publica por el frontend.

Si ngrok apunta al frontend (`localhost:5173`), usa:

- `https://TU-NGROK/bot-api/api/status`
- `https://TU-NGROK/bot-api/api/qr`
- `https://TU-NGROK/bot-api/panel`
- `https://TU-NGROK/bot-api/api/messages`

Para levantarlo:

```powershell
docker compose -f docker-compose.prod.yml up -d --build bot frontend
```

La sesion de WhatsApp queda persistida en el volumen `bot_session`; si reinicias Docker no deberia pedir QR otra vez, salvo que WhatsApp cierre la sesion.

Si Ollama dentro de Docker no tiene el modelo:

```powershell
docker exec -it tesis-final-ollama-1 ollama pull llama3.2
```
