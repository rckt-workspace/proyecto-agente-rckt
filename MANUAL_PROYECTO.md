# Manual Completo — Elite Beauty Agent

**Versión:** 1.0  
**Última actualización:** 2026-06-24  
**Propósito:** Guía técnica completa del proyecto para entender la arquitectura, flujos y modelo de datos.

---

## Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Arquitectura y Componentes](#arquitectura-y-componentes)
3. [Flujos Principales](#flujos-principales)
4. [Modelo de Datos](#modelo-de-datos)
5. [Instrucciones para Crear la Base de Datos](#instrucciones-para-crear-la-base-de-datos)
6. [Variables de Entorno](#variables-de-entorno)
7. [Glosario](#glosario)

---

## Visión General

### ¿Qué es Elite Beauty Agent?

Sistema de agente IA **omnicanal** que atiende clientes de Elite Beauty (centro estético en Bogotá) por:
- **WhatsApp** (mediante whatsapp-web.js)
- **Llamadas telefónicas** (mediante Twilio Voice API)

### Objetivos principales

1. **Automatizar atención al cliente** — Respuestas inteligentes sobre procedimientos, precios, horarios
2. **Captura de leads** — Extraer automáticamente nombre, teléfono, email, interés del cliente en conversaciones
3. **Recomendaciones contextuales** — RAG (Retrieval Augmented Generation) para entregar información precisa sobre tratamientos
4. **Dashboard CRM** — Panel de control con métricas, leads, conversaciones y reportes
5. **Escalabilidad** — Deploy en AWS ECS Fargate para manejar múltiples clientes simultáneamente

### Stack técnico

| Componente | Tecnología |
|-----------|-----------|
| **Backend** | Python 3.12 + FastAPI |
| **Frontend** | React 18 + Vite + Tailwind CSS + Recharts |
| **Base de datos** | Supabase (PostgreSQL + pgvector para vectores) |
| **IA / LLM** | OpenRouter API (acceso a múltiples modelos como Llama 3.1) |
| **WhatsApp** | whatsapp-web.js (bridge Node.js) |
| **Voz** | Twilio Voice API |
| **Embeddings** | OpenAI Embeddings para RAG |
| **Búsqueda web** | Tavily API (opcional, para contexto adicional) |
| **Orquestación** | Docker Compose (dev) → AWS ECS Fargate (prod) |

---

## Arquitectura y Componentes

### Diagrama de alto nivel

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENTES EXTERNOS                            │
├──────────────┬───────────────────────────────────┬──────────────┤
│  WhatsApp    │         Dashboard                  │ Twilio Voice │
│  (móvil)     │      (navegador web)               │  (llamadas)  │
└──────┬───────┴───────────────────────────────────┴──────┬───────┘
       │                                                   │
       │ HTTP/WebSocket                                    │ SIP/VoIP
       │                                                   │
┌──────▼──────────────────────────────────────────────────▼────────┐
│              BACKEND — FastAPI (Python)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────┐        │
│  │  /chat       │  │  /leads       │  │  /analytics    │        │
│  │  /docs       │  │  /config      │  │  /conversations│        │
│  └──────────────┘  └───────────────┘  └────────────────┘        │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           AGENT CORE (inteligencia)                     │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  • openrouter.py → Llama/Claude via OpenRouter         │   │
│  │  • rag.py → búsqueda de contexto (pgvector + Tavily)   │   │
│  │  • prompts.py → system prompts por canal               │   │
│  │  • core.py → orquestación de mensajes y leads          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         CANALES (integración de APIs)                   │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  • channels/whatsapp.py → webhooks de mensajes          │   │
│  │  • channels/voice.py → webhooks de llamadas (Twilio)    │   │
│  │  • wa_bridge/ → Node.js que gestiona sesión WA          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            BASE DE DATOS (Supabase)                     │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  • supabase_client.py → cliente postgrest               │   │
│  │  • db/models.py → esquemas Pydantic                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
       │
       │ PostgreSQL + pgvector
       │
┌──────▼─────────────────────────────────────────────────────────┐
│            SUPABASE (PostgreSQL + pgvector)                    │
├────────────────────────────────────────────────────────────────┤
│  • conversations — historial de chats por canal               │
│  • messages — mensajes (usuario/asistente/sistema)           │
│  • leads — clientes prospectados + datos                      │
│  • documents — base de conocimiento de Elite Beauty           │
│  • embeddings — vectores (1536-dim) para búsqueda RAG         │
│  • agent_config — configuración dinámica del agente           │
└────────────────────────────────────────────────────────────────┘
```

### Componentes clave

#### 1. **Backend (FastAPI)**
- **puerto**: 8000
- **rutas principales**:
  - `POST /chat` — procesar mensaje del usuario
  - `GET /conversations` — listar conversaciones
  - `POST /leads` — crear lead manual
  - `GET /leads` — listar leads por estado/canal
  - `POST /documents` — subir documento al RAG
  - `GET /analytics/...` — métricas de desempeño
  - `WS /ws` — WebSocket para eventos en vivo

#### 2. **Frontend (React + Vite)**
- **puerto**: 3000
- **páginas principales**:
  - `Dashboard` — KPIs, gráficos de mensajes/leads
  - `Conversations` — historial de chats
  - `Leads` — CRM de prospectos
  - `Analytics` — reportes de desempeño
  - `RAG Docs` — gestión de documentos para RAG
  - `Voice Agent Test` — pruebas de IVR telefónico
  - `Settings` — configuración del agente

#### 3. **WA Bridge (Node.js)**
- **puerto**: 3001
- **función**: Mantiene sesión de WhatsApp activa usando whatsapp-web.js
- **panel**: http://localhost:3001/panel (escanear QR)
- **webhook**: Envía mensajes recibidos al backend vía `/channels/whatsapp`

#### 4. **Base de Datos (Supabase)**
- **tipo**: PostgreSQL con extensión pgvector
- **tablas**: 6 principales
- **indexes**: Para búsqueda rápida por contact_id, status, channel
- **índice vectorial**: IVFFlat para búsqueda de embeddings

---

## Flujos Principales

### Flujo 1: Mensaje por WhatsApp

```
1. Cliente envía mensaje en WhatsApp
   ↓
2. whatsapp-web.js lo captura (WA Bridge)
   ↓
3. Bridge envía POST a backend /channels/whatsapp con {from, body, timestamp}
   ↓
4. Backend crea/obtiene conversation si no existe
   ↓
5. Llama agent.core.run_agent():
   a) Obtiene contexto RAG (búsqueda en pgvector + Tavily)
   b) Construye system prompt personalizado
   c) Obtiene historial de conversación (últimos 6 mensajes)
   d) Envía todo a OpenRouter (Llama 3.1)
   e) Guarda mensajes user + assistant en DB
   f) Intenta extraer datos de lead (nombre, teléfono, interés)
   ↓
6. Backend envía respuesta al WA Bridge vía /wa/send
   ↓
7. WA Bridge envía mensaje de vuelta al cliente
   ↓
8. WebSocket notifica al dashboard en vivo (new_message event)
```

### Flujo 2: Llamada Telefónica (Twilio)

```
1. Cliente llama al número Twilio
   ↓
2. Twilio hace webhook a backend /voice/incoming (TwiML)
   ↓
3. Backend crea conversation con channel='voice'
   ↓
4. Twilio reproduce audio de bienvenida (TTS)
   ↓
5. Captura input del cliente (DTMF o transcripción de voz)
   ↓
6. Llama agent.core.run_agent() con max_tokens reducido (150)
   ↓
7. Convierte respuesta a audio (TTS Twilio)
   ↓
8. Envía back to Twilio para reproducir
   ↓
9. Registra call_duration en lead
   ↓
10. Twilio hace callback a /voice/status cuando finaliza
```

### Flujo 3: Procesamiento de Documentos RAG

```
1. Admin sube documento en frontend → POST /documents
   ↓
2. Backend guarda en tabla documents (title, content, category)
   ↓
3. Luego (batch async):
   a) Divide content en chunks de ~500 caracteres
   b) Genera embedding con OpenAI Embeddings (1536-dim)
   c) Guarda cada chunk + vector en tabla embeddings
   d) Marca documento como embedded=true
   ↓
4. En siguiente consulta, agent.rag busca embeddings más similares
   ↓
5. Devuelve top_k chunks con similitud >0.4
```

### Flujo 4: Extracción Automática de Leads

```
1. Mensaje llega del cliente
   ↓
2. En agent.core._extract_lead_data() se buscan patrones regex:
   - Nombre: "me llamo X", "soy X"
   - Interés: menciones de tensamax, hydrash, o2toderm, removall
   - Teléfono: formato +57 o 10 dígitos
   ↓
3. Si encuentra datos:
   a) Crea/actualiza lead vinculado a conversation
   b) Status inicia en 'new'
   c) Puede pasar a 'contacted', 'scheduled', 'closed' manualmente
   ↓
4. Dashboard muestra lead en CRM → staff puede seguimiento
```

### Flujo 5: Analytics y Dashboard

```
1. Frontend hace GET /analytics/kpis
   ↓
2. Backend consulta:
   - COUNT(conversations) últimos 7 días
   - COUNT(messages) últimos 7 días
   - AVG(latency_ms) para performance
   - COUNT(leads) por status
   - Desglose por canal (whatsapp vs voice)
   ↓
3. Frontend grafica con Recharts
   ↓
4. WebSocket emite eventos en vivo (new_message, new_lead) para actualizar
```

---

## Modelo de Datos

### Tablas y Relaciones

```sql
conversations (1 to many) messages
    ↓
    ├─ 1 to 1 leads
    ├─ 1 to many messages
    └─ metadata: channel, contact_id, status

leads (independent)
    └─ metadata: name, phone, email, interest, budget, call_duration

documents (1 to many) embeddings
    ├─ 1 to many embeddings (chunks + vectores)
    └─ metadata: title, content, category, source

embeddings (búsqueda vectorial)
    └─ referenced by documents

agent_config (key-value)
    └─ configuración dinámica del sistema
```

### Tabla: `conversations`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID (PK) | Generado automáticamente |
| `channel` | TEXT (enum) | 'whatsapp' o 'voice' |
| `contact_id` | TEXT | Número WhatsApp o ID Twilio |
| `contact_name` | TEXT | Nombre del cliente (opcional) |
| `status` | TEXT (enum) | 'open' (default), 'closed', 'follow_up' |
| `created_at` | TIMESTAMPTZ | Fecha de creación |
| `updated_at` | TIMESTAMPTZ | Actualizado automáticamente |

**Índices:**
- `(contact_id)` — búsqueda rápida por número
- `(status)` — filtrar activas/cerradas
- `(channel)` — agrupar por canal
- `(created_at DESC)` — ordenar recientes primero

---

### Tabla: `messages`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID (PK) | Generado automáticamente |
| `conversation_id` | UUID (FK) | References conversations.id (CASCADE delete) |
| `role` | TEXT (enum) | 'user', 'assistant', 'system' |
| `content` | TEXT | Contenido del mensaje (hasta 2000 caracteres) |
| `tokens_used` | INT | Tokens consumidos por OpenRouter (optional) |
| `latency_ms` | INT | Milisegundos de respuesta (optional) |
| `created_at` | TIMESTAMPTZ | Timestamp |

**Índices:**
- `(conversation_id, created_at)` — obtener historial ordenado

---

### Tabla: `leads`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID (PK) | Generado automáticamente |
| `conversation_id` | UUID (FK) | References conversations.id (SET NULL on delete) |
| `channel` | TEXT | 'whatsapp', 'voice', etc. |
| `name` | TEXT | Nombre extraído del cliente |
| `phone` | TEXT | Número de teléfono |
| `email` | TEXT | Email (optional) |
| `interest` | TEXT | Procedimiento de interés (tensamax, hydrash, etc.) |
| `budget` | TEXT | Rango de presupuesto mencionado |
| `call_duration` | INT | Segundos de llamada (si es voice) |
| `summary` | TEXT | Resumen de conversación |
| `status` | TEXT (enum) | 'new' (default), 'contacted', 'scheduled', 'closed' |
| `notes` | TEXT | Notas adicionales del staff |
| `created_at` | TIMESTAMPTZ | Fecha de captura |
| `updated_at` | TIMESTAMPTZ | Actualizado automáticamente |

**Índices:**
- `(status)` — filtrar por estado
- `(channel)` — agrupar por canal
- `(created_at DESC)` — recientes primero

---

### Tabla: `documents`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID (PK) | Generado automáticamente |
| `title` | TEXT | Título del documento |
| `content` | TEXT | Contenido completo (se divide en chunks) |
| `category` | TEXT (enum) | 'procedimientos', 'precios', 'tecnologia', 'faqs', 'horarios', 'general' |
| `source` | TEXT | Origen: 'staff', 'website', etc. |
| `embedded` | BOOLEAN | ¿Ya fue procesado en embeddings? |
| `created_at` | TIMESTAMPTZ | Fecha de subida |
| `updated_at` | TIMESTAMPTZ | Actualización automática |

**Precargados:**
- Tensamax (procedimiento)
- Hydrash (procedimiento)
- O2toDerm (procedimiento)
- Removall Trio (próxima tecnología)
- Información general y contacto
- FAQs

---

### Tabla: `embeddings`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID (PK) | Generado automáticamente |
| `document_id` | UUID (FK) | References documents.id (CASCADE delete) |
| `chunk` | TEXT | Fragmento del documento (~500 caracteres) |
| `embedding` | VECTOR(1536) | Vector embedding de OpenAI |
| `created_at` | TIMESTAMPTZ | Timestamp |

**Índices:**
- `(document_id)` — obtener todos los chunks de un doc
- `(embedding) — IVFFLAT vectorial` — búsqueda por similitud (cosine)

---

### Tabla: `agent_config`

| Campo | Tipo | Notas |
|-------|------|-------|
| `id` | UUID (PK) | Generado automáticamente |
| `key` | TEXT UNIQUE | Identificador de configuración |
| `value` | TEXT | Valor (JSON string para complejos) |
| `description` | TEXT | Descripción |
| `updated_at` | TIMESTAMPTZ | Actualización automática |

**Valores por defecto:**
- `model` → 'meta-llama/llama-3.1-8b-instruct:free' (modelo OpenRouter)
- `rag_top_k` → '5' (chunks a recuperar)
- `max_history` → '6' (mensajes de contexto)
- `cooldown_ms` → '2000' (anti-spam)
- `require_auth` → 'false' (restringir números)
- `business_hours` → JSON con horarios de atención

---

## Instrucciones para Crear la Base de Datos

### Opción 1: Automático (Recomendado)

#### Paso 1: Crear proyecto en Supabase

1. Ir a https://supabase.com
2. Click en **"New project"**
3. Llenar formulario:
   - **Project name**: `elite-beauty-agent`
   - **Password**: Guardar en lugar seguro
   - **Region**: `South America - São Paulo` (más cercano a Bogotá)
4. Esperar a que se cree (2-5 min)

#### Paso 2: Obtener credenciales

En el dashboard del proyecto, ir a **Settings > API**:
- Copiar `Project URL` → `SUPABASE_URL`
- Copiar `service_role` key → `SUPABASE_SERVICE_KEY`

#### Paso 3: Ejecutar migración SQL

1. En Supabase, ir a **SQL Editor** > **+ New Query**
2. Copiar y pegar todo el contenido de `elitebeauty-agent/supabase/migrations/001_initial.sql`
3. Click en **Run**
4. Verificar que no haya errores

#### Paso 4: Configurar variables de entorno

En `elitebeauty-agent/.env`:

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Si usas OpenAI Embeddings para RAG
OPENAI_API_KEY=sk-proj-...

# Si usas OpenRouter para LLM
OPENROUTER_API_KEY=sk-or-...

# Opcional: Twilio para voz
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# Opcional: Tavily para búsqueda web
TAVILY_API_KEY=...
```

#### Paso 5: Verificar conexión

```bash
cd elitebeauty-agent/backend
python -c "from app.db.supabase_client import get_client; print(get_client())"
```

Si no hay errores, ¡la BD está lista!

---

### Opción 2: Manual (Para entender la estructura)

#### Script de creación paso a paso

```sql
-- 1. Habilitar extensión vectorial
create extension if not exists vector;

-- 2. Crear tabla conversations
create table conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp', 'voice')),
  contact_id text not null,
  contact_name text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Crear índices en conversations
create index idx_conversations_contact on conversations(contact_id);
create index idx_conversations_status on conversations(status);
create index idx_conversations_channel on conversations(channel);
create index idx_conversations_created on conversations(created_at desc);

-- 4. Crear tabla messages
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  tokens_used int,
  latency_ms int,
  created_at timestamptz not null default now()
);

create index idx_messages_conversation on messages(conversation_id, created_at);

-- 5. Crear tabla leads
create table leads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete set null,
  channel text,
  name text,
  phone text,
  email text,
  interest text,
  budget text,
  call_duration int,
  summary text,
  status text not null default 'new',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_leads_status on leads(status);
create index idx_leads_channel on leads(channel);
create index idx_leads_created on leads(created_at desc);

-- 6. Crear tabla documents
create table documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  category text,
  source text,
  embedded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7. Crear tabla embeddings (para búsqueda vectorial)
create table embeddings (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  chunk text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index idx_embeddings_document on embeddings(document_id);
create index idx_embeddings_vec on embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- 8. Crear tabla agent_config
create table agent_config (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value text,
  description text,
  updated_at timestamptz not null default now()
);

-- 9. Función para actualizar updated_at automáticamente
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 10. Triggers para updated_at
create trigger trg_conversations_updated before update on conversations for each row execute function set_updated_at();
create trigger trg_leads_updated before update on leads for each row execute function set_updated_at();
create trigger trg_documents_updated before update on documents for each row execute function set_updated_at();
create trigger trg_config_updated before update on agent_config for each row execute function set_updated_at();

-- 11. Función para búsqueda vectorial (RAG)
create or replace function match_embeddings(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  id uuid,
  document_id uuid,
  chunk text,
  similarity float
)
language plpgsql as $$
begin
  return query
  select
    e.id,
    e.document_id,
    e.chunk,
    1 - (e.embedding <=> query_embedding) as similarity
  from embeddings e
  order by e.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 12. Insertar documentos iniciales
insert into documents (title, content, category, source) values
(
  'Procedimientos corporales — Tensamax',
  'Tensamax es un tratamiento de radiofrecuencia monopolar capacitiva y resistiva...',
  'procedimientos',
  'staff'
),
(
  'Información general y contacto',
  'Elite Beauty es un centro de estética ubicado en Bogotá, Carrera 23 #124-87...',
  'general',
  'staff'
);

-- 13. Insertar configuración por defecto
insert into agent_config (key, value, description) values
('model', 'meta-llama/llama-3.1-8b-instruct:free', 'Modelo OpenRouter activo'),
('rag_top_k', '5', 'Chunks del RAG a recuperar por consulta'),
('max_history', '6', 'Mensajes de historial a enviar al modelo'),
('cooldown_ms', '2000', 'Anti-spam: ms entre respuestas por usuario'),
('require_auth', 'false', 'Solo responder a números autorizados'),
('business_hours', '{"start":"07:00","end":"19:00","days":[1,2,3,4,5,6]}', 'Horario de atención');
```

---

## Variables de Entorno

### Backend (`.env` en raíz o en `backend/`)

```bash
# ─── Supabase (REQUERIDO) ────────────────────────────────────────
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ─── OpenRouter LLM (REQUERIDO para conversaciones) ──────────────
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free

# ─── OpenAI Embeddings (REQUERIDO para RAG) ──────────────────────
OPENAI_API_KEY=sk-proj-...

# ─── Twilio (OPCIONAL para llamadas telefónicas) ──────────────────
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# ─── Tavily (OPCIONAL para búsqueda web en RAG) ──────────────────
TAVILY_API_KEY=tvly-...

# ─── URLs de webhook (REQUERIDO si usas Twilio en prod) ──────────
PUBLIC_BASE_URL=https://tu-dominio.com  # para webhooks Twilio

# ─── Configuración de FastAPI ──────────────────────────────────
LOG_LEVEL=INFO
WORKERS=4
```

### Frontend (`.env.local` en `elitebeauty-agent/frontend/`)

```bash
VITE_API_BASE_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

### WA Bridge (`.env` en `elitebeauty-agent/backend/wa_bridge/`)

```bash
BACKEND_URL=http://localhost:8000
PORT=3001
```

---

## Glosario

| Término | Definición |
|---------|-----------|
| **RAG** | Retrieval Augmented Generation — buscar documentos relevantes antes de generar respuesta |
| **pgvector** | Extensión PostgreSQL para almacenar y buscar vectores (embeddings) |
| **Embedding** | Vector numérico (1536-dim con OpenAI) que representa el "significado" de un texto |
| **Chunk** | Fragmento pequeño de un documento (≈500 caracteres) para dividir contenido largo |
| **IVFFlat** | Algoritmo de indexación vectorial en PostgreSQL para búsqueda rápida |
| **Contact ID** | Identificador único: número WhatsApp (+57...) o ID Twilio |
| **Lead** | Cliente prospectado con datos capturados (nombre, teléfono, interés) |
| **Webhook** | Endpoint HTTP que recibe datos de servicios externos (WhatsApp, Twilio) |
| **TLS/TwiML** | Twilio Markup Language — XML para controlar llamadas telefónicas |
| **Cooldown** | Tiempo mínimo entre respuestas para evitar spam |
| **Status** | Estado actual de conversation/lead (open, closed, new, contacted, etc.) |

---

## Próximos pasos

1. **Crear la BD** — Seguir instrucciones Opción 1
2. **Configurar credenciales** — Llenar `.env` con keys reales
3. **Levantar servicios** — `docker-compose up --build` o desarrollo local
4. **Conectar WhatsApp** — Escanear QR en http://localhost:3001/panel
5. **Probar RAG** — Subir documentos en frontend → Settings
6. **Monitorear** — Dashboard en http://localhost:3000

---

**¿Preguntas?** Revisar logs con `docker-compose logs -f backend` o en FastAPI `/health`
