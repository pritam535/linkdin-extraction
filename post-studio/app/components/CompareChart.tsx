"use client";

import { useEffect, useRef, useState } from "react";
import { fmtAge } from "./LineChart";

export type CompareSeries = { id: string; name: string; color: string; points: { x: number; y: number; approx?: boolean }[] };

const niceMax = (max: number) => {
  const step = Math.pow(10, Math.floor(Math.log10(Math.max(1, max))));
  return [1, 2, 2.5, 5, 10].map((k) => k * step).find((v) => v >= max) ?? max;
};

/** Several posts on one axis: impressions by hours since posting. Legend + end labels, so identity never rests on color alone. */
export default function CompareChart({ series, xMax, height = 260 }: { series: CompareSeries[]; xMax: number; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  const [hover, setHover] = useState<{ s: number; i: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = height;
  const pad = { l: 44, r: 16, t: 16, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const visible = series.map((s) => ({ ...s, points: [{ x: 0, y: 0 }, ...s.points.filter((p) => p.x <= xMax)] }));
  const yMax = niceMax(Math.max(1, ...visible.flatMap((s) => s.points.map((p) => p.y))));
  const X = (x: number) => pad.l + (x / xMax) * iw;
  const Y = (y: number) => pad.t + ih - (y / yMax) * ih;
  const xTicks = [0, xMax / 4, xMax / 2, (xMax * 3) / 4, xMax];

  const onMove = (e: React.MouseEvent) => {
    const r = box.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    let best: { s: number; i: number; d: number } | null = null;
    visible.forEach((s, si) => s.points.forEach((p, i) => {
      if (i === 0) return;
      const d = Math.hypot(X(p.x) - px, Y(p.y) - py);
      if (!best || d < best.d) best = { s: si, i, d };
    }));
    setHover(best && (best as { d: number }).d < 60 ? best : null);
  };
  const hp = hover && visible[hover.s].points[hover.i];

  return (
    <div className="chart">
      <div className="legend" style={{ marginTop: 0, marginBottom: 6 }}>
        {visible.map((s) => <span key={s.id}><i style={{ background: s.color }} />{s.name.length > 48 ? s.name.slice(0, 47) + "…" : s.name}</span>)}
      </div>
      <div style={{ position: "relative" }} ref={box} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Impressions by hours since posting, one line per post">
          {[0, yMax / 2, yMax].map((t) => (
            <g key={t}>
              <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} />
              <text className="axis" x={pad.l - 6} y={Y(t) + 4} textAnchor="end">{t.toLocaleString()}</text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text key={i} className="axis" x={X(t)} y={H - 8} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}>{t === 0 ? "Published" : fmtAge(t)}</text>
          ))}
          {visible.map((s) => (
            <g key={s.id}>
              <path d={s.points.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
              {s.points.slice(1).map((p, i) => <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={4} fill={s.color} stroke="var(--panel)" strokeWidth={2} />)}
            </g>
          ))}
          {visible.length <= 4 && visible.map((s) => {
            const lp = s.points.at(-1)!;
            return s.points.length > 1 && <text key={s.id} className="axis value-label" x={X(lp.x) - 8} y={Y(lp.y) - 10} textAnchor="end">{lp.y.toLocaleString()}</text>;
          })}
        </svg>
        {hp && hover && (
          <div className="tooltip" style={{ left: `${(X(hp.x) / W) * 100}%`, top: `${(Y(hp.y) / H) * 100}%` }}>
            <b>{hp.y.toLocaleString()}</b> impressions
            <div className="meta">{fmtAge(hp.x)} after posting{(hp as { approx?: boolean }).approx ? " (approx.)" : ""}</div>
            <div className="meta">{visible[hover.s].name.slice(0, 50)}</div>
          </div>
        )}
      </div>
    </div>
  );
}
