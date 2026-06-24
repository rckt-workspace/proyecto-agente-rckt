import { useEffect, useState } from 'react';
import { getLeads, patchLead, exportLeadsUrl } from '../lib/api';

type Lead = Record<string, any>;

const statusOptions = ['new', 'contacted', 'scheduled', 'closed'];
const statusColors: Record<string, string> = {
  new:       'bg-blue-500/10 text-blue-400',
  contacted: 'bg-yellow-500/10 text-yellow-400',
  scheduled: 'bg-purple-500/10 text-purple-400',
  closed:    'bg-green-500/10 text-green-400',
};

const BORDER = 'rgba(34, 25, 50, 1)';

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
        <h2 className="text-xl font-display font-bold text-eb-text tracking-wider uppercase">Leads</h2>
        <div className="flex items-center gap-2">
          <a href={exportLeadsUrl()} className="btn-secondary text-xs" download>
            ⬇️ Exportar CSV
          </a>
          <button onClick={load} className="btn-secondary text-xs">🔄</button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {['new', 'contacted', 'scheduled', 'closed'].map(s => (
          <button
            key={s}
            onClick={() => setFilter(f => ({ ...f, status: f.status === s ? '' : s }))}
            className={`badge cursor-pointer transition-all ${
              filter.status === s ? statusColors[s] : 'text-eb-dim'
            }`}
            style={
              filter.status !== s
                ? { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }
                : {}
            }
          >
            {s}
          </button>
        ))}
        <button
          onClick={() => setFilter({})}
          className="badge cursor-pointer text-eb-dim"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          Todos
        </button>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ background: 'rgba(17, 13, 25, 0.8)', borderBottom: `1px solid ${BORDER}` }}>
              <tr>
                {['Nombre', 'Teléfono', 'Canal', 'Interés', 'Estado', 'Fecha', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-eb-dim uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-eb-dim">Cargando...</td>
                </tr>
              )}
              {!loading && leads.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-eb-dim">Sin leads aún</td>
                </tr>
              )}
              {leads.map(lead => (
                <tr
                  key={lead.id}
                  className="transition-colors"
                  style={{ borderBottom: `1px solid ${BORDER}` }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td className="px-4 py-3 font-medium text-eb-text">{lead.name || '—'}</td>
                  <td className="px-4 py-3 text-eb-muted">{lead.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className="badge text-eb-muted"
                      style={{ background: 'rgba(255,255,255,0.05)' }}
                    >
                      {lead.channel === 'voice' ? '📞 Voz' : '💬 WA'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-eb-muted">{lead.interest || '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={lead.status}
                      onChange={e => changeStatus(lead.id, e.target.value)}
                      className={`badge border-0 cursor-pointer ${statusColors[lead.status] || 'text-eb-muted'}`}
                      style={
                        !statusColors[lead.status]
                          ? { background: 'rgba(255,255,255,0.05)' }
                          : {}
                      }
                    >
                      {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-eb-dim text-xs">
                    {new Date(lead.created_at).toLocaleDateString('es-CO')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelected(lead)}
                      className="text-rose-400 hover:text-rose-300 text-xs font-medium transition-colors"
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
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
          <div
            className="rounded-2xl p-6 w-full max-w-lg shadow-2xl"
            style={{
              background: 'linear-gradient(160deg, rgba(30,23,46,0.98), rgba(22,17,32,0.99))',
              border: `1px solid ${BORDER}`,
              boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 40px rgba(225,29,72,0.08)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-eb-text">{selected.name || 'Lead sin nombre'}</h3>
              <button
                onClick={() => setSelected(null)}
                className="text-eb-dim hover:text-eb-text text-xl transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              {([
                ['Teléfono', selected.phone], ['Email', selected.email],
                ['Canal', selected.channel], ['Interés', selected.interest],
                ['Presupuesto', selected.budget],
                ['Duración llamada', selected.call_duration ? `${selected.call_duration}s` : null],
                ['Estado', selected.status],
                ['Fecha', new Date(selected.created_at).toLocaleString('es-CO')],
              ] as [string, any][]).map(([k, v]) => v ? (
                <div key={k}>
                  <p className="text-xs text-eb-dim font-medium">{k}</p>
                  <p className="text-eb-text">{v}</p>
                </div>
              ) : null)}
            </div>
            {selected.summary && (
              <div
                className="rounded-xl p-3 text-sm text-eb-text"
                style={{ background: 'rgba(225,29,72,0.08)', border: '1px solid rgba(225,29,72,0.2)' }}
              >
                <p className="font-semibold text-rose-400 mb-1">Resumen IA</p>
                {selected.summary}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
