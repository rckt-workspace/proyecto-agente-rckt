import { useEffect, useState } from 'react';
import { getConversations, getConversation, patchConversation } from '../lib/api';

type Conv = Record<string, any>;

const statusColors: Record<string, string> = {
  open: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-600',
  follow_up: 'bg-yellow-100 text-yellow-700',
};

export default function Conversations() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [selected, setSelected] = useState<Conv | null>(null);
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    getConversations(filter).then(setConvs).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const openDetail = (id: string) =>
    getConversation(id).then(setSelected);

  const changeStatus = async (id: string, status: string) => {
    await patchConversation(id, { status });
    load();
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : prev);
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-112px)]">
      {/* Lista */}
      <div className="w-80 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-gray-900 flex-1">Conversaciones</h2>
          <button onClick={load} className="btn-secondary text-xs py-1">🔄</button>
        </div>
        <div className="flex gap-2">
          <select
            className="flex-1 border border-gray-200 rounded-lg text-xs px-2 py-1.5"
            onChange={e => setFilter(f => ({ ...f, status: e.target.value || '' }))}
          >
            <option value="">Todos los estados</option>
            <option value="open">Abiertos</option>
            <option value="closed">Cerrados</option>
            <option value="follow_up">Seguimiento</option>
          </select>
          <select
            className="flex-1 border border-gray-200 rounded-lg text-xs px-2 py-1.5"
            onChange={e => setFilter(f => ({ ...f, channel: e.target.value || '' }))}
          >
            <option value="">Todos los canales</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="voice">Voz</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {loading && <p className="text-sm text-gray-400 text-center pt-6">Cargando...</p>}
          {convs.map(c => (
            <button
              key={c.id}
              onClick={() => openDetail(c.id)}
              className={`w-full text-left card p-3 hover:border-rose-200 transition-colors ${
                selected?.id === c.id ? 'border-rose-400 bg-rose-50' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-700">
                  {c.channel === 'voice' ? '📞' : '💬'} {c.contact_name || c.contact_id}
                </span>
                <span className={`badge ${statusColors[c.status] || 'bg-gray-100 text-gray-500'}`}>
                  {c.status}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                {new Date(c.updated_at).toLocaleString('es-CO')}
              </p>
            </button>
          ))}
          {!loading && convs.length === 0 && (
            <p className="text-sm text-gray-400 text-center pt-6">Sin conversaciones</p>
          )}
        </div>
      </div>

      {/* Detalle */}
      <div className="flex-1 card overflow-hidden flex flex-col">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Selecciona una conversación
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900">
                  {selected.channel === 'voice' ? '📞' : '💬'} {selected.contact_name || selected.contact_id}
                </h3>
                <p className="text-xs text-gray-400">{new Date(selected.created_at).toLocaleString('es-CO')}</p>
              </div>
              <select
                value={selected.status}
                onChange={e => changeStatus(selected.id, e.target.value)}
                className="border border-gray-200 rounded-lg text-xs px-2 py-1.5"
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
                        ? 'bg-white border border-gray-200 text-gray-700'
                        : m.role === 'user'
                        ? 'bg-rose-600 text-white'
                        : 'bg-gray-100 text-gray-500 text-xs italic'
                    }`}
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
