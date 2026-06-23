import { NavLink } from 'react-router-dom';

const links = [
  { to: '/',              label: 'Dashboard',      icon: '⬛' },
  { to: '/conversations', label: 'Conversaciones', icon: '💬' },
  { to: '/leads',         label: 'Leads',           icon: '🎯' },
  { to: '/analytics',     label: 'Analítica',       icon: '📊' },
  { to: '/rag-docs',      label: 'RAG Docs',        icon: '📚' },
  { to: '/voice-test',    label: 'Voz Test',        icon: '📞' },
  { to: '/settings',      label: 'Configuración',  icon: '⚙️' },
];

export default function Sidebar({ waStatus }: { waStatus: string }) {
  return (
    <aside className="w-60 min-h-screen bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-rose-600 flex items-center justify-center text-white font-bold text-lg">
            EB
          </div>
          <div>
            <p className="font-bold text-sm text-gray-900">Elite Beauty</p>
            <p className="text-xs text-gray-500">Panel IA</p>
          </div>
        </div>
      </div>

      {/* WA Status */}
      <div className="px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              waStatus === 'ready' ? 'bg-green-500 animate-pulse' : 'bg-red-400'
            }`}
          />
          <span className="text-gray-600">
            WhatsApp: {waStatus === 'ready' ? 'Conectado' : waStatus === 'qr' ? 'Esperando QR' : 'Desconectado'}
          </span>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {links.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-rose-50 text-rose-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-gray-100 text-xs text-gray-400">
        v1.0.0 · Elite Beauty Agent
      </div>
    </aside>
  );
}
