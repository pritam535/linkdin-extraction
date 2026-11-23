"use client";

import { useEffect, useRef, useState } from "react";

export type BarDatum = { label: string; value: number; detail?: string };

/** Single-series bar chart: thin bars, rounded tops, recessive grid, hover tooltip, optional table view. */
export default function BarChart({ data, title, format = (n) => n.toLocaleString(), height = 200 }: { data: BarDatum[]; title: string; format?: (n: number) => string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  // Draw at the real pixel width so labels stay readable at any size.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [table]);
  const H = height;
  const pad = { l: 36, r: 8, t: 10, b: 26 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = (() => {
    const step = Math.pow(10, Math.floor(Math.log10(max)));
    const m = [1, 2, 2.5, 5, 10].map((k) => k * step).find((v) => v >= max) ?? max;
    return Number.isInteger(max) && max <= 4 ? Math.max(max, 1) : m;
  })();
  const integers = data.every((d) => Number.isInteger(d.value));
  const ticks = [0, nice / 2, nice].filter((v, i, a) => a.indexOf(v) === i && (!integers || Number.isInteger(v)));
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const slot = iw / Math.max(1, data.length);
  const bw = Math.max(3, Math.min(28, slot - 4));
  const y = (v: number) => pad.t + ih - (v / nice) * ih;
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(W / 90)));

  return (
    <div className="chart">
      <div className="row tight" style={{ justifyContent: "flex-end", marginBottom: 4 }}>
        <button className="ghost small" onClick={() => setTable((t) => !t)} aria-pressed={table}>{table ? "Show chart" : "Show table"}</button>
      </div>
      {table ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Period</th><th className="num">{title}</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td className="num">{format(d.value)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: "relative" }} ref={box}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} by period`} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
                <text className="axis" x={pad.l - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = pad.l + slot * i + slot / 2;
              const h = Math.max(0, y(0) - y(d.value));
              const r = Math.min(4, bw / 2, h);
              const x0 = cx - bw / 2;
              const top = y(d.value);
              // Rounded top, square base anchored on the baseline.
              const path = h > 0
                ? `M${x0},${y(0)} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${y(0)} Z`
                : "";
              return (
                <g key={i} onMouseEnter={() => setHover(i)}>
                  <rect className="hit" x={pad.l + slot * i} y={pad.t} width={slot} height={ih} />
                  {path && <path className={`bar-mark ${hover !== null && hover !== i ? "dim" : ""}`} d={path} />}
                  {i % labelEvery === 0 && (
                    <text className="axis" x={cx} y={H - 8} textAnchor="middle">{d.label.length > 12 ? d.label.slice(0, 11) + "…" : d.label}</text>
                  )}
                </g>
              );
            })}
          </svg>
          {hover !== null && data[hover] && (
            <div className="tooltip" style={{ left: `${((pad.l + slot * hover + slot / 2) / W) * 100}%`, top: `${(y(data[hover].value) / H) * 100}%` }}>
              <b>{data[hover].label}</b>: {format(data[hover].value)}
              {data[hover].detail && <div style={{ opacity: 0.8 }}>{data[hover].detail}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
