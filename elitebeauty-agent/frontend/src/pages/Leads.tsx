import { useEffect, useState } from 'react';
import { getLeads, patchLead, exportLeadsUrl } from '../lib/api';

type Lead = Record<string, any>;

const statusOptions = ['new', 'contacted', 'scheduled', 'closed'];
const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  contacted: 'bg-yellow-100 text-yellow-700',
  scheduled: 'bg-purple-100 text-purple-700',
  closed: 'bg-green-100 text-green-700',
};

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [filter, setFilter] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    getLeads(filter)
      .then(setLeads)
      .catch(() => setLeads([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const changeStatus = async (id: string, status: string) => {
    try {
      await patchLead(id, { status });
      load();
      setSelected(prev => prev?.id === id ? { ...prev, status } : prev);
    } catch {}
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Leads</h2>
        <div className="flex items-center gap-2">
          <a href={exportLeadsUrl()} className="btn-secondary text-xs" download>
            ⬇️ Exportar CSV
          </a>
          <button onClick={load} className="btn-secondary text-xs">🔄</button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {['new', 'contacted', 'scheduled', 'closed'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(f => ({ ...f, status: f.status === s ? '' : s }))}
            className={`badge cursor-pointer ${filter.status === s ? statusColors[s] : 'bg-gray-100 text-gray-600'}`}
          >
            {s}
          </button>
        ))}
        <button onClick={() => setFilter({})} className="badge bg-gray-100 text-gray-600 cursor-pointer">
          Todos
        </button>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Nombre', 'Teléfono', 'Canal', 'Interés', 'Estado', 'Fecha', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Cargando...</td></tr>
              )}
              {!loading && leads.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Sin leads aún</td></tr>
              )}
              {leads.map(lead => (
                <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{lead.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{lead.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="badge bg-gray-100 text-gray-600">
                      {lead.channel === 'voice' ? '📞 Voz' : '💬 WA'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{lead.interest || '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={lead.status}
                      onChange={e => changeStatus(lead.id, e.target.value)}
                      className={`badge border-0 cursor-pointer ${statusColors[lead.status] || 'bg-gray-100 text-gray-600'}`}
                    >
                      {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(lead.created_at).toLocaleDateString('es-CO')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(lead)}
                      className="text-rose-600 hover:text-rose-800 text-xs font-medium"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal detalle */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-gray-900">{selected.name || 'Lead sin nombre'}</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              {[
                ['Teléfono', selected.phone], ['Email', selected.email],
                ['Canal', selected.channel], ['Interés', selected.interest],
                ['Presupuesto', selected.budget], ['Duración llamada', selected.call_duration ? `${selected.call_duration}s` : null],
                ['Estado', selected.status], ['Fecha', new Date(selected.created_at).toLocaleString('es-CO')],
              ].map(([k, v]) => v ? (
                <div key={k as string}>
                  <p className="text-xs text-gray-400 font-medium">{k}</p>
                  <p className="text-gray-800">{v}</p>
                </div>
              ) : null)}
            </div>
            {selected.summary && (
              <div className="bg-rose-50 rounded-lg p-3 text-sm text-gray-700">
                <p className="font-semibold text-rose-600 mb-1">Resumen IA</p>
                {selected.summary}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
