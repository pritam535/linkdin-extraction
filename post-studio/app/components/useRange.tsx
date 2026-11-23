"use client";

import { useMemo, useState } from "react";
import type { Period } from "@/lib/analytics";

export type Preset = "today" | "7d" | "30d" | "90d" | "custom";

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Date-range state shared by Analytics and Keywords. `prevFrom/prevTo` is the period of the same length just before. */
export function useRange(initial: Preset = "7d") {
  const [preset, setPreset] = useState<Preset>(initial);
  const [customFrom, setCustomFrom] = useState(() => iso(new Date(Date.now() - 13 * 86_400_000)));
  const [customTo, setCustomTo] = useState(() => iso(new Date()));

  const range = useMemo(() => {
    const today = dayStart(new Date());
    let from: Date;
    let to: Date; // exclusive
    if (preset === "custom") {
      from = new Date(`${customFrom}T00:00`);
      to = new Date(new Date(`${customTo}T00:00`).getTime() + 86_400_000);
      if (!(from < to)) [from, to] = [today, new Date(today.getTime() + 86_400_000)];
    } else {
      const days = preset === "today" ? 1 : preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
      to = new Date(today.getTime() + 86_400_000);
      from = new Date(to.getTime() - days * 86_400_000);
    }
    const len = to.getTime() - from.getTime();
    const days = Math.round(len / 86_400_000);
    const suggested: Period = days > 31 ? "week" : "day";
    return { from, to, prevFrom: new Date(from.getTime() - len), prevTo: from, days, suggested };
  }, [preset, customFrom, customTo]);

  const label = preset === "today" ? "yesterday" : `previous ${range.days} days`;
  return { preset, setPreset, customFrom, setCustomFrom, customTo, setCustomTo, ...range, prevLabel: label };
}

export const PRESETS: [Preset, string][] = [
  ["today", "Today"],
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["90d", "90 days"],
  ["custom", "Custom"],
];

export function RangeControls({ r }: { r: ReturnType<typeof useRange> }) {
  return (
    <div className="row tight" style={{ gap: 8 }}>
      <div className="seg" role="group" aria-label="Date range">
        {PRESETS.map(([k, l]) => (
          <button key={k} className={r.preset === k ? "on" : ""} onClick={() => r.setPreset(k)} aria-pressed={r.preset === k}>{l}</button>
        ))}
      </div>
      {r.preset === "custom" && (
        <span className="row tight" style={{ gap: 6 }}>
          <input type="date" value={r.customFrom} max={r.customTo} onChange={(e) => r.setCustomFrom(e.target.value)} aria-label="From" style={{ width: 150 }} />
          <span className="meta">to</span>
          <input type="date" value={r.customTo} min={r.customFrom} onChange={(e) => r.setCustomTo(e.target.value)} aria-label="To" style={{ width: 150 }} />
        </span>
      )}
    </div>
  );
}
