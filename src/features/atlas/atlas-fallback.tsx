'use client';
import { useEffect, useRef, useState } from 'react';
import type { AtlasSettings } from '@/features/atlas/atlas-view';
/** Source coordinates projected directly; no generated anatomy or connectivity. */
export default function AtlasFallback({ settings }: { settings: AtlasSettings }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [points, setPoints] = useState<Float32Array | null>(null),
    [error, setError] = useState(''),
    [size, setSize] = useState([0, 0]);
  useEffect(() => {
    const abort = new AbortController();
    fetch('/malecns/somas.bin', { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.arrayBuffer();
      })
      .then((b) => setPoints(new Float32Array(b)))
      .catch((e) => {
        if (e.name !== 'AbortError') setError('Source positions could not load. Reload to retry.');
      });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const o = new ResizeObserver(([e]) => setSize([e.contentRect.width, e.contentRect.height]));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !points || !size[0] || !size[1]) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const [fullWidth, h] = size,
      w = settings.comparison ? fullWidth / 2 : fullWidth,
      dpr = Math.min(devicePixelRatio || 1, 2);
    el.width = Math.round(fullWidth * dpr);
    el.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, fullWidth, h);
    const ax = settings.view === 'side' ? 2 : 0,
      ay = settings.view === 'top' ? 2 : 1,
      indices: number[] = [];
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (let i = 0; i < points.length; i += 4) {
      const g = points[i + 3];
      if (
        (settings.scope === 'brain' && (g === 3 || points[i + 1] < -450)) ||
        (settings.group >= 0 && g !== settings.group)
      )
        continue;
      indices.push(i);
      x0 = Math.min(x0, points[i + ax]);
      x1 = Math.max(x1, points[i + ax]);
      y0 = Math.min(y0, points[i + ay]);
      y1 = Math.max(y1, points[i + ay]);
    }
    if (!indices.length) return;
    const left = 24,
      right = settings.comparison ? 24 : 65,
      top = 155,
      bottom = 145,
      scale = Math.min(
        (Math.max(40, w - left - right) * 0.76) / Math.max(x1 - x0, 1),
        (Math.max(40, h - top - bottom) * 0.78) / Math.max(y1 - y0, 1),
      ),
      ox = left + (w - left - right - (x1 - x0) * scale) / 2,
      oy = top + (h - top - bottom - (y1 - y0) * scale) / 2;
    const px = (p: number[]) => [ox + (p[ax] - x0) * scale, oy + (y1 - p[ay]) * scale];
    const colors =
      settings.theme === 'light'
        ? ['#08778f', '#7255b2', '#93651b', '#297750']
        : ['#70b8cc', '#a4a4da', '#d9c291', '#89b99b'];
    for (let pane = 0; pane < (settings.comparison ? 2 : 1); pane++) {
      ctx.save();
      ctx.translate(pane * w, 0);
      ctx.globalAlpha = 0.35;
      for (let g = 0; g < 4; g++) {
        ctx.fillStyle = colors[g];
        for (const i of indices) {
          if (points[i + 3] !== g) continue;
          ctx.fillRect(
            ox + (points[i + ax] - x0) * scale,
            oy + (y1 - points[i + ay]) * scale,
            1.15,
            1.15,
          );
        }
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#9ac6ff';
      for (const p of !settings.comparison || pane === 1 ? settings.ancestors || [] : []) {
        const [x, y] = px(p);
        ctx.fillRect(x - 2, y - 2, 4, 4);
      }
      if (settings.selectedPoint) {
        const [x, y] = px(settings.selectedPoint);
        ctx.strokeStyle = settings.theme === 'light' ? '#9b5200' : '#f8e6b7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [
    points,
    size,
    settings.theme,
    settings.view,
    settings.scope,
    settings.group,
    settings.ancestors,
    settings.selectedPoint,
    settings.comparison,
  ]);
  return (
    <>
      <canvas
        ref={canvas}
        className="atlas-position-fallback"
        aria-label="Two-dimensional projection of measured MaleCNS soma and root coordinates"
        style={{ touchAction: 'pan-y' }}
      />
      <div className="atlas-fallback-status" role="status">
        {error ||
          (!points
            ? 'Loading source positions…'
            : '2D source positions · 3D unavailable on this device')}
      </div>
    </>
  );
}
