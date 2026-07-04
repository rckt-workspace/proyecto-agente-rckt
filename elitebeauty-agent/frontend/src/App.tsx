import { HashRouter, Routes, Route } from 'react-router-dom';
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    <HashRouter>
      <div className="flex min-h-screen">
        <Sidebar waStatus={waStatus} open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />

        {/* Overlay para cerrar el menú en móvil */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 lg:hidden"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 flex flex-col min-w-0">
          {/* Topbar */}
          <header
            className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3"
            style={{
              background: 'rgba(13, 10, 20, 0.8)',
              borderBottom: '1px solid rgba(34, 25, 50, 1)',
              backdropFilter: 'blur(20px)',
            }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden text-eb-text text-xl leading-none shrink-0"
                aria-label="Abrir menú"
              >
                ☰
              </button>
              <h1 className="font-display text-[10px] sm:text-xs font-semibold text-eb-muted tracking-[0.14em] sm:tracking-[0.18em] uppercase truncate">
                <span className="hidden sm:inline">Elite Beauty — Agente IA Omnicanal</span>
                <span className="sm:hidden">Elite Beauty IA</span>
              </h1>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span
                className={`w-2 h-2 rounded-full transition-all ${
                  connected
                    ? 'bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.7)]'
                    : 'bg-eb-dim'
                }`}
                title={connected ? 'WebSocket conectado' : 'WebSocket desconectado'}
              />
              {waStatus !== 'ready' && (
                <button
                  onClick={() => {
                    const bridgeUrl = import.meta.env.VITE_WA_BRIDGE_PUBLIC_URL;
                    if (bridgeUrl) {
                      window.open(`${bridgeUrl}/panel`, '_blank', 'noopener,noreferrer');
                    } else {
                      setShowQR(true);
                    }
                  }}
                  className="btn-primary text-xs py-1.5 px-3 whitespace-nowrap"
                >
                  <span className="hidden sm:inline">Conectar WhatsApp</span>
                  <span className="sm:hidden">WA</span>
                </button>
              )}
            </div>
          </header>

          {/* Páginas */}
          <div className="flex-1 overflow-auto p-4 sm:p-6">
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
    </HashRouter>
  );
}
