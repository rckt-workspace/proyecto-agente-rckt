import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type Props = { data: Array<{ interest: string; count: number }> };

const COLORS = ['#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#c084fc', '#9333ea'];

const tooltipStyle = {
  background: 'rgba(22,17,32,0.97)',
  border: '1px solid rgba(34,25,50,1)',
  borderRadius: '12px',
  color: '#f0ebff',
};

const tickStyle = { fontSize: 11, fill: '#665880' };

export default function LeadsFunnelChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" horizontal={false} />
        <XAxis type="number" tick={tickStyle} axisLine={false} tickLine={false} />
        <YAxis dataKey="interest" type="category" tick={tickStyle} width={90} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="count" name="Leads" radius={[0, 6, 6, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
