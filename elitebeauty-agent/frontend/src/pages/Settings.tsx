import { useEffect, useState } from 'react';
import { getConfig, setConfig } from '../lib/api';

type ConfigEntry = { key: string; value: string; description: string };

const OPENROUTER_MODELS = [
  { id: 'openrouter/free',                            label: 'OpenRouter Free (auto-selección gratuita)' },
  { id: 'meta-llama/llama-3.1-8b-instruct:free',     label: 'Llama 3.1 8B (Gratis, ~800ms)' },
  { id: 'google/gemma-3-4b-it:free',                  label: 'Gemma 3 4B (Gratis, ~600ms)' },
  { id: 'mistralai/mistral-7b-instruct:free',         label: 'Mistral 7B (Gratis, buen español)' },
  { id: 'openai/gpt-4o-mini',                         label: 'GPT-4o mini (Pago, mejor balance)' },
  { id: 'anthropic/claude-haiku-4-5-20251001',        label: 'Claude Haiku via OpenRouter (Pago)' },
];

const ANTHROPIC_MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Rápido y económico)' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Alta calidad)' },
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (Premium)' },
  { id: 'claude-fable-5', label: 'Claude Fable 5' },
];

const PROVIDER_LABELS: Record<string, string> = {
  openrouter: 'OpenRouter',
  anthropic: 'Anthropic / Claude',
};

export default function Settings() {
  const [config, setConfigState] = useState<ConfigEntry[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const load = () =>
    getConfig().then((data: ConfigEntry[]) => {
      setConfigState(data);
      const map: Record<string, string> = {};
      data.forEach(c => { map[c.key] = c.value || ''; });
      setValues(map);
    }).catch(() => {
      setConfigState([]);
      setValues({});
    });

  useEffect(() => { load(); }, []);

  const save = async (key: string) => {
    setSaving(key);
    try { await setConfig(key, values[key] || ''); }
    catch {}
    finally { setSaving(null); }
  };

  const saveMany = async (keys: string[], savingKey: string) => {
    setSaving(savingKey);
    try {
      await Promise.all(keys.map(k => setConfig(k, values[k] || '')));
    } catch {}
    finally { setSaving(null); }
  };

  const set = (key: string, value: string) =>
    setValues(v => ({ ...v, [key]: value }));

  const toggle = (key: string) =>
    setValues(v => ({ ...v, [key]: v[key] === 'true' ? 'false' : 'true' }));

  const getDesc = (key: string) =>
    config.find(c => c.key === key)?.description || '';

  // Derived state
  const provider = values['llm_provider'] || 'openrouter';
  const fallbackProvider = values['chat_fallback_provider'] || 'openrouter';
  const useFallback = values['chat_use_fallback'] !== 'false';
  const useEnhancement = values['chat_use_enhancement'] === 'true';
  const useJudge = values['chat_use_judge'] === 'true';

  const modelList = (prov: string) => prov === 'anthropic' ? ANTHROPIC_MODELS : OPENROUTER_MODELS;
  const primaryModelKey = (prov: string) => prov === 'anthropic' ? 'anthropic_primary_model' : 'openrouter_primary_model';
  const fallbackModelKey = (prov: string) => prov === 'anthropic' ? 'anthropic_fallback_model' : 'openrouter_fallback_model';
  const enhancementModelKey = (prov: string) => prov === 'anthropic' ? 'anthropic_enhancement_model' : 'openrouter_enhancement_model';
  const judgeModelKey = (prov: string) => prov === 'anthropic' ? 'anthropic_judge_model' : 'openrouter_judge_model';

  const saveRouter = () => saveMany([
    'llm_provider',
    primaryModelKey(provider),
    fallbackModelKey(provider),
    'chat_fallback_provider',
    primaryModelKey(fallbackProvider),
    'chat_use_fallback',
    'chat_use_enhancement',
    enhancementModelKey(provider),
    'chat_use_judge',
    judgeModelKey(provider),
  ], 'router');

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-xl font-display font-bold text-eb-text tracking-wider uppercase">
        Configuración del agente
      </h2>

      {/* ── Router de IA ─────────────────────────────────────────────────────── */}
      <div className="card space-y-5">
        <h3 className="font-semibold text-eb-text">Router de IA</h3>

        {/* Primary provider */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-eb-muted uppercase tracking-wider">Proveedor principal</p>

          <div>
            <label className="text-xs text-eb-muted block mb-1">Proveedor</label>
            <select className="eb-select" value={provider} onChange={e => set('llm_provider', e.target.value)}>
              <option value="openrouter">OpenRouter (multi-modelo)</option>
              <option value="anthropic">Anthropic / Claude (directo)</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-eb-muted block mb-1">Modelo primario</label>
            <select
              className="eb-select"
              value={values[primaryModelKey(provider)] || ''}
              onChange={e => set(primaryModelKey(provider), e.target.value)}
            >
              {modelList(provider).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-eb-muted block mb-1">Fallback (mismo proveedor)</label>
            <select
              className="eb-select"
              value={values[fallbackModelKey(provider)] || ''}
              onChange={e => set(fallbackModelKey(provider), e.target.value)}
            >
              {modelList(provider).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        </div>

        {/* Cross-provider fallback */}
        <div className="border-t border-gray-700 pt-4 space-y-3">
          <p className="text-xs font-semibold text-eb-muted uppercase tracking-wider">Fallback cross-provider</p>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-eb-accent"
              checked={useFallback}
              onChange={() => toggle('chat_use_fallback')}
            />
            <span className="text-sm text-eb-text">Activar fallback si el proveedor principal falla</span>
          </label>

          {useFallback && (
            <>
              <div>
                <label className="text-xs text-eb-muted block mb-1">Proveedor fallback</label>
                <select
                  className="eb-select"
                  value={fallbackProvider}
                  onChange={e => set('chat_fallback_provider', e.target.value)}
                >
                  <option value="openrouter">OpenRouter</option>
                  <option value="anthropic">Anthropic / Claude</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-eb-muted block mb-1">
                  Modelo primario de {PROVIDER_LABELS[fallbackProvider]}
                </label>
                <select
                  className="eb-select"
                  value={values[primaryModelKey(fallbackProvider)] || ''}
                  onChange={e => set(primaryModelKey(fallbackProvider), e.target.value)}
                >
                  {modelList(fallbackProvider).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
            </>
          )}
        </div>

        {/* Enhancement & Judge */}
        <div className="border-t border-gray-700 pt-4 space-y-3">
          <p className="text-xs font-semibold text-eb-muted uppercase tracking-wider">Post-procesamiento</p>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-eb-accent"
                checked={useEnhancement}
                onChange={() => toggle('chat_use_enhancement')}
              />
              <span className="text-sm text-eb-text">Enhancement — mejorar tono y claridad</span>
            </label>

            {useEnhancement && (
              <div className="ml-6">
                <label className="text-xs text-eb-muted block mb-1">Modelo de enhancement</label>
                <select
                  className="eb-select"
                  value={values[enhancementModelKey(provider)] || ''}
                  onChange={e => set(enhancementModelKey(provider), e.target.value)}
                >
                  {modelList(provider).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-eb-accent"
                checked={useJudge}
                onChange={() => toggle('chat_use_judge')}
              />
              <span className="text-sm text-eb-text">Judge — evaluar seguridad (precios / riesgo médico)</span>
            </label>

            {useJudge && (
              <div className="ml-6">
                <label className="text-xs text-eb-muted block mb-1">Modelo juez</label>
                <select
                  className="eb-select"
                  value={values[judgeModelKey(provider)] || ''}
                  onChange={e => set(judgeModelKey(provider), e.target.value)}
                >
                  {modelList(provider).map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        <button
          onClick={saveRouter}
          disabled={saving === 'router'}
          className="btn-primary text-xs"
        >
          {saving === 'router' ? 'Guardando...' : 'Guardar router'}
        </button>
      </div>

      {/* ── Parámetros ───────────────────────────────────────────────────────── */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-eb-text">Parámetros</h3>
        {[
          { key: 'chat_temperature',  label: 'Temperature',      step: '0.05' },
          { key: 'chat_top_p',        label: 'Top P',            step: '0.05' },
          { key: 'chat_max_tokens',   label: 'Max tokens chat',  step: '50'   },
          { key: 'rag_top_k',         label: 'RAG top_k',        step: '1'    },
          { key: 'max_history',       label: 'Max history',      step: '1'    },
          { key: 'cooldown_ms',       label: 'Cooldown (ms)',     step: '100'  },
        ].map(({ key, label, step }) => (
          <div key={key}>
            <label className="text-xs font-medium text-eb-muted block mb-1">
              {label} — <span className="font-normal text-eb-dim">{getDesc(key)}</span>
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step={step}
                className="eb-input flex-1"
                value={values[key] || ''}
                onChange={e => set(key, e.target.value)}
              />
              <button onClick={() => save(key)} disabled={saving === key} className="btn-secondary text-xs">
                {saving === key ? '...' : 'Guardar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Horario ──────────────────────────────────────────────────────────── */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-eb-text">Horario de atención</h3>
        <p className="text-xs text-eb-dim">JSON: {getDesc('business_hours')}</p>
        <textarea
          rows={4}
          className="eb-input font-mono"
          value={values['business_hours'] || ''}
          onChange={e => set('business_hours', e.target.value)}
        />
        <button onClick={() => save('business_hours')} disabled={saving === 'business_hours'} className="btn-primary text-xs">
          {saving === 'business_hours' ? 'Guardando...' : 'Guardar horario'}
        </button>
      </div>

      {/* ── Autorización ─────────────────────────────────────────────────────── */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-eb-text">Autorización</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm text-eb-muted">Requerir autorización (require_auth)</label>
          <select
            className="eb-select text-sm"
            style={{ width: 'auto', flex: '1', minWidth: '180px' }}
            value={values['require_auth'] || 'false'}
            onChange={e => set('require_auth', e.target.value)}
          >
            <option value="false">No — responder a todos</option>
            <option value="true">Sí — solo autorizados</option>
          </select>
          <button onClick={() => save('require_auth')} disabled={saving === 'require_auth'} className="btn-secondary text-xs">
            {saving === 'require_auth' ? '...' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* ── Configuración completa ───────────────────────────────────────────── */}
      <div className="card">
        <h3 className="font-semibold text-eb-text mb-4">Configuración completa</h3>
        <div className="space-y-3">
          {config.map(c => (
            <div key={c.key} className="flex items-start gap-3">
              <div className="w-44 shrink-0">
                <p className="text-xs font-mono font-semibold text-eb-muted">{c.key}</p>
                <p className="text-xs text-eb-dim">{c.description}</p>
              </div>
              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  className="eb-input flex-1 font-mono text-xs"
                  value={values[c.key] || ''}
                  onChange={e => set(c.key, e.target.value)}
                />
                <button onClick={() => save(c.key)} disabled={saving === c.key} className="btn-secondary text-xs py-1 px-3">
                  {saving === c.key ? '...' : '💾'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
