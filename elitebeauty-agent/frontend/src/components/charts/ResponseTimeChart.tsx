import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type Props = { data: Array<{ date: string; avg_ms: number }> };

const tooltipStyle = {
  background: 'rgba(22,17,32,0.97)',
  border: '1px solid rgba(34,25,50,1)',
  borderRadius: '12px',
  color: '#f0ebff',
};

const tickStyle = { fontSize: 11, fill: '#665880' };

export default function ResponseTimeChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="rtGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#e11d48" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#e11d48" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
        <XAxis dataKey="date" tick={tickStyle} tickFormatter={(d) => d.slice(5)} axisLine={false} tickLine={false} />
        <YAxis tick={tickStyle} unit="ms" axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number) => [`${v}ms`, 'Latencia prom.']}
          cursor={{ stroke: 'rgba(225,29,72,0.2)' }}
        />
        <Area type="monotone" dataKey="avg_ms" stroke="#e11d48" fill="url(#rtGrad)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
