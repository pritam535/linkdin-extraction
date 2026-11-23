"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { dayWise, historyOf, intervals, nextReading } from "@/lib/analytics";
import BarChart from "../../components/BarChart";
import type { Snapshot } from "@/lib/queue";
import LineChart, { fmtAge, type LinePoint } from "../../components/LineChart";
import MetricsDialog from "../../components/MetricsDialog";
import { usePostActions } from "../../components/postActions";
import { useStudio } from "../../components/providers";
import { Callout, EmptyState, Icon, PageHead, Skeleton, Stat, StatusBadge, firstLine, fmtNum, fmtWhen } from "../../components/ui";

const eng = (s: Snapshot) => s.reactions + s.comments + s.reposts;
const signed = (n: number) => (n > 0 ? `+${fmtNum(n)}` : n < 0 ? `−${fmtNum(-n)}` : "±0");

/** A published post's numbers over time: stats, two line charts and a timeline of readings with screenshots. */
export default function PostPerformance({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data } = useStudio();
  const actions = usePostActions();
  const [adding, setAdding] = useState(false);
  const [zoom, setZoom] = useState<Snapshot | null>(null);
  const [by, setBy] = useState<"hour" | "day">("hour");

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  if (!data) return <div className="page"><Skeleton h={60} /><div className="grid-4" style={{ marginTop: 16 }}><Skeleton h={90} /><Skeleton h={90} /><Skeleton h={90} /><Skeleton h={90} /></div></div>;
  const p = data.items.find((x) => x.id === id);
  if (!p) return <div className="page"><EmptyState icon="alert" title="Post not found" action={<Link className="btn" href="/posts">All posts</Link>}>It may have been deleted from Post Studio.</EmptyState></div>;
  if (p.status !== "posted") return <div className="page"><EmptyState icon="chart" title="Not published yet" action={<Link className="btn" href={`/compose?id=${p.id}`}>Open in Write</Link>}>Performance appears once the post is published.</EmptyState></div>;

  const h = historyOf(p);
  const posted = new Date(p.postedAt ?? p.createdAt).getTime();
  const age = (s: Snapshot) => Math.max(0, (new Date(s.at).getTime() - posted) / 3600_000);
  const last = h.at(-1);
  const prev = h.at(-2);
  const linkedinUrl = p.mode === "live" && p.postId ? `https://www.linkedin.com/feed/update/${encodeURIComponent(p.postId)}/` : null;
  const when = (s: Snapshot) => `${s.approx ? "about " : ""}${fmtAge(age(s))} after posting`;

  const series = (f: (s: Snapshot) => number): LinePoint[] => [
    { x: 0, y: 0, label: fmtWhen(p.postedAt), origin: true },
    ...h.map((s) => ({ x: age(s), y: f(s), label: fmtWhen(s.at), note: s.approx ? "(approx.)" : undefined })),
  ];
  const next = nextReading(p);
  const iv = intervals(p);
  const days = dayWise(p);
  const dayDate = (d: number) => new Date(posted + (d - 1) * 86_400_000).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const rate = last && last.impressions ? (eng(last) / last.impressions) * 100 : null;
  const perHour = last && prev && age(last) > age(prev) ? (last.impressions - prev.impressions) / (age(last) - age(prev)) : null;

  return (
    <div className="page">
      <div className="meta" style={{ marginBottom: 8 }}><Link href="/posts">Posts</Link> / Performance</div>
      <PageHead title="Post performance" sub={<span className="clamp-2">{firstLine(p.text)}</span>}>
        {linkedinUrl && <a className="btn secondary" href={linkedinUrl} target="_blank" rel="noreferrer"><Icon name="link" /> Open on LinkedIn</a>}
        <button onClick={() => setAdding(true)}><Icon name="plus" /> Add reading</button>
      </PageHead>

      <div className="row tight meta" style={{ marginBottom: 16, gap: 10 }}>
        <StatusBadge post={p} />
        <span>Published {fmtWhen(p.postedAt)}</span>
        <span>· {h.length} reading{h.length === 1 ? "" : "s"}</span>
        {p.mode !== "live" && <span className="problem">· Dry run: never sent to LinkedIn</span>}
      </div>

      {next && (
        <div style={{ marginBottom: 16 }}><Callout kind={next.overdue ? "warn" : "info"}>
          <b>{next.overdue ? "Reading due" : "Next reading"}: {fmtAge(next.hours)} after posting</b> ({fmtWhen(next.at.toISOString())}).{" "}
          Open the post on LinkedIn and add a reading with a screenshot. Readings at 1h, 3h, 6h, 12h, 24h, 48h, 72h and 7 days give the clearest hourly and daily picture.{" "}
          {next.overdue && <button className="small" style={{ marginLeft: 6 }} onClick={() => setAdding(true)}>Add reading</button>}
        </Callout></div>
      )}

      {!last ? (
        <div className="card">
          <EmptyState icon="chart" title="No readings yet" action={<button onClick={() => setAdding(true)}><Icon name="plus" /> Add the first reading</button>}>
            Open the post on LinkedIn, copy the impressions and reactions, and attach the screenshot. Add another every few hours to build the timeline.
          </EmptyState>
        </div>
      ) : (
        <div className="stack">
          <div className="grid-4">
            <Stat label="Impressions" value={fmtNum(last.impressions)} sub={prev ? <><span className="up">{signed(last.impressions - prev.impressions)}</span> since previous reading</> : when(last)} />
            <Stat label="Reactions" value={fmtNum(last.reactions)} sub={prev ? `${signed(last.reactions - prev.reactions)} since previous` : when(last)} />
            <Stat label="Comments · reposts" value={`${fmtNum(last.comments)} · ${fmtNum(last.reposts)}`} sub={last.comments === 0 ? "Replies to comments help reach" : `${signed(last.comments - (prev?.comments ?? 0))} comments since previous`} />
            <Stat label="Engagement rate" value={rate === null ? "—" : `${rate.toFixed(1)}%`} sub={`${fmtNum(eng(last))} engagements ÷ impressions`} />
          </div>

          {h.length < 2 && <Callout kind="info">One reading so far. Add another in a few hours to see how fast it&apos;s growing.</Callout>}

          <div className="grid">
            <div className="card">
              <div className="card-head"><h2>Impressions over time</h2><span className="hint">{perHour !== null ? `${fmtNum(perHour)}/hour between the last two readings` : "Hours since posting"}</span></div>
              <LineChart title="Impressions" points={series((s) => s.impressions)} />
            </div>
            <div className="card">
              <div className="card-head"><h2>Engagements over time</h2><span className="hint">Reactions + comments + reposts</span></div>
              <LineChart title="Engagements" points={series(eng)} />
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>{by === "hour" ? "Hour by hour" : "Day by day"}</h2>
              <div className="seg" role="group" aria-label="Group by">
                <button className={by === "hour" ? "on" : ""} aria-pressed={by === "hour"} onClick={() => setBy("hour")}>Hourly</button>
                <button className={by === "day" ? "on" : ""} aria-pressed={by === "day"} onClick={() => setBy("day")}>Daily</button>
              </div>
            </div>
            {by === "hour" ? (
              <>
                <p className="meta" style={{ margin: "0 0 8px" }}>Impressions per hour between readings. More readings in the first 24 hours give finer bars.</p>
                <BarChart
                  title="Impressions per hour"
                  format={(n) => fmtNum(Math.round(n * 10) / 10)}
                  data={iv.filter((x) => x.perHour !== null).map((x) => ({
                    label: `${x.fromH === 0 ? "0" : fmtAge(x.fromH)}–${fmtAge(x.toH)}`,
                    value: Math.round(x.perHour! * 10) / 10,
                    detail: `+${fmtNum(x.gain)} impressions, +${fmtNum(x.engGain)} engagements over ${fmtAge(x.toH - x.fromH)}${x.approx ? " (approx. times)" : ""}`,
                  }))}
                />
                <div className="table-wrap" style={{ marginTop: 10 }}>
                  <table>
                    <thead><tr><th>Between</th><th className="num">Impressions added</th><th className="num">Per hour</th><th className="num">Engagements added</th></tr></thead>
                    <tbody>{iv.map((x, i) => (
                      <tr key={i}>
                        <td>{x.fromH === 0 ? "Publish" : fmtAge(x.fromH)} → {fmtAge(x.toH)}{x.approx ? " (approx.)" : ""}</td>
                        <td className="num">+{fmtNum(x.gain)}</td>
                        <td className="num">{x.perHour === null ? <span className="faint" title="Both readings have the same (rounded) time">same time</span> : fmtNum(Math.round(x.perHour * 10) / 10)}</td>
                        <td className="num">+{fmtNum(x.engGain)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                <p className="meta" style={{ margin: "0 0 8px" }}>Impressions added on each day of the post&apos;s life (Day 1 = first 24 hours), up to the last reading that day.</p>
                <BarChart
                  title="Impressions added"
                  data={days.filter((d) => d.gain !== null).map((d) => ({
                    label: `Day ${d.day}`,
                    value: d.gain!,
                    detail: `${dayDate(d.day)} · as of the ${fmtAge(d.asOfH!)} reading${d.complete ? "" : " · day not over yet"}`,
                  }))}
                />
                <div className="table-wrap" style={{ marginTop: 10 }}>
                  <table>
                    <thead><tr><th>Day</th><th className="num">Impressions added</th><th className="num">Engagements added</th><th className="num">Total</th><th>Measured at</th></tr></thead>
                    <tbody>{days.map((d) => (
                      <tr key={d.day}>
                        <td>Day {d.day} <span className="faint">· {dayDate(d.day)}</span></td>
                        <td className="num">{d.gain === null ? <span className="faint">no reading</span> : `+${fmtNum(d.gain)}`}</td>
                        <td className="num">{d.engGain === null ? "—" : `+${fmtNum(d.engGain)}`}</td>
                        <td className="num">{d.total === null ? "—" : fmtNum(d.total)}</td>
                        <td>{d.asOfH === null ? "—" : `${fmtAge(d.asOfH)} after posting`}{!d.complete && <span className="faint"> · day not over</span>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <div className="card-head"><h2>Timeline</h2><span className="hint">Newest first · click a screenshot to enlarge</span></div>
            <ol className="timeline">
              {[...h].reverse().map((s) => {
                const i = h.indexOf(s);
                const before = h[i - 1];
                return (
                  <li key={s.id}>
                    <span className="dot" />
                    <div style={{ minWidth: 0 }}>
                      <div className="when">{when(s)} <span className="meta" style={{ fontWeight: 400 }}>· {fmtWhen(s.at)}{s.approx ? " (approx.)" : ""}</span></div>
                      <div className="nums">
                        <span><b>{fmtNum(s.impressions)}</b> impressions{before && <span className="gain"> {signed(s.impressions - before.impressions)}</span>}</span>
                        <span><b>{fmtNum(s.reactions)}</b> reactions{before && s.reactions !== before.reactions && <span className="gain"> {signed(s.reactions - before.reactions)}</span>}</span>
                        <span><b>{fmtNum(s.comments)}</b> comments</span>
                        <span><b>{fmtNum(s.reposts)}</b> reposts</span>
                      </div>
                      <button className="ghost small" style={{ marginTop: 6, marginLeft: -8 }} onClick={() => actions.deleteReading(p, s.id, `${fmtNum(s.impressions)} impressions, ${when(s)}`)}>
                        <Icon name="trash" size={13} /> Delete
                      </button>
                    </div>
                    {s.shot
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <button className="shot-thumb" onClick={() => setZoom(s)} aria-label={`Enlarge screenshot from ${when(s)}`}><img src={`/api/posts/${p.id}/snapshots/${s.id}`} alt="" /></button>
                      : <span className="faint meta" style={{ alignSelf: "center" }}>No screenshot</span>}
                  </li>
                );
              })}
              <li className="origin">
                <span className="dot" />
                <div><div className="when">Published <span className="meta" style={{ fontWeight: 400 }}>· {fmtWhen(p.postedAt)}</span></div><div className="nums">{p.mode === "live" ? "Sent to LinkedIn" : "Dry run"}</div></div>
                <span />
              </li>
            </ol>
          </div>
        </div>
      )}

      {adding && <MetricsDialog post={p} onClose={() => setAdding(false)} onSave={(f) => actions.saveMetrics(p, f)} />}
      {zoom && (
        <div className="lightbox" onClick={() => setZoom(null)} role="dialog" aria-label="Screenshot">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/posts/${p.id}/snapshots/${zoom.id}`} alt={`LinkedIn screenshot, ${when(zoom)}`} />
            <div className="cap">{when(zoom)} · {fmtNum(zoom.impressions)} impressions · {fmtNum(zoom.reactions)} reactions · Esc to close</div>
          </div>
        </div>
      )}
    </div>
  );
}
