"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MarketState } from "@/lib/market";
import { api, useToast } from "../components/providers";
import { Callout, EmptyState, Icon, Spinner, fmtWhen } from "../components/ui";

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

  useEffect(() => {
    api<{ market: MarketState | null; defaultAudience: string }>("/api/keywords/market")
      .then((d) => {
        setMarket(d.market);
        setAudience(d.market?.audience || d.defaultAudience);
        setFocus(d.market?.focus ?? "");
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
    <div className="card" id="market" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <h2><Icon name="search" /> Trending for your audience</h2>
        <span className="hint">{market ? `Researched ${fmtWhen(market.at)} · ${market.via}` : "Claude searches the web, with sources"}</span>
      </div>

      <div className="grid" style={{ alignItems: "end" }}>
        <label className="field">
          Target audience
          <input type="text" value={audience} onChange={(e) => setAudience(e.target.value)} disabled={busy} />
        </label>
        <label className="field">
          <span>Focus <span className="meta">(optional, e.g. &quot;web performance&quot;, &quot;multi-tenant SaaS&quot;)</span></span>
          <input type="text" value={focus} onChange={(e) => setFocus(e.target.value)} disabled={busy} />
        </label>
      </div>
      <div className="row">
        <button onClick={run} disabled={busy || !audience.trim()}>
          {busy ? <><Spinner /> Searching the web (1-3 minutes)…</> : <><Icon name="search" /> {market ? "Refresh trending keywords" : "Find trending keywords"}</>}
        </button>
        <span className="meta">Uses your Claude account&apos;s web search. Topics without a source are dropped.</span>
      </div>

      {loading ? null : !market ? (
        <EmptyState icon="search" title="No research yet">Find what your audience is talking about right now, then pick keywords to work into posts on the Publish page.</EmptyState>
      ) : (
        <div className="stack" style={{ marginTop: 14 }}>
          {market.notes && <Callout kind="info">{market.notes} Check the sources before you rely on a claim.</Callout>}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Topic</th><th>What&apos;s happening</th><th>Your angle</th><th>Sources</th><th></th></tr></thead>
              <tbody>
                {market.keywords.map((k) => (
                  <tr key={k.keyword}>
                    <td style={{ minWidth: 140 }}><b>{k.keyword}</b>{k.hashtag && <div className="meta">{k.hashtag}</div>}</td>
                    <td style={{ minWidth: 220 }}>{k.why}</td>
                    <td style={{ minWidth: 200 }} className={k.angle ? "" : "faint"}>{k.angle || "No angle from your proof list"}</td>
                    <td style={{ minWidth: 160 }}>
                      {k.sources.map((s) => (
                        <div key={s.url}>
                          <a href={s.url} target="_blank" rel="noreferrer noopener" title={s.title}>{host(s.url)}</a>
                          {s.date && <span className="meta"> · {s.date}</span>}
                        </div>
                      ))}
                    </td>
                    <td>
                      <Link className="btn small" href={`/compose?trend=${encodeURIComponent(k.keyword)}`} title="Claude drafts a post connecting this topic to your own experience">
                        <Icon name="pen" size={13} /> Draft post
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
