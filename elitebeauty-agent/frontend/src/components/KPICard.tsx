type Props = {
  label: string;
  value: string | number;
  sub?: string;
  color?: 'rose' | 'green' | 'blue' | 'purple';
};

const colors = {
  rose:   'bg-rose-50 text-rose-600',
  green:  'bg-green-50 text-green-600',
  blue:   'bg-blue-50 text-blue-600',
  purple: 'bg-purple-50 text-purple-600',
};

export default function KPICard({ label, value, sub, color = 'rose' }: Props) {
  return (
    <div className="card flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold ${colors[color].split(' ')[1]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
