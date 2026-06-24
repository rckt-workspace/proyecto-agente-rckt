import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

type Props = { data: Array<{ date: string; whatsapp: number; voice: number; total: number }> };

const tooltipStyle = {
  background: 'rgba(22,17,32,0.97)',
  border: '1px solid rgba(34,25,50,1)',
  borderRadius: '12px',
  color: '#f0ebff',
};

const tickStyle = { fontSize: 11, fill: '#665880' };

export default function MessagesChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
        <XAxis dataKey="date" tick={tickStyle} tickFormatter={(d) => d.slice(5)} axisLine={false} tickLine={false} />
        <YAxis tick={tickStyle} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'rgba(225,29,72,0.2)' }} />
        <Legend wrapperStyle={{ color: '#9b8cb4', fontSize: '12px' }} />
        <Line type="monotone" dataKey="whatsapp" stroke="#e11d48" name="WhatsApp" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="voice" stroke="#9333ea" name="Voz" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
