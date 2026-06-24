type Props = {
  label: string;
  value: string | number;
  sub?: string;
  color?: 'rose' | 'green' | 'blue' | 'purple';
};

const colorMap = {
  rose:   { text: '#fb7185', glow: 'rgba(225,29,72,0.25)' },
  green:  { text: '#4ade80', glow: 'rgba(74,222,128,0.2)' },
  blue:   { text: '#38bdf8', glow: 'rgba(56,189,248,0.2)' },
  purple: { text: '#c084fc', glow: 'rgba(192,132,252,0.2)' },
};

export default function KPICard({ label, value, sub, color = 'rose' }: Props) {
  const { text, glow } = colorMap[color];
  return (
    <div className="card flex flex-col gap-2">
      <p className="text-xs font-semibold text-eb-dim uppercase tracking-widest">{label}</p>
      <p
        className="text-3xl font-bold"
        style={{ color: text, textShadow: `0 0 24px ${glow}` }}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-eb-dim">{sub}</p>}
    </div>
  );
}
