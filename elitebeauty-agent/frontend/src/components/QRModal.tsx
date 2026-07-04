import { useEffect, useState } from 'react';
import { getWAQR } from '../lib/api';

type Props = { onClose: () => void };

export default function QRModal({ onClose }: Props) {
  const [qrImage, setQrImage] = useState('');
  const [status, setStatus] = useState('disconnected');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      getWAQR().then((d) => {
        setQrImage(d.image || '');
        setStatus(d.status || d.bot || 'disconnected');
        setLoading(false);
      }).catch(() => setLoading(false));
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="rounded-2xl p-6 sm:p-8 w-full max-w-xs sm:w-80 text-center"
        style={{
          background: 'linear-gradient(160deg, rgba(30,23,46,0.98), rgba(22,17,32,0.99))',
          border: '1px solid rgba(34,25,50,1)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 40px rgba(225,29,72,0.1)',
        }}
      >
        <h2 className="text-lg font-display font-bold text-eb-text mb-1 tracking-wider uppercase">
          Conectar WhatsApp
        </h2>
        <p className="text-sm text-eb-dim mb-5">
          Abre WhatsApp en tu teléfono → Dispositivos vinculados → Vincular
        </p>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-eb-dim">Cargando QR...</div>
        ) : qrImage ? (
          <img
            src={qrImage}
            alt="QR WhatsApp"
            className="w-full rounded-xl"
            style={{ border: '4px solid rgba(225,29,72,0.2)' }}
          />
        ) : status === 'ready' ? (
          <div className="h-48 flex items-center justify-center text-green-400 font-bold text-lg">
            WhatsApp conectado
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-eb-dim text-sm">
            Esperando QR del bridge
          </div>
        )}
        <button onClick={onClose} className="mt-5 btn-secondary w-full">
          Cerrar
        </button>
      </div>
    </div>
  );
}
