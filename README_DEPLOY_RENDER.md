# Elite Beauty Agent — Despliegue en Render

Guía paso a paso para desplegar los tres servicios del agente en Render usando el Blueprint
(`render.yaml`) incluido en este repositorio.

---

## Servicios

| Servicio | Tipo | Directorio fuente |
|---|---|---|
| `elitebeauty-backend` | Web Service (Docker) | `elitebeauty-agent/backend/` |
| `elitebeauty-frontend` | Static Site | `elitebeauty-agent/frontend/` |
| `elitebeauty-wa-bridge` | Web Service (Docker) | `elitebeauty-agent/backend/wa_bridge/` |

---

## Paso 1 — Conectar el repositorio en Render

1. Entra a [render.com](https://render.com) y haz clic en **New > Blueprint**.
2. Conecta tu cuenta de GitHub y selecciona este repositorio.
3. Render detectará el archivo `render.yaml` de la raíz y mostrará los tres servicios.
4. Haz clic en **Apply** para iniciar la creación.

---

## Paso 2 — Configurar variables de entorno secretas

Las variables marcadas con `sync: false` en `render.yaml` **no tienen valor predeterminado**;
debes ingresarlas manualmente en el panel de Render antes de que el primer deploy funcione.

### Backend (`elitebeauty-backend`)

Ve a **Dashboard > elitebeauty-backend > Environment** y agrega:

| Variable | Descripción |
|---|---|
| `ANTHROPIC_API_KEY` | API key de Anthropic (Claude) |
| `OPENROUTER_API_KEY` | API key de OpenRouter |
| `SUPABASE_URL` | URL de tu proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | Service Role Key de Supabase |
| `TAVILY_API_KEY` | API key de Tavily (búsqueda web) |
| `TWILIO_ACCOUNT_SID` | Account SID de Twilio (opcional, voz) |
| `TWILIO_AUTH_TOKEN` | Auth Token de Twilio (opcional, voz) |
| `TWILIO_PHONE_NUMBER` | Número Twilio (opcional, voz) |
| `SECRET_KEY` | Secreto app — genera con `openssl rand -hex 32` |

Revisa [elitebeauty-agent/backend/.env.render.backend.example](elitebeauty-agent/backend/.env.render.backend.example)
para la lista completa.

### Frontend (`elitebeauty-frontend`)

Las variables `VITE_*` ya tienen valores en `render.yaml`. Si usas dominios personalizados,
actualízalas en **Dashboard > elitebeauty-frontend > Environment**:

| Variable | Valor por defecto en render.yaml |
|---|---|
| `VITE_API_BASE_URL` | `https://elitebeauty-backend.onrender.com` |
| `VITE_WS_URL` | `wss://elitebeauty-backend.onrender.com/ws` |
| `VITE_WA_BRIDGE_PUBLIC_URL` | `https://elitebeauty-wa-bridge.onrender.com` |

> **Importante:** estas variables se hornean en el bundle en el momento del build. Cualquier
> cambio requiere un nuevo deploy del frontend.

### WA Bridge (`elitebeauty-wa-bridge`)

No tiene secretos, pero verifica que `BACKEND_URL` apunte al backend correcto.

---

## Paso 3 — Agregar Persistent Disk al WA Bridge

El WA Bridge necesita un disco persistente para conservar la sesión de WhatsApp entre reinicios.
El `render.yaml` lo configura automáticamente (`disk: wa-session, /app/session, 1 GB`).

Si lo necesitas configurar manualmente:

1. Ve a **Dashboard > elitebeauty-wa-bridge > Settings > Disks**.
2. Haz clic en **Add Disk**.
3. Configura:
   - **Name:** `wa-session`
   - **Mount Path:** `/app/session`
   - **Size:** `1 GB`

---

## Paso 4 — Actualizar las URLs cruzadas

Una vez que Render asigne las URLs definitivas, actualiza las variables que referencian otros servicios:

| Servicio | Variable | URL a poner |
|---|---|---|
| `elitebeauty-backend` | `PUBLIC_BASE_URL` | URL del propio backend |
| `elitebeauty-backend` | `WA_BRIDGE_URL` | URL del wa_bridge |
| `elitebeauty-backend` | `CORS_ORIGINS` | URL del frontend |
| `elitebeauty-frontend` | `VITE_API_BASE_URL` | URL del backend |
| `elitebeauty-frontend` | `VITE_WS_URL` | URL WebSocket del backend (wss://) |
| `elitebeauty-frontend` | `VITE_WA_BRIDGE_PUBLIC_URL` | URL del wa_bridge |
| `elitebeauty-wa-bridge` | `BACKEND_URL` | URL del backend |

Después de actualizar, redespliega cada servicio afectado.

---

## Paso 5 — Primer deploy y escaneo QR

1. Espera a que los tres servicios terminen su build (el wa_bridge tarda más por Chromium).
2. Abre el dashboard frontend en la URL asignada.
3. Haz clic en **Conectar WhatsApp** — se abrirá el panel del bridge en una nueva pestaña.
4. Escanea el código QR con WhatsApp en tu teléfono.
5. El estado cambiará a **Conectado ✅** y las sesiones se guardarán en `/app/session`.

---

## Checklist de prueba post-deploy

### Backend
- [ ] `GET https://elitebeauty-backend.onrender.com/health` → `{"status": "ok", ...}`
- [ ] `POST https://elitebeauty-backend.onrender.com/api/chat` con body `{"message": "hola", "channel": "whatsapp"}` → respuesta de Sofia

### Frontend
- [ ] `https://elitebeauty-frontend.onrender.com` → Dashboard carga sin errores de consola
- [ ] El indicador WebSocket (punto verde) aparece conectado
- [ ] Las secciones Conversaciones, Leads y Analíticas cargan datos (o estado vacío sin errores 5xx)

### WA Bridge
- [ ] `GET https://elitebeauty-wa-bridge.onrender.com/status` → `{"bot": "qr" | "ready" | "disconnected"}`
- [ ] `https://elitebeauty-wa-bridge.onrender.com/panel` → Página de QR carga
- [ ] QR aparece en pantalla
- [ ] Al escanear con WhatsApp el status cambia a `ready`
- [ ] Enviar mensaje al número vinculado → backend procesa y responde

### Logs
- [ ] Logs del backend no muestran errores 500 ni claves en texto plano
- [ ] Logs del wa_bridge muestran `[Bridge] WhatsApp conectado ✅`

---

## Desarrollo local (Docker Compose)

Para desarrollo local usa `docker compose` desde `elitebeauty-agent/`:

```bash
cd elitebeauty-agent
cp .env.example .env      # y rellena las variables
docker compose up --build
```

Accesos locales:
- Dashboard:      http://localhost:3010
- Backend API:    http://localhost:8010
- Swagger:        http://localhost:8010/docs
- WA Bridge QR:   http://localhost:3011/panel

---

## Dominios personalizados

Para usar `agent.elitebeauty.com.co` en vez de `*.onrender.com`:

1. Ve a **Dashboard > [servicio] > Settings > Custom Domains**.
2. Agrega el subdominio y sigue las instrucciones DNS.
3. Actualiza las variables de entorno de todos los servicios con los nuevos dominios.
4. Redespliega los tres servicios.
