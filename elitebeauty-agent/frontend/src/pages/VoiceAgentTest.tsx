import { useState, useCallback } from 'react';
import { sendChat } from '../lib/api';
import { useWebSocket, type WSEvent } from '../lib/ws';

type Turn = { role: 'user' | 'agent'; text: string; ms?: number };

const BORDER = 'rgba(34, 25, 50, 1)';

export default function VoiceAgentTest() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<any[]>([]);

  const handleEvent = useCallback((e: WSEvent) => {
    if (e.type === 'call_event') {
      setEvents(prev => [{ ...e.data, ts: new Date().toLocaleTimeString('es-CO') }, ...prev].slice(0, 10));
    }
  }, []);

  useWebSocket(handleEvent);

  const send = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setTurns(t => [...t, { role: 'user', text: msg }]);
    setInput('');
    setLoading(true);
    try {
      const data = await sendChat(msg, 'voice');
      setTurns(t => [...t, { role: 'agent', text: data.response, ms: data.latency_ms }]);
    } catch {
      setTurns(t => [...t, { role: 'agent', text: 'Error al conectar con el agente.' }]);
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-display font-bold text-eb-text tracking-wider uppercase">
        Prueba del agente de voz
      </h2>
      <p className="text-sm text-eb-dim">
        Simula una llamada con Sofia. Los mensajes se envían al backend con canal{' '}
        <code
          className="px-1.5 py-0.5 rounded text-rose-400 font-mono text-xs"
          style={{ background: 'rgba(225,29,72,0.1)' }}
        >
          voice
        </code>{' '}
        para usar el prompt optimizado para voz.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversación simulada */}
        <div className="lg:col-span-2 card flex flex-col h-[70vh] max-h-[480px] lg:h-[480px]">
          <div
            className="flex items-center justify-between pb-3 mb-3"
            style={{ borderBottom: `1px solid ${BORDER}` }}
          >
            <div className="flex items-center gap-2">
              <span className="text-green-400 text-lg">📞</span>
              <span className="font-semibold text-eb-text">Llamada simulada</span>
            </div>
            <button
              onClick={() => setTurns([])}
              className="text-xs text-eb-dim hover:text-eb-muted transition-colors"
            >
              Limpiar
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pb-3">
            {turns.length === 0 && (
              <p className="text-center text-eb-dim text-sm pt-8">
                Escribe algo para simular lo que diría el usuario en la llamada
              </p>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === 'agent' ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-sm rounded-2xl px-4 py-2.5 text-sm ${
                    t.role === 'agent' ? 'text-eb-text' : 'bg-rose-600 text-white'
                  }`}
                  style={
                    t.role === 'agent'
                      ? { background: 'rgba(147,51,234,0.1)', border: '1px solid rgba(147,51,234,0.22)' }
                      : {}
                  }
                >
                  {t.role === 'agent' && (
                    <p className="text-xs text-purple-400 mb-0.5 font-medium">Sofia</p>
                  )}
                  {t.text}
                  {t.ms && <p className="text-xs opacity-50 mt-1">{t.ms}ms</p>}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div
                  className="rounded-2xl px-4 py-3"
                  style={{ background: 'rgba(147,51,234,0.1)', border: '1px solid rgba(147,51,234,0.22)' }}
                >
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-3" style={{ borderTop: `1px solid ${BORDER}` }}>
            <input
              type="text"
              className="eb-input flex-1"
              style={{ borderRadius: '0.75rem' }}
              placeholder="Lo que diría el usuario en la llamada..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
            />
            <button
              onClick={send}
              disabled={loading}
              className="text-white font-semibold px-4 py-2.5 rounded-xl transition-all text-sm"
              style={{
                background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                boxShadow: loading ? 'none' : '0 6px 20px rgba(147,51,234,0.35)',
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? '...' : '📤 Enviar'}
            </button>
          </div>
        </div>

        {/* Eventos de llamadas reales */}
        <div className="card">
          <h3 className="font-semibold text-eb-text mb-4">Eventos Twilio en vivo</h3>
          {events.length === 0 && (
            <p className="text-xs text-eb-dim text-center py-4">
              Aquí aparecerán los eventos de llamadas reales via Twilio
            </p>
          )}
          <div className="space-y-2">
            {events.map((e, i) => (
              <div
                key={i}
                className="rounded-xl p-2.5 text-xs"
                style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${BORDER}` }}
              >
                <div className="flex justify-between mb-1">
                  <span className="font-medium text-eb-muted">{e.event}</span>
                  <span className="text-eb-dim">{e.ts}</span>
                </div>
                {e.from && <p className="text-eb-dim">De: {e.from}</p>}
                {e.duration && <p className="text-eb-dim">Duración: {e.duration}s</p>}
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
            <p className="text-xs font-semibold text-eb-muted mb-2">Configurar Twilio webhook</p>
            <div
              className="rounded-xl p-3 text-xs font-mono"
              style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${BORDER}` }}
            >
              <p className="text-green-400">POST /voice/incoming</p>
              <p className="text-eb-dim mt-1">URL de producción:</p>
              <p className="text-eb-muted">https://tu-dominio/voice/incoming</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
