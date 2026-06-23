import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type Props = { data: Array<{ date: string; avg_ms: number }> };

export default function ResponseTimeChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="rtGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#e11d48" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#e11d48" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
        <YAxis tick={{ fontSize: 11 }} unit="ms" />
        <Tooltip formatter={(v: number) => [`${v}ms`, 'Latencia prom.']} />
        <Area type="monotone" dataKey="avg_ms" stroke="#e11d48" fill="url(#rtGrad)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
