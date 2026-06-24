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
    <aside
      className="w-60 min-h-screen flex flex-col"
      style={{
        background: 'rgba(13, 10, 20, 0.75)',
        borderRight: '1px solid rgba(34, 25, 50, 1)',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Logo */}
      <div className="px-5 py-5" style={{ borderBottom: '1px solid rgba(34, 25, 50, 1)' }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm"
            style={{
              background: 'linear-gradient(135deg, #e11d48, #9333ea)',
              boxShadow: '0 0 18px rgba(225, 29, 72, 0.45)',
            }}
          >
            EB
          </div>
          <div>
            <p className="font-display font-bold text-[10px] text-eb-text tracking-[0.2em] uppercase">
              Elite Beauty
            </p>
            <p className="text-xs text-eb-dim">Panel IA</p>
          </div>
        </div>
      </div>

      {/* WA Status */}
      <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(34, 25, 50, 1)' }}>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              waStatus === 'ready'
                ? 'bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.7)]'
                : 'bg-red-500/70'
            }`}
          />
          <span className="text-eb-dim">
            WhatsApp:{' '}
            {waStatus === 'ready' ? 'Conectado' : waStatus === 'qr' ? 'Esperando QR' : 'Desconectado'}
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
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'text-rose-400'
                  : 'text-eb-dim hover:text-eb-text'
              }`
            }
            style={({ isActive }) =>
              isActive
                ? {
                    background: 'rgba(225, 29, 72, 0.08)',
                    border: '1px solid rgba(225, 29, 72, 0.2)',
                    boxShadow: 'inset 0 0 12px rgba(225, 29, 72, 0.06)',
                  }
                : {
                    background: 'transparent',
                    border: '1px solid transparent',
                  }
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div
        className="px-5 py-4 text-xs text-eb-dim font-mono"
        style={{ borderTop: '1px solid rgba(34, 25, 50, 1)' }}
      >
        v1.0.0 · Elite Beauty Agent
      </div>
    </aside>
  );
}
