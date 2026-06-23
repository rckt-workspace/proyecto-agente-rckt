import { useEffect, useState } from 'react';
import { getWAQR } from '../lib/api';

type Props = { onClose: () => void };

export default function QRModal({ onClose }: Props) {
  const [qrImage, setQrImage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      getWAQR().then((d) => {
        setQrImage(d.image || '');
        setLoading(false);
      });
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 w-80 text-center shadow-2xl">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Conectar WhatsApp</h2>
        <p className="text-sm text-gray-500 mb-5">
          Abre WhatsApp en tu teléfono → Dispositivos vinculados → Vincular
        </p>
        {loading ? (
          <div className="h-48 flex items-center justify-center text-gray-400">Cargando QR...</div>
        ) : qrImage ? (
          <img src={qrImage} alt="QR WhatsApp" className="w-full rounded-xl border-4 border-rose-100" />
        ) : (
          <div className="h-48 flex items-center justify-center text-green-600 font-bold text-lg">
            ✅ WhatsApp conectado
          </div>
        )}
        <button onClick={onClose} className="mt-5 btn-secondary w-full">
          Cerrar
        </button>
      </div>
    </div>
  );
}
