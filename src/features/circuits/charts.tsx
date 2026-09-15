const LINE_COLORS = ['#8da9ce', '#b9ed82', '#b19af2'];
export function Chart({
  series,
  xlabel = 'Epoch',
  percent = true,
}: {
  series: { name: string; color: string; points: { x: number; y: number }[] }[];
  xlabel?: string;
  percent?: boolean;
}) {
  const width = 700,
    height = 230,
    left = 42,
    right = 17,
    top = 13,
    bottom = 35;
  const all = series.flatMap((s) => s.points),
    maxX = Math.max(1, ...all.map((p) => p.x)),
    maxY = percent ? 1 : Math.max(0.01, ...all.map((p) => p.y)) * 1.1;
  const x = (v: number) => left + (v / maxX) * (width - left - right),
    y = (v: number) => height - bottom - (v / maxY) * (height - top - bottom);
  return (
    <>
      <svg
        className="chart"
        role="img"
        aria-label={
          percent ? 'Accuracy by training epoch' : 'Measured latency versus test accuracy'
        }
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1={left}
              x2={width - right}
              y1={y(t * maxY)}
              y2={y(t * maxY)}
              stroke="#263242"
              strokeDasharray="3 5"
            />
            <text x={left - 8} y={y(t * maxY) + 4} textAnchor="end">
              {percent ? Math.round(t * 100) + '%' : (t * maxY).toFixed(2)}
            </text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text x={x(t * maxX)} y={height - 15} textAnchor="middle" key={t}>
            {Math.round(t * maxX)}
          </text>
        ))}
        {series.map((s) => (
          <path
            key={s.name}
            d={s.points.map((p, i) => (i ? 'L' : 'M') + x(p.x) + ',' + y(p.y)).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth="2.3"
            strokeLinejoin="round"
          />
        ))}
        <text x={width - right} y={height - 1} textAnchor="end">
          {xlabel}
        </text>
      </svg>
      <div className="chartlegend">
        {series.map((s) => (
          <span key={s.name}>
            <i style={{ background: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </>
  );
}

export function Scatter({ models }: { models: any[] }) {
  const maxX = Math.max(...models.map((m) => m.latency.mean)) * 1.35;
  return (
    <svg
      className="chart"
      viewBox="0 0 460 250"
      role="img"
      aria-label="Test accuracy versus measured latency; upper left is better"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line
            x1="45"
            x2="435"
            y1={210 - t * 180}
            y2={210 - t * 180}
            stroke="#293444"
            strokeDasharray="3 4"
          />
          <text x="36" y={214 - t * 180} textAnchor="end">
            {t * 100}%
          </text>
          <text x={45 + t * 390} y="230" textAnchor="middle">
            {(t * maxX).toFixed(3)}
          </text>
        </g>
      ))}
      {models.map((m, i) => (
        <g key={m.name}>
          <circle
            cx={45 + (m.latency.mean / maxX) * 390}
            cy={210 - m.accuracy.mean * 180}
            r="7"
            fill={LINE_COLORS[i]}
          />
          <text
            x={Math.min(330, 45 + (m.latency.mean / maxX) * 390)}
            y={192 - m.accuracy.mean * 180}
            style={{ fill: LINE_COLORS[i] }}
          >
            {i === 0 ? 'Baseline' : i === 1 ? 'Variant' : 'Random'}
          </text>
        </g>
      ))}
      <text x="435" y="249" textAnchor="end">
        Milliseconds / decision · lower is faster
      </text>
    </svg>
  );
}
