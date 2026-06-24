import { useEffect, useState } from 'react';
import { getMessagesByDay, getLeadsStats, getResponseTime, getTopIntents, getOverview } from '../lib/api';
import MessagesChart from '../components/charts/MessagesChart';
import LeadsFunnelChart from '../components/charts/LeadsFunnelChart';
import ResponseTimeChart from '../components/charts/ResponseTimeChart';
import KPICard from '../components/KPICard';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const PERIODS = ['7d', '30d', '90d'];
const PIE_COLORS = ['#e11d48', '#7c3aed'];

export default function Analytics() {
  const [period, setPeriod] = useState('7d');
  const [overview, setOverview] = useState<Record<string, number>>({});
  const [msgs, setMsgs] = useState<any[]>([]);
  const [leadsStats, setLeadsStats] = useState<any[]>([]);
  const [rt, setRt] = useState<any[]>([]);
  const [intents, setIntents] = useState<any[]>([]);

  useEffect(() => {
    getOverview().then(setOverview).catch(() => setOverview({}));
    getTopIntents().then(setIntents).catch(() => setIntents([]));
  }, []);

  useEffect(() => {
    getMessagesByDay(period).then(setMsgs).catch(() => setMsgs([]));
    getLeadsStats(period).then(setLeadsStats).catch(() => setLeadsStats([]));
    getResponseTime(period).then(setRt).catch(() => setRt([]));
  }, [period]);

  // Pie: WA vs Voice
  const channelData = leadsStats.reduce((acc: Record<string, number>, item: any) => {
    acc[item.channel] = (acc[item.channel] || 0) + item.count;
    return acc;
  }, {});
  const pieData = Object.entries(channelData).map(([name, value]) => ({ name, value }));

  // Top intents para barras
  const intentsForChart = intents.map(i => ({ interest: i.interest, count: i.count }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Analítica</h2>
        <div className="flex gap-1.5">
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                period === p ? 'bg-rose-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs 30d */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Conv. totales 30d" value={overview.total_conversations_30d ?? '—'} color="rose" />
        <KPICard label="Leads totales 30d" value={overview.total_leads_30d ?? '—'} color="purple" />
        <KPICard label="Resp. promedio" value={overview.avg_response_ms ? `${overview.avg_response_ms}ms` : '—'} color="blue" />
        <KPICard label="Leads hoy" value={overview.leads_today ?? '—'} color="green" />
      </div>

      {/* Mensajes por día */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4">Mensajes por día</h3>
        {msgs.length ? <MessagesChart data={msgs} /> : (
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top intents */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Procedimientos más consultados</h3>
          {intentsForChart.length ? <LeadsFunnelChart data={intentsForChart} /> : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
          )}
        </div>

        {/* Distribución canal */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Distribución por canal</h3>
          {pieData.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
          )}
        </div>
      </div>

      {/* Tiempo de respuesta */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4">Latencia de respuesta</h3>
        {rt.length ? <ResponseTimeChart data={rt} /> : (
          <div className="h-36 flex items-center justify-center text-gray-400 text-sm">Sin datos</div>
        )}
      </div>

      {/* Tabla top intents */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4">Top consultas</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="pb-2 font-semibold">#</th>
              <th className="pb-2 font-semibold">Procedimiento</th>
              <th className="pb-2 font-semibold">Leads</th>
            </tr>
          </thead>
          <tbody>
            {intents.slice(0, 8).map((item, i) => (
              <tr key={item.interest} className="border-b border-gray-50">
                <td className="py-2 text-gray-400">{i + 1}</td>
                <td className="py-2 font-medium capitalize text-gray-800">{item.interest}</td>
                <td className="py-2 text-rose-600 font-bold">{item.count}</td>
              </tr>
            ))}
            {intents.length === 0 && (
              <tr><td colSpan={3} className="text-center py-4 text-gray-400">Sin datos</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
