-- Migration 003: LLM Router configuration keys
-- Adds/updates agent_config entries for the multi-provider LLM router.
-- Safe to re-run: uses ON CONFLICT DO UPDATE.

insert into public.agent_config (key, value, description)
values
  -- ── Provider routing ──────────────────────────────────────────────────────
  ('llm_provider',             'openrouter',                   'Proveedor LLM principal: openrouter | anthropic'),
  ('chat_fallback_provider',   'openrouter',                   'Proveedor usado si falla el principal completo'),

  -- ── Pipeline flags ────────────────────────────────────────────────────────
  ('chat_use_fallback',        'true',                         'Activar fallback automático al fallo del primario'),
  ('chat_use_enhancement',     'false',                        'Activar mejora de tono/claridad post-respuesta'),
  ('chat_use_judge',           'false',                        'Activar evaluación de seguridad (precio/riesgo médico)'),

  -- ── LLM parameters ────────────────────────────────────────────────────────
  ('chat_temperature',         '0.2',                          'Temperatura del LLM (0.0–1.0)'),
  ('chat_top_p',               '0.8',                          'Top-P del LLM (0.0–1.0)'),
  ('chat_max_tokens',          '900',                          'Máximo de tokens en la respuesta de chat'),

  -- ── OpenRouter models by role ─────────────────────────────────────────────
  ('openrouter_primary_model',     'openrouter/free',                          'Modelo primario de OpenRouter'),
  ('openrouter_fallback_model',    'meta-llama/llama-3.1-8b-instruct:free',    'Modelo fallback de OpenRouter'),
  ('openrouter_enhancement_model', 'openrouter/free',                          'Modelo de mejora de respuesta (OpenRouter)'),
  ('openrouter_judge_model',       'openrouter/free',                          'Modelo juez de seguridad (OpenRouter)'),

  -- ── Anthropic models by role ─────────────────────────────────────────────
  ('anthropic_primary_model',      'claude-3-5-sonnet-latest',   'Modelo primario de Anthropic'),
  ('anthropic_fallback_model',     'claude-3-5-haiku-latest',    'Modelo fallback de Anthropic'),
  ('anthropic_enhancement_model',  'claude-3-5-haiku-latest',    'Modelo de mejora de respuesta (Anthropic)'),
  ('anthropic_judge_model',        'claude-3-5-haiku-latest',    'Modelo juez de seguridad (Anthropic)')

on conflict (key) do update
  set
    value       = excluded.value,
    description = excluded.description,
    updated_at  = now();
