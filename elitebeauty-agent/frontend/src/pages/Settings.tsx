import { useEffect, useState } from 'react';
import { getConfig, setConfig } from '../lib/api';

type ConfigEntry = { key: string; value: string; description: string };

const FAST_MODELS = [
  { id: 'meta-llama/llama-3.1-8b-instruct:free', label: 'Llama 3.1 8B (Gratis, ~800ms)' },
  { id: 'google/gemma-3-4b-it:free', label: 'Gemma 3 4B (Gratis, ~600ms)' },
  { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B (Gratis, buen español)' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (Pago, mejor balance)' },
  { id: 'anthropic/claude-haiku-4-5-20251001', label: 'Claude Haiku (Pago, muy rápido)' },
];

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

  const set = (key: string, value: string) =>
    setValues(v => ({ ...v, [key]: value }));

  const getDesc = (key: string) =>
    config.find(c => c.key === key)?.description || '';

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-xl font-bold text-gray-900">Configuración del agente</h2>

      {/* Modelo */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-gray-800">Modelo OpenRouter</h3>
        <p className="text-xs text-gray-500">{getDesc('model')}</p>
        <select
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
          value={values['model'] || ''}
          onChange={e => set('model', e.target.value)}
        >
          {FAST_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <button onClick={() => save('model')} disabled={saving === 'model'} className="btn-primary text-xs">
          {saving === 'model' ? 'Guardando...' : 'Guardar modelo'}
        </button>
      </div>

      {/* Parámetros */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-800">Parámetros del agente</h3>
        {(['rag_top_k', 'max_history', 'cooldown_ms'] as const).map(key => (
          <div key={key}>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              {key} — <span className="font-normal text-gray-400">{getDesc(key)}</span>
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
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

      {/* Horario */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-gray-800">Horario de atención</h3>
        <p className="text-xs text-gray-500">JSON: {getDesc('business_hours')}</p>
        <textarea
          rows={4}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-rose-300"
          value={values['business_hours'] || ''}
          onChange={e => set('business_hours', e.target.value)}
        />
        <button onClick={() => save('business_hours')} disabled={saving === 'business_hours'} className="btn-primary text-xs">
          {saving === 'business_hours' ? 'Guardando...' : 'Guardar horario'}
        </button>
      </div>

      {/* Auth */}
      <div className="card space-y-3">
        <h3 className="font-semibold text-gray-800">Autorización</h3>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-700">Requerir autorización (require_auth)</label>
          <select
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
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

      {/* Todos los configs */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4">Configuración completa</h3>
        <div className="space-y-3">
          {config.map(c => (
            <div key={c.key} className="flex items-start gap-3">
              <div className="w-40 shrink-0">
                <p className="text-xs font-mono font-semibold text-gray-700">{c.key}</p>
                <p className="text-xs text-gray-400">{c.description}</p>
              </div>
              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-rose-300"
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
