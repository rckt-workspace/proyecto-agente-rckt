import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import QRModal from './components/QRModal';
import Dashboard from './pages/Dashboard';
import Conversations from './pages/Conversations';
import Leads from './pages/Leads';
import Analytics from './pages/Analytics';
import RAGDocs from './pages/RAGDocs';
import VoiceAgentTest from './pages/VoiceAgentTest';
import Settings from './pages/Settings';
import { useWebSocket, type WSEvent } from './lib/ws';

export default function App() {
  const [waStatus, setWaStatus] = useState('disconnected');
  const [showQR, setShowQR] = useState(false);

  const handleEvent = useCallback((event: WSEvent) => {
    if (event.type === 'wa_status') {
      const st = (event.data.status || event.data.bot) as string;
      setWaStatus(st);
      if (st === 'qr') setShowQR(true);
      if (st === 'ready') setShowQR(false);
    }
  }, []);

  const { connected } = useWebSocket(handleEvent);

  return (
    <BrowserRouter>
      <div className="flex min-h-screen">
        <Sidebar waStatus={waStatus} />

        <main className="flex-1 flex flex-col">
          {/* Topbar */}
          <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
            <h1 className="text-sm font-semibold text-gray-700">Elite Beauty — Agente IA Omnicanal</h1>
            <div className="flex items-center gap-3">
              <span
                className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}
                title={connected ? 'WebSocket conectado' : 'WebSocket desconectado'}
              />
              {waStatus !== 'ready' && (
                <button onClick={() => setShowQR(true)} className="btn-primary text-xs py-1.5 px-3">
                  Conectar WhatsApp
                </button>
              )}
            </div>
          </header>

          {/* Páginas */}
          <div className="flex-1 overflow-auto p-6">
            <Routes>
              <Route path="/" element={<Dashboard setShowQR={setShowQR} />} />
              <Route path="/conversations" element={<Conversations />} />
              <Route path="/leads" element={<Leads />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/rag-docs" element={<RAGDocs />} />
              <Route path="/voice-test" element={<VoiceAgentTest />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </main>
      </div>

      {showQR && <QRModal onClose={() => setShowQR(false)} />}
    </BrowserRouter>
  );
}
