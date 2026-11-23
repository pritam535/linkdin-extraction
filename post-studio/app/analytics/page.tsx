"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { buckets, engagement, growth, keywordStats, keywords, postDate, startOf, addPeriod, type Period } from "@/lib/analytics";
import type { QueueItem } from "@/lib/queue";
import BarChart from "../components/BarChart";
import ComparePosts from "./ComparePosts";
import MetricsDialog from "../components/MetricsDialog";
import { usePostActions } from "../components/postActions";
import { useStudio } from "../components/providers";
import { RangeControls, useRange } from "../components/useRange";
import { Callout, EmptyState, Icon, PageHead, Skeleton, Stat, firstLine, fmtNum, fmtWhen } from "../components/ui";

function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  const g = growth(now, before);
  if (g === null) return <>{now > 0 ? "New this period" : `— vs ${label}`}</>;
  return <><span className={g > 0 ? "up" : g < 0 ? "down" : ""}>{g > 0 ? "▲" : g < 0 ? "▼" : ""} {Math.abs(g).toFixed(0)}%</span> vs {label}</>;
}

const sum = (ps: QueueItem[], f: (p: QueueItem) => number) => ps.reduce((a, p) => a + f(p), 0);

export default function AnalyticsPage() {
  const { data } = useStudio();
  const actions = usePostActions();
  const r = useRange("7d");
  const [period, setPeriod] = useState<Period>("day");
  const [q, setQ] = useState("");
  const [includeDry, setIncludeDry] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [metricsFor, setMetricsFor] = useState<QueueItem | null>(null);

  useEffect(() => setPeriod(r.suggested), [r.suggested]);

  const published = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.items ?? []).filter(
      (p) =>
        p.status === "posted" &&
        (includeDry || p.mode === "live") &&
        (!needle || p.text.toLowerCase().includes(needle) || keywords(p.text).some((k) => k.includes(needle))),
    );
  }, [data, q, includeDry]);

  const inRange = published.filter((p) => postDate(p) >= r.from && postDate(p) < r.to);
  const inPrev = published.filter((p) => postDate(p) >= r.prevFrom && postDate(p) < r.prevTo);
  const measured = inRange.filter((p) => p.metrics);
  const measuredPrev = inPrev.filter((p) => p.metrics);
  const impressions = sum(measured, (p) => p.metrics!.impressions);
  const engagements = sum(measured, (p) => engagement(p)!);
  const rate = impressions ? (engagements / impressions) * 100 : null;
  const bks = buckets(inRange, period, r.from, new Date(r.to.getTime() - 1));

  // Fixed week-over-week strip: this week so far vs the same days last week.
  const now = new Date();
  const thisWeek = startOf(now, "week");
  const lastWeek = addPeriod(thisWeek, "week", -1);
  const sameSpanLastWeek = new Date(lastWeek.getTime() + (now.getTime() - thisWeek.getTime()));
  const wk = published.filter((p) => postDate(p) >= thisWeek && postDate(p) <= now);
  const lwk = published.filter((p) => postDate(p) >= lastWeek && postDate(p) <= sameSpanLastWeek);

  const top = [...measured].sort((a, b) => engagement(b)! - engagement(a)! || b.metrics!.impressions - a.metrics!.impressions).slice(0, 10);
  const kw = keywordStats(inRange, inPrev).slice(0, 10);
  const missing = inRange.filter((p) => !p.metrics);
  const dryCount = (data?.items ?? []).filter((p) => p.status === "posted" && p.mode === "dry-run").length;

  return (
    <div className="page">
      <PageHead title="Analytics" sub="Daily and weekly performance of what you've published." />

      <div className="card" style={{ padding: 12, marginBottom: 16 }}>
        <div className="row tight" style={{ gap: 12 }}>
          <RangeControls r={r} />
          <div className="seg" role="group" aria-label="Group by">
            <button className={period === "day" ? "on" : ""} onClick={() => setPeriod("day")} aria-pressed={period === "day"}>Daily</button>
            <button className={period === "week" ? "on" : ""} onClick={() => setPeriod("week")} aria-pressed={period === "week"}>Weekly</button>
          </div>
          <span className="spacer" />
          <input type="search" placeholder="Filter by keyword" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 200 }} aria-label="Filter by keyword" />
          <label className="row tight meta" style={{ gap: 6 }}>
            <input type="checkbox" checked={includeDry} onChange={(e) => setIncludeDry(e.target.checked)} /> Include dry runs
          </label>
        </div>
      </div>

      {!data ? (
        <div className="grid-4"><Skeleton h={90} /><Skeleton h={90} /><Skeleton h={90} /><Skeleton h={90} /></div>
      ) : (
        <div className="stack">
          {includeDry && dryCount > 0 && (
            <Callout kind="info">
              {dryCount} published post{dryCount === 1 ? " was a dry run" : "s were dry runs"}: recorded here but never sent to LinkedIn. Untick &quot;Include dry runs&quot; to see only real posts.
            </Callout>
          )}

          <div className="grid-4">
            <Stat label="Published" value={inRange.length} sub={<Delta now={inRange.length} before={inPrev.length} label={r.prevLabel} />} />
            <Stat
              label="Impressions"
              value={measured.length ? fmtNum(impressions) : "—"}
              sub={measured.length ? <Delta now={impressions} before={sum(measuredPrev, (p) => p.metrics!.impressions)} label={r.prevLabel} /> : "Add metrics to see this"}
            />
            <Stat
              label="Engagements"
              value={measured.length ? fmtNum(engagements) : "—"}
              sub={measured.length ? <Delta now={engagements} before={sum(measuredPrev, (p) => engagement(p)!)} label={r.prevLabel} /> : "Reactions + comments + reposts"}
            />
            <Stat label="Engagement rate" value={rate === null ? "—" : `${rate.toFixed(1)}%`} sub={`${measured.length} of ${inRange.length} posts have metrics`} />
          </div>

          <div className="card">
            <div className="card-head"><h2>Week over week</h2><span className="hint">This week so far vs the same days last week</span></div>
            <div className="grid-4" style={{ gap: 16 }}>
              <div><div className="meta">Published</div><b style={{ fontSize: 20 }}>{wk.length}</b> <span className="meta">vs {lwk.length} · <Delta now={wk.length} before={lwk.length} label="last week" /></span></div>
              <div><div className="meta">Engagements</div><b style={{ fontSize: 20 }}>{fmtNum(sum(wk.filter((p) => p.metrics), (p) => engagement(p)!))}</b> <span className="meta">vs {fmtNum(sum(lwk.filter((p) => p.metrics), (p) => engagement(p)!))}</span></div>
              <div><div className="meta">Impressions</div><b style={{ fontSize: 20 }}>{fmtNum(sum(wk.filter((p) => p.metrics), (p) => p.metrics!.impressions))}</b> <span className="meta">vs {fmtNum(sum(lwk.filter((p) => p.metrics), (p) => p.metrics!.impressions))}</span></div>
              <div><div className="meta">Queued for this week</div><b style={{ fontSize: 20 }}>{data.items.filter((p) => p.status === "queued" && new Date(p.scheduledAt!) < addPeriod(thisWeek, "week", 1)).length}</b></div>
            </div>
          </div>

          <div className="grid">
            <div className="card">
              <div className="card-head"><h2>Publishing activity</h2><span className="hint">Posts published per {period}</span></div>
              {inRange.length === 0 ? (
                <EmptyState icon="chart" title="Nothing published in this range" action={<Link href="/compose" className="btn small"><Icon name="plus" size={14} /> New post</Link>}>
                  Try a longer range, or publish something.
                </EmptyState>
              ) : (
                <BarChart title="Posts" data={bks.map((b) => ({ label: b.label, value: b.posts.length, detail: b.posts.map((p) => firstLine(p.text).slice(0, 40)).join(" · ") || undefined }))} />
              )}
            </div>
            <div className="card">
              <div className="card-head"><h2>Engagement trend</h2><span className="hint">Engagements per {period}, by publish date</span></div>
              {measured.length === 0 ? (
                <EmptyState icon="chart" title="No metrics yet">
                  Post Studio can&apos;t read LinkedIn analytics with your app&apos;s permissions. Open each post on LinkedIn, copy its numbers, and add them under Top posts below or on the Posts page.
                </EmptyState>
              ) : (
                <BarChart title="Engagements" data={bks.map((b) => ({ label: b.label, value: sum(b.posts.filter((p) => p.metrics), (p) => engagement(p)!) }))} />
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h2>Compare posts</h2><span className="hint">Impressions at the same age after posting · pick up to 4</span></div>
            <ComparePosts posts={includeDry ? data.items : data.items.filter((p) => p.mode === "live")} />
          </div>

          <div className="split">
            <div className="card">
              <div className="card-head"><h2>Top posts</h2><span className="hint">By engagements · click a row for details</span></div>
              {top.length === 0 ? (
                <p className="meta" style={{ margin: 0 }}>No posts with metrics in this range.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Post</th><th className="num">Impr.</th><th className="num">Eng.</th><th className="num">Rate</th></tr></thead>
                    <tbody>
                      {top.map((p) => (
                        <Fragment key={p.id}>
                          <tr onClick={() => setOpen(open === p.id ? null : p.id)} style={{ cursor: "pointer" }} aria-expanded={open === p.id}>
                            <td style={{ maxWidth: 320 }}><div className="truncate">{firstLine(p.text)}</div><div className="meta">{fmtWhen(p.postedAt)}</div></td>
                            <td className="num">{fmtNum(p.metrics!.impressions)}</td>
                            <td className="num">{fmtNum(engagement(p)!)}</td>
                            <td className="num">{p.metrics!.impressions ? `${((engagement(p)! / p.metrics!.impressions) * 100).toFixed(1)}%` : "—"}</td>
                          </tr>
                          {open === p.id && (
                            <tr>
                              <td colSpan={4} style={{ background: "var(--panel-2)" }}>
                                <div className="row tight" style={{ gap: 16 }}>
                                  <span>{p.metrics!.reactions} reactions</span><span>{p.metrics!.comments} comments</span><span>{p.metrics!.reposts} reposts</span>
                                  {p.score !== null && <span>Human score {p.score.toFixed(0)}</span>}
                                  {p.mode === "dry-run" && <span className="tag">dry run</span>}
                                  <span className="spacer" />
                                  <button className="secondary small" onClick={() => setMetricsFor(p)}>Update metrics</button>
                                  <Link className="btn secondary small" href={`/posts/${p.id}`}>Performance</Link>
                                </div>
                                <div className="chips" style={{ marginTop: 8 }}>
                                  {[...new Set(keywords(p.text))].slice(0, 12).map((k) => <Link key={k} className="chip" href={`/keywords?k=${encodeURIComponent(k)}`}>{k}</Link>)}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {missing.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <b style={{ fontSize: 13 }}>Waiting for metrics ({missing.length})</b>
                  <div className="items" style={{ marginTop: 8 }}>
                    {missing.slice(0, 5).map((p) => (
                      <div key={p.id} className="row tight" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                        <span className="truncate meta" style={{ minWidth: 0, flex: 1 }}>{firstLine(p.text)}</span>
                        <button className="secondary small" onClick={() => setMetricsFor(p)}>Add metrics</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-head"><h2>Top keywords</h2><Link href="/keywords" className="hint">All keywords</Link></div>
              {kw.length === 0 ? (
                <p className="meta" style={{ margin: 0 }}>No published posts in this range.</p>
              ) : (
                <table>
                  <thead><tr><th>#</th><th>Keyword</th><th className="num">Uses</th><th className="num">Posts</th></tr></thead>
                  <tbody>
                    {kw.map((k, i) => (
                      <tr key={k.keyword}>
                        <td className="meta">{i + 1}</td>
                        <td><Link href={`/keywords?k=${encodeURIComponent(k.keyword)}`}>{k.keyword}</Link></td>
                        <td className="num">{k.count}</td>
                        <td className="num">{k.posts.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {metricsFor && <MetricsDialog post={metricsFor} onClose={() => setMetricsFor(null)} onSave={(m) => actions.saveMetrics(metricsFor, m)} />}
    </div>
  );
}
