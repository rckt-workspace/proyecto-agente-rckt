import { useEffect, useState } from 'react';
import { getConversations, getConversation, patchConversation } from '../lib/api';

type Conv = Record<string, any>;

const statusColors: Record<string, string> = {
  open:       'bg-green-500/10 text-green-400',
  closed:     'bg-eb-700 text-eb-muted',
  follow_up:  'bg-yellow-500/10 text-yellow-400',
};

const BORDER = 'rgba(34, 25, 50, 1)';

export default function Conversations() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [selected, setSelected] = useState<Conv | null>(null);
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    getConversations(filter)
      .then(setConvs)
      .catch(() => setConvs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const openDetail = (id: string) =>
    getConversation(id).then(setSelected).catch(() => setSelected(null));

  const changeStatus = async (id: string, status: string) => {
    try {
      await patchConversation(id, { status });
      load();
      if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : prev);
    } catch {}
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-112px)]">
      {/* Lista */}
      <div className="w-80 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-display font-bold text-eb-text flex-1 tracking-wider uppercase">
            Conversaciones
          </h2>
          <button onClick={load} className="btn-secondary text-xs py-1">🔄</button>
        </div>
        <div className="flex gap-2">
          <select
            className="eb-select flex-1 text-xs px-2 py-1.5"
            onChange={e => setFilter(f => ({ ...f, status: e.target.value || '' }))}
          >
            <option value="">Todos los estados</option>
            <option value="open">Abiertos</option>
            <option value="closed">Cerrados</option>
            <option value="follow_up">Seguimiento</option>
          </select>
          <select
            className="eb-select flex-1 text-xs px-2 py-1.5"
            onChange={e => setFilter(f => ({ ...f, channel: e.target.value || '' }))}
          >
            <option value="">Todos los canales</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="voice">Voz</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {loading && <p className="text-sm text-eb-dim text-center pt-6">Cargando...</p>}
          {convs.map(c => (
            <button
              key={c.id}
              onClick={() => openDetail(c.id)}
              className={`w-full text-left card p-3 transition-all duration-200 ${
                selected?.id === c.id ? 'border-rose-500/40' : ''
              }`}
              style={
                selected?.id === c.id
                  ? { background: 'rgba(225,29,72,0.06)', borderColor: 'rgba(225,29,72,0.35)' }
                  : {}
              }
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-eb-text">
                  {c.channel === 'voice' ? '📞' : '💬'} {c.contact_name || c.contact_id}
                </span>
                <span className={`badge ${statusColors[c.status] || 'bg-eb-700 text-eb-muted'}`}>
                  {c.status}
                </span>
              </div>
              <p className="text-xs text-eb-dim">
                {new Date(c.updated_at).toLocaleString('es-CO')}
              </p>
            </button>
          ))}
          {!loading && convs.length === 0 && (
            <p className="text-sm text-eb-dim text-center pt-6">Sin conversaciones</p>
          )}
        </div>
      </div>

      {/* Detalle */}
      <div className="flex-1 card overflow-hidden flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-eb-dim text-sm">
            Selecciona una conversación
          </div>
        ) : (
          <>
            <div
              className="flex items-center justify-between pb-3 mb-3"
              style={{ borderBottom: `1px solid ${BORDER}` }}
            >
              <div>
                <h3 className="font-bold text-eb-text">
                  {selected.channel === 'voice' ? '📞' : '💬'} {selected.contact_name || selected.contact_id}
                </h3>
                <p className="text-xs text-eb-dim">{new Date(selected.created_at).toLocaleString('es-CO')}</p>
              </div>
              <select
                value={selected.status}
                onChange={e => changeStatus(selected.id, e.target.value)}
                className="eb-select text-xs px-2 py-1.5"
                style={{ width: 'auto' }}
              >
                <option value="open">Abierto</option>
                <option value="closed">Cerrado</option>
                <option value="follow_up">Seguimiento</option>
              </select>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {(selected.messages || []).map((m: any) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md rounded-2xl px-4 py-2.5 text-sm ${
                      m.role === 'assistant'
                        ? 'text-eb-text'
                        : m.role === 'user'
                        ? 'bg-rose-600 text-white'
                        : 'text-eb-dim text-xs italic'
                    }`}
                    style={
                      m.role === 'assistant'
                        ? { background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}` }
                        : m.role !== 'user'
                        ? { background: 'rgba(255,255,255,0.03)', border: `1px solid ${BORDER}` }
                        : {}
                    }
                  >
                    {m.content}
                    {m.latency_ms && (
                      <p className="text-xs opacity-50 mt-1">{m.latency_ms}ms</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
