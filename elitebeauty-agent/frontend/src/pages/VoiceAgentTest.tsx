import { useState, useCallback } from 'react';
import { sendChat } from '../lib/api';
import { useWebSocket, type WSEvent } from '../lib/ws';

type Turn = { role: 'user' | 'agent'; text: string; ms?: number };

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
      <h2 className="text-xl font-bold text-gray-900">Prueba del agente de voz</h2>
      <p className="text-sm text-gray-500">
        Simula una llamada con Sofia. Los mensajes se envían al backend con canal <code className="bg-gray-100 px-1 rounded">voice</code> para usar el prompt optimizado para voz.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Conversación simulada */}
        <div className="lg:col-span-2 card flex flex-col" style={{ height: '480px' }}>
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-green-500 text-lg">📞</span>
              <span className="font-semibold text-gray-800">Llamada simulada</span>
            </div>
            <button onClick={() => setTurns([])} className="text-xs text-gray-400 hover:text-gray-600">Limpiar</button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pb-3">
            {turns.length === 0 && (
              <p className="text-center text-gray-400 text-sm pt-8">
                Escribe algo para simular lo que diría el usuario en la llamada
              </p>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === 'agent' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-sm rounded-2xl px-4 py-2.5 text-sm ${
                  t.role === 'agent'
                    ? 'bg-purple-50 border border-purple-100 text-gray-700'
                    : 'bg-rose-600 text-white'
                }`}>
                  {t.role === 'agent' && <p className="text-xs text-purple-400 mb-0.5 font-medium">Sofia</p>}
                  {t.text}
                  {t.ms && <p className="text-xs opacity-50 mt-1">{t.ms}ms</p>}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-purple-50 border border-purple-100 rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-3 border-t border-gray-100">
            <input
              type="text"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              placeholder="Lo que diría el usuario en la llamada..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
            />
            <button onClick={send} disabled={loading} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm">
              {loading ? '...' : '📤 Enviar'}
            </button>
          </div>
        </div>

        {/* Eventos de llamadas reales */}
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">Eventos Twilio en vivo</h3>
          {events.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">
              Aquí aparecerán los eventos de llamadas reales via Twilio
            </p>
          )}
          <div className="space-y-2">
            {events.map((e, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-2.5 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="font-medium text-gray-700">{e.event}</span>
                  <span className="text-gray-400">{e.ts}</span>
                </div>
                {e.from && <p className="text-gray-500">De: {e.from}</p>}
                {e.duration && <p className="text-gray-500">Duración: {e.duration}s</p>}
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-600 mb-2">Configurar Twilio webhook</p>
            <div className="bg-gray-900 text-green-400 rounded-lg p-3 text-xs font-mono">
              <p>POST /voice/incoming</p>
              <p className="text-gray-500 mt-1">URL de producción:</p>
              <p>https://tu-dominio/voice/incoming</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
