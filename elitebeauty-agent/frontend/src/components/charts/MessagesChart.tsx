import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type Props = { data: Array<{ date: string; whatsapp: number; voice: number; total: number }> };

export default function MessagesChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="whatsapp" stroke="#e11d48" name="WhatsApp" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="voice" stroke="#7c3aed" name="Voz" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
