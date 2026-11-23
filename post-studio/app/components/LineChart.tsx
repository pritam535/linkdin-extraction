"use client";

import { useEffect, useRef, useState } from "react";

export type LinePoint = { x: number; y: number; label: string; note?: string; origin?: boolean };

const niceMax = (max: number) => {
  if (max <= 4) return Math.max(1, Math.ceil(max));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  return [1, 2, 2.5, 5, 10].map((k) => k * step).find((v) => v >= max) ?? max;
};

/** Hours since posting → "45m", "2h", "1d 3h". */
export const fmtAge = (h: number) =>
  h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h * 10) / 10}h`.replace(".0h", "h") : Math.round(h % 24) === 0 || Math.round(h % 24) === 24 ? `${Math.round(h / 24)}d` : `${Math.floor(h / 24)}d ${Math.round(h % 24)}h`;

/** One series over time (x = hours since posting): 2px line, 8px markers, crosshair tooltip, table view. */
export default function LineChart({ points, title, height = 220 }: { points: LinePoint[]; title: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [table]);

  const H = height;
  const pad = { l: 44, r: 16, t: 14, b: 28 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const xMax = Math.max(1, ...points.map((p) => p.x));
  const yMax = niceMax(Math.max(1, ...points.map((p) => p.y)));
  const X = (x: number) => pad.l + (x / xMax) * iw;
  const Y = (y: number) => pad.t + ih - (y / yMax) * ih;
  const yTicks = yMax <= 10 ? Array.from({ length: Math.floor(yMax / (yMax <= 5 ? 1 : 2)) + 1 }, (_, i) => i * (yMax <= 5 ? 1 : 2)) : [0, yMax / 2, yMax].filter((v) => Number.isInteger(v));
  const xTicks = Array.from(new Set([0, xMax / 2, xMax].map((v) => Math.round(v * 10) / 10)));
  const d = points.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  const h = hover === null ? null : points[hover];

  const nearest = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = 0;
    points.forEach((p, i) => (Math.abs(X(p.x) - px) < Math.abs(X(points[best].x) - px) ? (best = i) : 0));
    return best;
  };

  return (
    <div className="chart">
      <div className="row tight" style={{ justifyContent: "flex-end", marginBottom: 4 }}>
        <button className="ghost small" onClick={() => setTable((t) => !t)} aria-pressed={table}>{table ? "Show chart" : "Show table"}</button>
      </div>
      {table ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>After posting</th><th className="num">{title}</th></tr></thead>
            <tbody>{points.map((p, i) => <tr key={i}><td>{p.label}</td><td>{p.origin ? "0" : fmtAge(p.x)}{p.note ? ` ${p.note}` : ""}</td><td className="num">{p.y.toLocaleString()}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: "relative" }} ref={box} onMouseMove={(e) => setHover(nearest(e.clientX))} onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} over hours since posting`}>
            {yTicks.map((t) => (
              <g key={t}>
                <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} />
                <text className="axis" x={pad.l - 6} y={Y(t) + 4} textAnchor="end">{t.toLocaleString()}</text>
              </g>
            ))}
            {xTicks.map((t, i) => (
              <text key={t} className="axis" x={X(t)} y={H - 8} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}>
                {t === 0 ? "Published" : `${fmtAge(t)} after`}
              </text>
            ))}
            {h && <line className="crosshair" x1={X(h.x)} x2={X(h.x)} y1={pad.t} y2={pad.t + ih} />}
            <path d={d} className="line-mark" />
            {points.map((p, i) => (
              <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={hover === i ? 5.5 : 4} className={p.origin ? "dot-mark origin" : "dot-mark"} />
            ))}
            {points.length > 1 && (
              <text className="axis value-label" x={X(points.at(-1)!.x) - 8} y={Y(points.at(-1)!.y) - 10} textAnchor="end">
                {points.at(-1)!.y.toLocaleString()}
              </text>
            )}
          </svg>
          {h && (
            <div className="tooltip" style={{ left: `${(X(h.x) / W) * 100}%`, top: `${(Y(h.y) / H) * 100}%` }}>
              <b>{h.y.toLocaleString()}</b> {title.toLowerCase()}
              <div className="meta">{h.origin ? "At publish" : `${fmtAge(h.x)} after posting${h.note ? ` ${h.note}` : ""}`}</div>
              <div className="meta">{h.label}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
