"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MarketState } from "@/lib/market";
import { api, useToast } from "../components/providers";
import { EmptyState, Icon, Spinner, fmtWhen } from "../components/ui";

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

/** What the target audience is discussing now: Claude + web search, every topic with its sources. */
export default function MarketCard() {
  const toast = useToast();
  const [market, setMarket] = useState<MarketState | null>(null);
  const [audience, setAudience] = useState("");
  const [focus, setFocus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string[]>([]); // topics to combine into one post (max 4)
  const MAX = 4;
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length >= MAX ? p : [...p, k]));
  const draftHref = `/compose?${picked.map((k) => `trend=${encodeURIComponent(k)}`).join("&")}`;

  useEffect(() => {
    api<{ market: MarketState | null; defaultAudience: string; defaultFocus: string }>("/api/keywords/market")
      .then((d) => {
        setMarket(d.market);
        // What you saved in Onboarding → About you.
        setAudience(d.defaultAudience);
        setFocus(d.defaultFocus);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function run() {
    setBusy(true);
    try {
      const d = await api<{ market: MarketState }>("/api/keywords/market", { method: "POST", json: { audience, focus } });
      setMarket(d.market);
      toast("success", `Found ${d.market.keywords.length} topics with sources.`);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row" style={{ marginTop: 0 }}>
        <button onClick={run} disabled={busy || loading || !audience.trim()}>
          {busy ? <><Spinner /> Searching the web (1-3 minutes)…</> : <><Icon name="search" /> {market ? "Refresh trending topics" : "Find trending topics"}</>}
        </button>
        <span className="meta">
          {market ? `Last researched ${fmtWhen(market.at)}. ` : ""}Claude searches the web; topics without a source are dropped.
        </span>
      </div>
      {!loading && !audience.trim() && (
        <p className="warning" style={{ margin: "8px 0 0" }}>Add who you write for in <Link href="/onboarding#about">Onboarding → About you</Link> first.</p>
      )}

      {loading ? null : !market ? (
        <EmptyState icon="search" title="No research yet">Find what your audience is talking about right now. Every topic comes with sources and a &quot;Draft post&quot; button.</EmptyState>
      ) : (
        <div className="stack" style={{ marginTop: 14 }}>
          {market.notes && (
            <details className="notes">
              <summary>About these results ({market.keywords.length} topics)</summary>
              <p>{market.notes} Check the sources before you rely on a claim.</p>
            </details>
          )}
          <div className="trend-grid">
            {market.keywords.map((k) => {
              const on = picked.includes(k.keyword);
              const full = !on && picked.length >= MAX;
              return (
              <article key={k.keyword} className={`trend-card ${on ? "picked" : ""}`}>
                <div className="trend-top">
                  <b className="trend-title">{k.keyword}</b>
                  <span className="row tight" style={{ marginTop: 0, flexWrap: "nowrap" }}>
                    {k.hashtag && <span className="tag">{k.hashtag}</span>}
                    <button type="button" className={`pick-btn ${on ? "on" : ""}`} aria-pressed={on} disabled={full} onClick={() => toggle(k.keyword)}
                      title={full ? "You can combine up to 4 topics" : on ? "Remove from your selection" : "Select to combine with other topics in one post"}>
                      {on ? <><Icon name="check" size={13} /> Selected</> : <><Icon name="plus" size={13} /> Select</>}
                    </button>
                  </span>
                </div>
                <p className="trend-why">{k.why}</p>
                <div className={`trend-angle ${k.angle ? "" : "none"}`}>
                  <span className="eg-label">Your angle</span>
                  {k.angle || "No angle from your proof list yet. Add a related number or story in your voice profile."}
                </div>
                <div className="trend-foot">
                  <div className="search-chips">
                    {k.sources.map((src) => (
                      <a key={src.url} className="source-chip" href={src.url} target="_blank" rel="noreferrer noopener" title={src.title}>
                        {host(src.url)}{src.date ? ` · ${src.date}` : ""}
                      </a>
                    ))}
                  </div>
                  <Link className="btn small secondary" href={`/compose?trend=${encodeURIComponent(k.keyword)}`} title="Claude drafts a post on just this topic">
                    <Icon name="pen" size={13} /> Draft post
                  </Link>
                </div>
              </article>
              );
            })}
          </div>
          {picked.length > 0 && (
            <div className="pick-bar" role="region" aria-label="Selected topics">
              <div style={{ minWidth: 0 }}>
                <b>{picked.length} topic{picked.length === 1 ? "" : "s"} selected</b>
                <div className="pick-list">{picked.map((k) => <span key={k} className="tag">{market.keywords.find((x) => x.keyword === k)?.hashtag || k}</span>)}</div>
              </div>
              <span className="row tight" style={{ marginTop: 0, flexWrap: "nowrap" }}>
                <button className="ghost small" onClick={() => setPicked([])}>Clear</button>
                <Link className="btn" href={draftHref} title="Claude writes one post that links these topics to your own experience">
                  <Icon name="sparkle" size={14} /> Draft one post with {picked.length === 1 ? "this" : "these"} →
                </Link>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
