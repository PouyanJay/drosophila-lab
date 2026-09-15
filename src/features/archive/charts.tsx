'use client';
import { useEffect, useRef, useState } from 'react';
import { nice, num } from './presentation';
export function Connectivity({
  graph,
  onSelect,
}: {
  graph: any;
  selected: number | null;
  onSelect: (n: number) => void;
}) {
  const [hover, setHover] = useState<any>(null),
    order = graph.classes
      .map((_: any, i: number) => i)
      .sort((a: number, b: number) => graph.classCounts[b] - graph.classCounts[a])
      .slice(0, 12),
    max = Math.max(...graph.classConnectivity.flat());
  return (
    <div className="fs-connectivity">
      <div className="fs-matrix" role="group" aria-label="Measured class connectivity matrix">
        <div className="fs-matrix-y">SOURCE → TARGET</div>
        <div
          className="fs-matrix-grid"
          style={{ gridTemplateColumns: `repeat(${order.length},1fr)` }}
        >
          {order.flatMap((a: number) =>
            order.map((b: number) => {
              const v = graph.classConnectivity[a][b];
              return (
                <button
                  key={a + '-' + b}
                  aria-label={`${nice(graph.classes[a])} to ${nice(graph.classes[b])}: ${num(v)} synapses`}
                  title={`${nice(graph.classes[a])} → ${nice(graph.classes[b])}: ${num(v)}`}
                  style={{
                    background: `rgba(178,216,194,${v ? 0.12 + (0.88 * Math.log1p(v)) / Math.log1p(max) : 0.025})`,
                  }}
                  onClick={() => {
                    setHover({ a, b, v });
                    onSelect(a);
                  }}
                />
              );
            }),
          )}
        </div>
      </div>
      <div className="fs-matrix-detail">
        <span className="fs-small-label">
          {hover ? 'MEASURED PROJECTION' : '12 LARGEST NEURON CLASSES'}
        </span>
        <h3>{hover ? nice(graph.classes[hover.a]) : 'A graph grounded in anatomy.'}</h3>
        <p>
          {hover
            ? '→ ' + nice(graph.classes[hover.b])
            : 'Each cell is the observed synapse total between two classes. The training graph retains all ' +
              graph.classes.length +
              ' classes.'}
        </p>
        <strong>
          {hover ? num(hover.v) : num(graph.synapses)}
          <small> observed synapses</small>
        </strong>
      </div>
      <div className="fs-class-legend">
        {order.map((i: number, j: number) => (
          <span key={i}>
            <b>{String(j + 1).padStart(2, '0')}</b>
            {nice(graph.classes[i])}
            <small>{num(graph.classCounts[i])}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

export function LossChart({ run }: { run: any }) {
  const svgRef = useRef<SVGSVGElement>(null),
    [chartWidth, setChartWidth] = useState(650);
  useEffect(() => {
    if (!svgRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0)
        setChartWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(svgRef.current);
    return () => observer.disconnect();
  }, []);
  const series = run.models.map((m: any) =>
    m.seeds[0].history.map((p: any, j: number) => ({
      step: p.step,
      value:
        m.seeds.reduce((s: number, x: any) => s + (x.history[j]?.validationLoss || 0), 0) /
        m.seeds.length,
    })),
  );
  const points = series.flat(),
    lo = Math.min(...points.map((p: any) => p.value)) * 0.97,
    hi = Math.max(...points.map((p: any) => p.value)) * 1.03,
    x = (n: number) => 55 + (n / run.config.steps) * (chartWidth - 80),
    y = (v: number) => 218 - ((v - lo) / (hi - lo || 1)) * 175,
    colors = ['#8ea6bd', '#d3ec93', '#bdacf0', '#82cabb'];
  return (
    <>
      <svg
        ref={svgRef}
        className="fs-loss-chart"
        viewBox={`0 0 ${chartWidth} 260`}
        role="img"
        aria-label="Mean validation loss by training step for each measured architecture"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line
              x1="55"
              x2={chartWidth - 25}
              y1={y(lo + (hi - lo) * t)}
              y2={y(lo + (hi - lo) * t)}
              stroke="#283033"
              strokeDasharray="3 5"
            />
            <text
              x="43"
              y={y(lo + (hi - lo) * t) + 4}
              textAnchor="end"
              fill="#9da8a9"
              fontSize="12"
            >
              {(lo + (hi - lo) * t).toFixed(2)}
            </text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text
            key={t}
            x={x(t * run.config.steps)}
            y="243"
            textAnchor="middle"
            fill="#9da8a9"
            fontSize="12"
          >
            {Math.round(t * run.config.steps)}
          </text>
        ))}
        {series.map((s: any, i: number) => (
          <polyline
            key={i}
            points={s.map((p: any) => `${x(p.step)},${y(p.value)}`).join(' ')}
            fill="none"
            stroke={colors[i % 4]}
            strokeWidth="2.5"
          />
        ))}
        <text x={chartWidth - 25} y="259" textAnchor="end" fill="#9da8a9" fontSize="12">
          Training step
        </text>
      </svg>
      <div className="fs-chart-legend">
        {run.models.map((m: any, i: number) => (
          <span key={i}>
            <i style={{ background: colors[i % 4] }} />
            {m.name}
          </span>
        ))}
      </div>
    </>
  );
}
