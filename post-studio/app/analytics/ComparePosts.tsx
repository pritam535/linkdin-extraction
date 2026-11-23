"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ageHours, dayWise, historyOf, readingBy } from "@/lib/analytics";
import type { QueueItem } from "@/lib/queue";
import CompareChart from "../components/CompareChart";
import { fmtAge } from "../components/LineChart";
import { firstLine, fmtNum, fmtWhen } from "../components/ui";

const COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
const SPANS = [[24, "First 24h"], [72, "3 days"], [168, "7 days"]] as const;
const AT = [6, 24, 48, 168];

/** Compare posts at the same age, so an older post doesn't win just by having had more time. */
export default function ComparePosts({ posts }: { posts: QueueItem[] }) {
  const withData = useMemo(
    () => posts.filter((p) => p.status === "posted" && historyOf(p).length).sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? "")),
    [posts],
  );
  // Each picked post holds a color slot (0-3) until it's unpicked, so colors follow the post, never its position.
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null, null]);
  const picked = slots.filter((x): x is string => !!x);
  const [span, setSpan] = useState<number>(24);
  useEffect(() => setSlots((cur) => {
    const kept = cur.map((id) => (id && withData.some((p) => p.id === id) ? id : null));
    return kept.some(Boolean) ? kept : [0, 1, 2, 3].map((i) => withData[i]?.id ?? null);
  }), [withData]);

  const chosen = picked.map((id) => withData.find((p) => p.id === id)!).filter(Boolean);
  const color = (id: string) => COLORS[slots.indexOf(id)] ?? "var(--border-strong)";
  const toggle = (id: string) => setSlots((cur) => {
    if (cur.includes(id)) return cur.map((x) => (x === id ? null : x));
    const free = cur.indexOf(null);
    return free < 0 ? cur : cur.map((x, i) => (i === free ? id : x));
  });

  if (!withData.length)
    return <p className="meta" style={{ margin: 0 }}>Add readings to your published posts (Posts → Performance) to compare them here.</p>;

  const series = chosen.map((p) => ({
    id: p.id,
    name: firstLine(p.text),
    color: color(p.id),
    points: historyOf(p).map((s) => ({ x: ageHours(p, s.at), y: s.impressions, approx: s.approx })),
  }));

  const cell = (p: QueueItem, h: number) => {
    const r = readingBy(p, h);
    if (!r) return <span className="faint">—</span>;
    const age = ageHours(p, r.at);
    return <>{fmtNum(r.impressions)}{age < h * 0.8 && <span className="faint" title={`Latest reading before ${fmtAge(h)} was at ${fmtAge(age)}`}> ({fmtAge(age)})</span>}</>;
  };

  return (
    <div className="stack">
      <div className="row tight" style={{ gap: 8 }}>
        {withData.slice(0, 12).map((p) => (
          <button key={p.id} type="button" className={`cmp-chip${picked.includes(p.id) ? " on" : ""}`} aria-pressed={picked.includes(p.id)} onClick={() => toggle(p.id)}
            disabled={!picked.includes(p.id) && picked.length >= 4} title={`${firstLine(p.text)} · ${fmtWhen(p.postedAt)}`}>
            <i style={picked.includes(p.id) ? { background: color(p.id) } : undefined} />
            <span>{firstLine(p.text)}</span>
          </button>
        ))}
        <span className="spacer" />
        <div className="seg" role="group" aria-label="Time span">
          {SPANS.map(([h, l]) => <button key={h} className={span === h ? "on" : ""} aria-pressed={span === h} onClick={() => setSpan(h)}>{l}</button>)}
        </div>
      </div>
      {withData.length === 1 && <p className="meta" style={{ margin: 0 }}>Only one post has readings so far. Each new post you add readings to appears here as its own line.</p>}
      {chosen.length > 0 && <CompareChart series={series} xMax={span} />}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Post</th>{AT.map((h) => <th key={h} className="num">At {fmtAge(h)}</th>)}<th className="num">Day 1 added</th><th className="num">Latest</th><th className="num">Eng. rate</th></tr>
          </thead>
          <tbody>
            {chosen.map((p) => {
              const last = historyOf(p).at(-1)!;
              const eng = last.reactions + last.comments + last.reposts;
              const d1 = dayWise(p)[0];
              return (
                <tr key={p.id}>
                  <td style={{ maxWidth: 280 }}>
                    <div className="row tight" style={{ flexWrap: "nowrap", gap: 8 }}>
                      <i style={{ width: 10, height: 10, borderRadius: 3, background: color(p.id), flex: "none" }} />
                      <Link className="truncate" href={`/posts/${p.id}`} style={{ color: "var(--text)" }}>{firstLine(p.text)}</Link>
                    </div>
                    <div className="meta">{fmtWhen(p.postedAt)}</div>
                  </td>
                  {AT.map((h) => <td key={h} className="num">{cell(p, h)}</td>)}
                  <td className="num">{d1?.gain == null ? "—" : fmtNum(d1.gain)}</td>
                  <td className="num">{fmtNum(last.impressions)} <span className="faint">({fmtAge(ageHours(p, last.at))})</span></td>
                  <td className="num">{last.impressions ? `${((eng / last.impressions) * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="meta" style={{ margin: 0 }}>
        &quot;At 24h&quot; = the latest reading at or before 24 hours. A grey age in brackets means the nearest reading was earlier than that, so the true number is higher.
      </p>
    </div>
  );
}
