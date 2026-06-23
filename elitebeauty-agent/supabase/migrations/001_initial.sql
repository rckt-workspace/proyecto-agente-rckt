-- ─────────────────────────────────────────────────────────────────────────────
-- Elite Beauty Agent — Schema inicial
-- Ejecutar en Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists vector;

-- ─── Conversaciones ───────────────────────────────────────────────────────────
create table if not exists conversations (
  id           uuid primary key default gen_random_uuid(),
  channel      text not null check (channel in ('whatsapp', 'voice')),
  contact_id   text not null,
  contact_name text,
  status       text not null default 'open' check (status in ('open', 'closed', 'follow_up')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_conversations_contact on conversations(contact_id);
create index if not exists idx_conversations_status  on conversations(status);
create index if not exists idx_conversations_channel on conversations(channel);
create index if not exists idx_conversations_created on conversations(created_at desc);

-- ─── Mensajes ─────────────────────────────────────────────────────────────────
create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  tokens_used     int,
  latency_ms      int,
  created_at      timestamptz not null default now()
);

create index if not exists idx_messages_conversation on messages(conversation_id, created_at);

-- ─── Leads ────────────────────────────────────────────────────────────────────
create table if not exists leads (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete set null,
  channel         text,
  name            text,
  phone           text,
  email           text,
  interest        text,
  budget          text,
  call_duration   int,
  summary         text,
  status          text not null default 'new' check (status in ('new', 'contacted', 'scheduled', 'closed')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_leads_status  on leads(status);
create index if not exists idx_leads_channel on leads(channel);
create index if not exists idx_leads_created on leads(created_at desc);

-- ─── Documentos RAG ───────────────────────────────────────────────────────────
create table if not exists documents (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  content    text not null,
  category   text check (category in ('procedimientos', 'precios', 'tecnologia', 'faqs', 'horarios', 'general')),
  source     text,
  embedded   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Embeddings ───────────────────────────────────────────────────────────────
create table if not exists embeddings (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  chunk       text not null,
  embedding   vector(1536),
  created_at  timestamptz not null default now()
);

create index if not exists idx_embeddings_document on embeddings(document_id);
create index if not exists idx_embeddings_vec
  on embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ─── Configuración del agente ─────────────────────────────────────────────────
create table if not exists agent_config (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  value       text,
  description text,
  updated_at  timestamptz not null default now()
);

insert into agent_config (key, value, description) values
  ('model',          'meta-llama/llama-3.1-8b-instruct:free', 'Modelo OpenRouter activo'),
  ('rag_top_k',      '5',       'Chunks del RAG a recuperar por consulta'),
  ('max_history',    '6',       'Mensajes de historial a enviar al modelo'),
  ('cooldown_ms',    '2000',    'Anti-spam: ms entre respuestas por usuario'),
  ('require_auth',   'false',   'Solo responder a números autorizados'),
  ('business_hours', '{"start":"07:00","end":"19:00","days":[1,2,3,4,5,6]}', 'Horario de atención')
on conflict (key) do nothing;

-- ─── Función updated_at automático ───────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_conversations_updated
  before update on conversations
  for each row execute function set_updated_at();

create trigger trg_leads_updated
  before update on leads
  for each row execute function set_updated_at();

create trigger trg_documents_updated
  before update on documents
  for each row execute function set_updated_at();

create trigger trg_config_updated
  before update on agent_config
  for each row execute function set_updated_at();

-- ─── Documentos base de Elite Beauty ─────────────────────────────────────────
insert into documents (title, content, category, source) values
(
  'Procedimientos corporales — Tensamax',
  'Tensamax es un tratamiento de radiofrecuencia monopolar capacitiva y resistiva. Reduce grasa localizada, elimina celulitis, redefine curvas y estimula la producción de colágeno y elastina. Ideal para zona abdominal, muslos, glúteos y brazos. Los resultados son visibles desde la primera sesión y mejoran con el tiempo. Se recomienda un ciclo de 6 a 10 sesiones según el área y objetivo del paciente.',
  'procedimientos', 'staff'
),
(
  'Procedimientos faciales — Hydrash',
  'Hydrash es un tratamiento de hidrodermoabrasión que combina oxígeno hiperbárico con soluciones acuosas supersónicas. Exfolia la piel profundamente, elimina células muertas y puntos negros, mejora la luminosidad, textura y tono de la piel. Apto para todo tipo de piel. Recomendado para piel opaca, con manchas leves, acné o poros dilatados. Requiere de 4 a 6 sesiones para resultados óptimos.',
  'procedimientos', 'staff'
),
(
  'Procedimientos faciales — O2toDerm',
  'O2toDerm es una terapia de infusión de oxígeno con aniones negativos. Previene el envejecimiento prematuro, estimula la regeneración celular, mejora el sistema inmunológico de la piel y le aporta hidratación profunda. Ideal como mantenimiento o combinado con otros tratamientos faciales. Resultados: piel más firme, luminosa e hidratada.',
  'procedimientos', 'staff'
),
(
  'Próximamente — Removall Trio depilación láser',
  'Removall Trio es el equipo de depilación láser más avanzado del mercado, con triple longitud de onda: 755nm (Alexandrita), 810nm (Diodo) y 1064nm (Nd:YAG). Eficaz en todo tipo de piel y tono de vello. Rápido, efectivo y con mínimas molestias. Próximamente disponible en Elite Beauty.',
  'procedimientos', 'staff'
),
(
  'Información general y contacto',
  'Elite Beauty es un centro de estética y belleza ubicado en Bogotá, Colombia, en la Carrera 23 #124-87, Torre 2, Consultorio 602. Teléfono y WhatsApp: +57 301 444 6646. Email: contacto@elitebeauty.com.co. Instagram: @elitebeautycol. Web: https://elitebeauty.com.co. Nuestro equipo está conformado por médicos, esteticistas y cosmetólogos especializados. Ofrecemos valoración gratuita.',
  'general', 'staff'
),
(
  'Preguntas frecuentes',
  'P: ¿Cuántas sesiones necesito? R: Depende del tratamiento y objetivo, entre 4 y 10 sesiones. P: ¿Duele? R: Los tratamientos son mínimamente invasivos, con leve sensación de calor o presión. P: ¿Cuánto cuestan? R: Los precios varían según valoración personalizada. P: ¿Necesito preparación? R: Se indica en la consulta de valoración. P: ¿Cuánto dura cada sesión? R: Entre 45 y 90 minutos según el procedimiento.',
  'faqs', 'staff'
)
on conflict do nothing;

-- ─── Función match_embeddings para búsqueda vectorial ────────────────────────
create or replace function match_embeddings(
  query_embedding vector(1536),
  match_count     int default 5
)
returns table (
  id          uuid,
  document_id uuid,
  chunk       text,
  similarity  float
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
