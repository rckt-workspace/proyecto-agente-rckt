-- ─────────────────────────────────────────────────────────────────────────────
-- Migración 002: embeddings vector(1536) → vector(384)
-- Necesaria para sentence-transformers/all-MiniLM-L6-v2 (EMBEDDINGS_PROVIDER=local)
--
-- EJECUTAR EN SUPABASE SQL EDITOR antes de reindexar documentos.
-- Es seguro porque la tabla embeddings estaba vacía (embedded=false en todos los docs).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Eliminar funciones y objetos que dependen de vector(1536)
drop function if exists match_embeddings(vector(1536), int);
drop function if exists match_embeddings_v2(vector(1536), int, float);
drop index  if exists idx_embeddings_vec;

-- 2. Recrear tabla embeddings con dimensión 384 y campo chunk_index
drop table if exists embeddings;

create table embeddings (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  chunk_index int  not null default 0,
  chunk       text not null,
  embedding   vector(384),
  created_at  timestamptz not null default now()
);

create index idx_embeddings_document on embeddings(document_id);
create index idx_embeddings_chunk    on embeddings(document_id, chunk_index);
create index idx_embeddings_vec
  on embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 3. Resetear embedded=false en todos los documentos existentes
--    (fuerza la reindexación con el nuevo motor)
update documents set embedded = false;

-- 4. Función match_embeddings para vector(384)
create or replace function match_embeddings(
  query_embedding vector(384),
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
  where e.embedding is not null
  order by e.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 5. Función match_embeddings_v2 — incluye chunk_index y filtro de similitud mínima
create or replace function match_embeddings_v2(
  query_embedding vector(384),
  match_count     int   default 5,
  min_similarity  float default 0.3
)
returns table (
  id          uuid,
  document_id uuid,
  chunk       text,
  chunk_index int,
  similarity  float
)
language plpgsql as $$
begin
  return query
  select
    e.id,
    e.document_id,
    e.chunk,
    e.chunk_index,
    1 - (e.embedding <=> query_embedding) as similarity
  from embeddings e
  where e.embedding is not null
    and 1 - (e.embedding <=> query_embedding) >= min_similarity
  order by e.embedding <=> query_embedding
  limit match_count;
end;
$$;
