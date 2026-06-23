# Elite Beauty — Agente IA Omnicanal

Sistema de agente IA para Elite Beauty. Atiende clientes por WhatsApp y llamadas telefónicas, recopila leads, usa RAG con Supabase, y expone un dashboard de gestión completo.

## Stack

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.12 + FastAPI |
| Frontend | React 18 + Vite + Tailwind + Recharts |
| Base de datos | Supabase (PostgreSQL + pgvector) |
| IA | OpenRouter API |
| WhatsApp | whatsapp-web.js (Node.js bridge) |
| Voz | Twilio Voice API |
| Deploy | Docker Compose → AWS ECS Fargate |

---

## Arranque rápido (desarrollo)

### 1. Copiar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus keys reales
```

### 2. Configurar Supabase

Ir a Supabase > SQL Editor y ejecutar:

```
supabase/migrations/001_initial.sql
```

### 3. Levantar con Docker Compose

```bash
docker-compose up --build
```

Servicios disponibles:
- Dashboard: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- WA Bridge Panel: http://localhost:3001/panel

### 4. Conectar WhatsApp

Abre http://localhost:3001/panel y escanea el QR con tu teléfono.

O desde el dashboard en http://localhost:3000 → botón "Conectar WhatsApp".

---

## Desarrollo local (sin Docker)

### Backend

```bash
cd backend
pip install -r requirements.txt
cp ../.env.example .env   # editar .env
uvicorn app.main:app --reload --port 8000
```

### WA Bridge

```bash
cd backend/wa_bridge
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

---

## Variables de entorno requeridas

| Variable | Descripción |
|----------|-------------|
| `OPENROUTER_API_KEY` | API key de OpenRouter |
| `OPENAI_API_KEY` | API key de OpenAI (para embeddings RAG) |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_KEY` | Service role key de Supabase |
| `TWILIO_ACCOUNT_SID` | SID de cuenta Twilio |
| `TWILIO_AUTH_TOKEN` | Auth token de Twilio |
| `TWILIO_PHONE_NUMBER` | Número Twilio para llamadas |
| `PUBLIC_BASE_URL` | URL pública del backend (para webhooks Twilio) |

---

## Configurar Twilio

### WhatsApp Sandbox (pruebas)
1. Twilio Console → Messaging → Try it out → Send a WhatsApp message
2. Webhook URL: `https://tu-dominio/channels/whatsapp/twilio`

### Voz
1. Twilio Console → Phone Numbers → tu número → Voice webhook
2. Incoming Call URL: `https://tu-dominio/voice/incoming`
3. Status Callback URL: `https://tu-dominio/voice/status`

---

## Deploy en AWS

```bash
cd infra/aws
chmod +x deploy.sh

export AWS_REGION=us-east-1
export ECS_CLUSTER=elitebeauty-cluster
./deploy.sh
```

Antes de hacer deploy, crear los secretos en AWS Secrets Manager con los nombres referenciados en `ecs-task-backend.json`.

---

## Estructura del proyecto

```
elitebeauty-agent/
├── backend/
│   ├── app/           # FastAPI
│   │   ├── agent/     # openrouter, rag, prompts, core
│   │   ├── channels/  # whatsapp, voice
│   │   ├── db/        # supabase_client, models, vector
│   │   ├── analytics/ # metrics
│   │   └── api/       # routes + websocket
│   └── wa_bridge/     # Node.js + whatsapp-web.js
├── frontend/          # React + Vite
│   └── src/
│       ├── pages/     # Dashboard, Leads, Analytics, RAGDocs, Settings...
│       └── components/# Sidebar, KPICard, charts...
├── supabase/
│   └── migrations/    # SQL inicial con pgvector
└── infra/
    ├── docker-compose.yml
    └── aws/           # ECS tasks + deploy script
```
