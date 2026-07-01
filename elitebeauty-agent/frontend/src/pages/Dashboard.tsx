import { useEffect, useState, useCallback } from 'react';
import KPICard from '../components/KPICard';
import MessagesChart from '../components/charts/MessagesChart';
import { getOverview, getMessagesByDay, sendChat } from '../lib/api';
import { useWebSocket, type WSEvent } from '../lib/ws';

type Feed = { type: string; from?: string; body?: string; response?: string; user_said?: string; agent_said?: string; ts: string };

export default function Dashboard({ setShowQR: _setShowQR }: { setShowQR: (v: boolean) => void }) {
  const [overview, setOverview] = useState<Record<string, number>>({});
  const [msgData, setMsgData] = useState<any[]>([]);
  const [feed, setFeed] = useState<Feed[]>([]);
  const [chatMsg, setChatMsg] = useState('');
  const [chatReply, setChatReply] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const load = () => {
    getOverview().then(setOverview).catch(() => {});
    getMessagesByDay('7d').then(setMsgData).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleEvent = useCallback((e: WSEvent) => {
    if (e.type === 'new_message' || e.type === 'call_event') {
      const d = e.data as any;
      setFeed(prev => [{
        type: e.type,
        from: d.from || d.call_sid,
        body: d.body || d.user_said,
        response: d.response || d.agent_said,
        ts: new Date().toLocaleTimeString('es-CO'),
      }, ...prev].slice(0, 20));
      load();
    }
  }, []);

  useWebSocket(handleEvent);

  const testChat = async () => {
    if (!chatMsg.trim()) return;
    setChatLoading(true);
    try {
      const data = await sendChat(chatMsg);
      setChatReply(data.response || '');
    } catch (err: any) {
      console.error('[Dashboard] Error llamando /api/chat:', err);
      const isTimeout = err?.code === 'ECONNABORTED' || err?.code === 'ERR_CANCELED';
      setChatReply(
        isTimeout
          ? 'Sofia está tardando más de lo normal. Intenta de nuevo en unos segundos.'
          : 'No se pudo conectar con el backend. Verifica que el servicio esté activo.'
      );
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold text-eb-text tracking-wider uppercase">Dashboard</h2>
        <button onClick={load} className="btn-secondary text-xs">🔄 Actualizar</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Conversaciones hoy" value={overview.conversations_today ?? '—'} color="rose" />
        <KPICard label="Leads nuevos hoy" value={overview.leads_today ?? '—'} color="purple" />
        <KPICard label="Llamadas hoy" value={overview.calls_today ?? '—'} color="blue" />
        <KPICard label="Resp. promedio" value={overview.avg_response_ms ? `${overview.avg_response_ms}ms` : '—'} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfica mensajes */}
        <div className="card">
          <h3 className="font-semibold text-eb-text mb-4">Mensajes últimos 7 días</h3>
          {msgData.length ? <MessagesChart data={msgData} /> : (
            <div className="h-48 flex items-center justify-center text-eb-dim text-sm">Sin datos aún</div>
          )}
        </div>

        {/* Chat de prueba */}
        <div className="card flex flex-col gap-3">
          <h3 className="font-semibold text-eb-text">Probar agente Sofia</h3>
          <div className="flex gap-2">
            <input
              type="text"
              className="eb-input flex-1"
              placeholder="Escríbele a Sofia..."
              value={chatMsg}
              onChange={e => setChatMsg(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && testChat()}
            />
            <button onClick={testChat} disabled={chatLoading} className="btn-primary">
              {chatLoading ? '...' : 'Enviar'}
            </button>
          </div>
          {chatReply && (
            <div
              className="rounded-xl p-3 text-sm text-eb-text"
              style={{ background: 'rgba(225,29,72,0.08)', border: '1px solid rgba(225,29,72,0.2)' }}
            >
              <span className="font-semibold text-rose-400">Sofia:</span> {chatReply}
            </div>
          )}
        </div>
      </div>

      {/* Feed en vivo */}
      <div className="card">
        <h3 className="font-semibold text-eb-text mb-4">Feed en vivo</h3>
        {feed.length === 0 && (
          <p className="text-sm text-eb-dim text-center py-6">
            Sin eventos aún — llega un mensaje y aparece aquí en tiempo real.
          </p>
        )}
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {feed.map((item, i) => (
            <div key={i} className="border-l-4 pl-3 py-1" style={{ borderColor: 'rgba(225,29,72,0.45)' }}>
              <div className="flex items-center gap-2 text-xs text-eb-dim mb-0.5">
                <span>{item.type === 'call_event' ? '📞' : '💬'}</span>
                <span className="font-medium text-eb-muted">{item.from}</span>
                <span>{item.ts}</span>
              </div>
              {item.body && <p className="text-xs text-eb-text">👤 {item.body}</p>}
              {item.response && <p className="text-xs text-rose-400">🤖 {item.response}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
